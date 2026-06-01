import { FFmpeg } from "@ffmpeg/ffmpeg";
import { fetchFile } from "@ffmpeg/util";

// The wrapper's worker.js is self-hosted under /public/ffmpeg-wrapper/ so
// Vite leaves it untouched. Vite's auto-transform of the worker rewrites
// the worker's `import(coreURL)` to `import(coreURL + '?import')`, which
// causes the request to be served as `index.html` (SPA fallback) — i.e.
// the worker dies with "Failed to fetch dynamically imported module".
// Serving the raw worker bypasses that path entirely.
const CLASS_WORKER_URL = "/ffmpeg-wrapper/worker.js";
import {
  Scene,
  SceneTiming,
  CaptionStyle,
  VideoRenderProgress,
  SceneTransition,
} from "../types";
import {
  buildASS,
  buildCaptionChunks,
  renderResolution,
  WhisperWord,
} from "./captionService";

/**
 * ffmpeg.wasm wrapper that ties together scene images, the combined voiceover,
 * and an ASS subtitle track into a final mp4. Loaded lazily so the ~30MB wasm
 * core never lands in the initial bundle.
 *
 * Concurrency: a single FFmpeg() instance is reused across renders. We refuse
 * overlapping calls by tracking a busy flag — the UI also blocks via its own
 * render-state, so this is a belt + suspenders.
 */

let ffmpegInstance: FFmpeg | null = null;
let ffmpegLoadPromise: Promise<FFmpeg> | null = null;
let isBusy = false;

/** Wrap a promise with a deadline so a hung worker init doesn't UI-freeze. */
const withTimeout = <T>(p: Promise<T>, ms: number, label: string): Promise<T> =>
  Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s`)), ms),
    ),
  ]);

/**
 * Load and cache the FFmpeg singleton. The first call downloads the 32MB
 * wasm and initialises the worker (~5-15s same-origin); subsequent calls
 * return the cached instance immediately.
 *
 * The progress callback reports (ratio in [0..1], message) so the UI can
 * draw a real download bar for the wasm fetch. Without sub-progress the
 * load step appeared frozen at 10% for the entire wait.
 */
const getFFmpeg = async (
  onProgress?: (ratio: number, message: string) => void,
): Promise<FFmpeg> => {
  if (ffmpegInstance) return ffmpegInstance;
  // Coalesce concurrent callers onto the same in-flight load.
  if (ffmpegLoadPromise) return ffmpegLoadPromise;

  if (typeof SharedArrayBuffer === "undefined") {
    throw new Error(
      "Trình duyệt chưa cho phép SharedArrayBuffer. Cần COOP/COEP headers — thử Cmd+Shift+R.",
    );
  }

  ffmpegLoadPromise = (async () => {
    try {
      // Warm the browser's HTTP cache for the 32MB wasm so the user gets
      // visible progress. We then pass DIRECT same-origin URLs to
      // ffmpeg.load() — module workers can't reliably `import()` blob URLs
      // built in the parent context, so we avoid that path entirely.
      onProgress?.(0.02, "Tải ffmpeg-core.wasm (~31MB)…");
      const wasmRes = await fetch("/ffmpeg-core/ffmpeg-core.wasm");
      if (!wasmRes.ok) throw new Error(`wasm fetch ${wasmRes.status}`);
      const total = Number(wasmRes.headers.get("content-length")) || undefined;
      if (wasmRes.body) {
        const reader = wasmRes.body.getReader();
        let loaded = 0;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            loaded += value.byteLength;
            const mb = (loaded / 1024 / 1024).toFixed(1);
            if (total) {
              const r = loaded / total;
              onProgress?.(
                0.02 + r * 0.83,
                `Tải wasm: ${mb}MB / ${(total / 1024 / 1024).toFixed(0)}MB`,
              );
            } else {
              onProgress?.(0.5, `Tải wasm: ${mb}MB…`);
            }
          }
        }
      } else {
        // Older runtimes without streaming bodies.
        await wasmRes.arrayBuffer();
      }
      // After this, the wasm sits in the disk cache. The worker's own
      // fetch (a few seconds later) will reuse the cached bytes instantly.

      onProgress?.(0.88, "Khởi tạo ffmpeg worker…");
      const inst = new FFmpeg();
      inst.on("log", ({ message }) => {
        // Surface ffmpeg log lines so codec / demuxer failures aren't silent.
        console.debug("[ffmpeg]", message);
      });

      // Direct URLs all served same-origin from /public/. Module worker
      // does `import('/ffmpeg-core/ffmpeg-core.js')` and gets the raw ESM
      // core — no Vite transform interference.
      await withTimeout(
        inst.load({
          coreURL: "/ffmpeg-core/ffmpeg-core.js",
          wasmURL: "/ffmpeg-core/ffmpeg-core.wasm",
          classWorkerURL: CLASS_WORKER_URL,
        }),
        60_000,
        "ffmpeg.load()",
      );

      onProgress?.(1, "ffmpeg ready");
      ffmpegInstance = inst;
      return inst;
    } catch (err) {
      // Allow a fresh attempt next time — don't lock the user out behind a
      // failed instance.
      ffmpegInstance = null;
      throw err;
    } finally {
      ffmpegLoadPromise = null;
    }
  })();

  return ffmpegLoadPromise;
};

/**
 * Convert a data URL (image / audio) to a Uint8Array for FFmpeg's FS.
 * Handles both `data:` URLs (scenes saved by IDB) and blob URLs.
 */
const urlToUint8 = async (url: string): Promise<Uint8Array> => fetchFile(url);

interface BuildArgsParams {
  ordered: Array<{ scene: Scene; timing: SceneTiming; imageUrl: string }>;
  audioExt: string;
  w: number;
  h: number;
  transition: SceneTransition;
  transitionDuration: number;
}

/**
 * Generate the ffmpeg cli args for the chosen scene transition.
 *
 *  - cut: concat demuxer over the playlist we wrote (cheapest path).
 *  - fade: one `-loop 1 -t <dur> -i img.png` per scene, scaled to render
 *    resolution, chained through xfade transitions, then subtitles burned in.
 *  - ken_burns: same multi-input setup, each scene gets a zoompan ramp
 *    (1.0 → 1.08 across its own duration), then concat'd and subtitled.
 */
const buildEncodeArgs = ({
  ordered,
  audioExt,
  w,
  h,
  transition,
  transitionDuration,
}: BuildArgsParams): string[] => {
  const n = ordered.length;
  const fps = 24;
  const subtitleClause = "subtitles=captions.ass";

  // Cut path — fast concat demuxer.
  if (transition === 'cut' || n < 2) {
    return [
      "-y",
      "-f", "concat",
      "-safe", "0",
      "-i", "concat.txt",
      "-i", `audio.${audioExt}`,
      "-vf", `scale=${w}:${h}:flags=lanczos,${subtitleClause},format=yuv420p`,
      "-c:v", "libx264",
      "-preset", "ultrafast",
      "-tune", "stillimage",
      "-r", String(fps),
      "-c:a", "aac",
      "-b:a", "128k",
      "-shortest",
      "out.mp4",
    ];
  }

  // Multi-input setup — used by both fade and ken_burns paths.
  const args: string[] = ["-y"];
  for (let i = 0; i < n; i++) {
    const dur = Math.max(0.1, ordered[i].timing.end - ordered[i].timing.start);
    args.push(
      "-loop", "1",
      "-t", dur.toFixed(3),
      "-i", `img_${String(i).padStart(3, "0")}.png`,
    );
  }
  args.push("-i", `audio.${audioExt}`);
  const audioInputIndex = n;

  let filter: string;

  if (transition === 'fade') {
    // Scale each input to render resolution + format normalisation.
    const scaleLines = Array.from({ length: n }, (_, i) =>
      `[${i}:v]scale=${w}:${h}:flags=lanczos,setsar=1,format=yuv420p[v${i}]`
    );
    // Chain xfade. offset = cumulative duration so far minus transition time.
    const xfadeLines: string[] = [];
    let cursor = 0;
    let prevLabel = 'v0';
    for (let i = 0; i < n - 1; i++) {
      cursor += ordered[i].timing.end - ordered[i].timing.start;
      const offset = Math.max(0, cursor - transitionDuration);
      const outLabel = `vx${i + 1}`;
      xfadeLines.push(
        `[${prevLabel}][v${i + 1}]xfade=transition=fade:duration=${transitionDuration.toFixed(3)}:offset=${offset.toFixed(3)}[${outLabel}]`,
      );
      prevLabel = outLabel;
    }
    filter = [
      ...scaleLines,
      ...xfadeLines,
      `[${prevLabel}]${subtitleClause}[vout]`,
    ].join(";");
  } else {
    // ken_burns: per-scene zoompan ramp from 1.0 → 1.08, then concat.
    const lines: string[] = [];
    for (let i = 0; i < n; i++) {
      const dur = Math.max(0.1, ordered[i].timing.end - ordered[i].timing.start);
      const frames = Math.max(2, Math.round(dur * fps));
      lines.push(
        `[${i}:v]scale=${w * 2}:${h * 2}:flags=lanczos,zoompan=z='min(1+0.08*on/${frames - 1}\\,1.08)':d=${frames}:fps=${fps}:s=${w}x${h}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)',setsar=1,format=yuv420p[v${i}]`,
      );
    }
    const concatInputs = Array.from({ length: n }, (_, i) => `[v${i}]`).join('');
    lines.push(`${concatInputs}concat=n=${n}:v=1:a=0[vcat]`);
    lines.push(`[vcat]${subtitleClause}[vout]`);
    filter = lines.join(";");
  }

  args.push(
    "-filter_complex", filter,
    "-map", "[vout]",
    "-map", `${audioInputIndex}:a`,
    "-c:v", "libx264",
    "-preset", "ultrafast",
    "-tune", "stillimage",
    "-r", String(fps),
    "-c:a", "aac",
    "-b:a", "128k",
    "-shortest",
    "out.mp4",
  );
  return args;
};

interface AssembleParams {
  scenes: Scene[];
  timings: SceneTiming[];
  audioBlob: Blob;
  aspectRatio: "16:9" | "9:16";
  captionStyle: CaptionStyle;
  /** Optional Whisper word-level timestamps — enables karaoke mode. */
  whisperWords?: WhisperWord[];
  /** Scene transition mode (default 'cut'). */
  transition?: SceneTransition;
  /** Crossfade duration in seconds (only used for transition === 'fade'). */
  transitionDuration?: number;
  onProgress?: (p: VideoRenderProgress) => void;
  signal?: AbortSignal;
}

/**
 * Render the final mp4. Steps:
 *   1. Load ffmpeg.wasm core
 *   2. Write each scene image + the audio + the ASS subtitle file to FS
 *   3. Build a concat demuxer playlist that holds each image for its
 *      sceneTiming duration
 *   4. Run a single ffmpeg pass: concat → scale → subtitles → libx264 + aac
 *   5. Read /out.mp4 back as a Blob
 */
export const assembleVideo = async (params: AssembleParams): Promise<Blob> => {
  if (isBusy) throw new Error("Một render khác đang chạy — đợi xong rồi thử lại.");
  isBusy = true;

  const {
    scenes,
    timings,
    audioBlob,
    aspectRatio,
    captionStyle,
    whisperWords,
    transition = 'cut',
    transitionDuration = 0.25,
    onProgress,
    signal,
  } = params;

  const emit = (p: VideoRenderProgress) => onProgress?.(p);
  const check = () => {
    if (signal?.aborted) throw new Error("Đã huỷ render.");
  };

  // Build a sceneId → nearest-image map so we never write a black frame for a
  // scene that lacks its own generated image — fill forward, then backward.
  const sceneById = new Map(scenes.map(s => [s.id, s]));
  const imageBySceneId = new Map<string, string>();
  {
    let img: string | undefined;
    for (const t of timings) {
      const s = sceneById.get(t.sceneId);
      if (s?.imageUrl) img = s.imageUrl;
      if (img) imageBySceneId.set(t.sceneId, img);
    }
    img = undefined;
    for (let i = timings.length - 1; i >= 0; i--) {
      const t = timings[i];
      const s = sceneById.get(t.sceneId);
      if (s?.imageUrl) img = s.imageUrl;
      if (!imageBySceneId.has(t.sceneId) && img) imageBySceneId.set(t.sceneId, img);
    }
  }

  // Order scenes by their timing start so the image sequence matches audio.
  // Use the filled image when the scene's own imageUrl is missing.
  const ordered = timings
    .map(t => {
      const scene = sceneById.get(t.sceneId);
      const imageUrl = imageBySceneId.get(t.sceneId);
      return scene && imageUrl ? { scene, timing: t, imageUrl } : null;
    })
    .filter(Boolean) as { scene: Scene; timing: SceneTiming; imageUrl: string }[];

  if (ordered.length === 0) {
    isBusy = false;
    throw new Error("Không có ảnh nào để dựng video — quay lại bước Hình ảnh.");
  }

  try {
    emit({ phase: "load_ffmpeg", ratio: 0, message: "Tải ffmpeg core…" });
    const ffmpeg = await getFFmpeg((r, msg) =>
      // load_ffmpeg owns 0..0.25 of the overall progress so the wasm
      // download bar visibly fills instead of pinning at 10%.
      emit({ phase: "load_ffmpeg", ratio: r * 0.25, message: msg }),
    );
    check();
    emit({ phase: "load_ffmpeg", ratio: 0.25, message: "ffmpeg ready" });

    // ----- 2. Write assets to FS -----
    emit({ phase: "write_assets", ratio: 0.25, message: "Ghi ảnh + audio vào FS..." });

    // Audio: detect extension by blob.type so ffmpeg picks the right demuxer.
    const audioExt = audioBlob.type.includes("wav") ? "wav" : "mp3";
    await ffmpeg.writeFile(`audio.${audioExt}`, await urlToUint8(URL.createObjectURL(audioBlob)));
    check();

    // Scene images: written once each, indexed by ordered position.
    for (let i = 0; i < ordered.length; i++) {
      const { imageUrl } = ordered[i];
      const fname = `img_${String(i).padStart(3, "0")}.png`;
      await ffmpeg.writeFile(fname, await urlToUint8(imageUrl));
      check();
    }

    // Concat demuxer playlist — used only when transition === 'cut'.
    if (transition === 'cut') {
      const concatLines: string[] = [];
      for (let i = 0; i < ordered.length; i++) {
        const dur = Math.max(0.1, ordered[i].timing.end - ordered[i].timing.start);
        concatLines.push(`file 'img_${String(i).padStart(3, "0")}.png'`);
        concatLines.push(`duration ${dur.toFixed(3)}`);
      }
      // ffmpeg's concat demuxer needs the last file repeated without duration.
      concatLines.push(`file 'img_${String(ordered.length - 1).padStart(3, "0")}.png'`);
      await ffmpeg.writeFile("concat.txt", concatLines.join("\n"));
    }

    // ASS subtitle — compute chunks first (full scene / word chunks / single
    // word / karaoke), then emit one Dialogue line per chunk.
    const chunks = buildCaptionChunks(scenes, timings, captionStyle, whisperWords);
    const ass = buildASS(chunks, captionStyle, aspectRatio);
    await ffmpeg.writeFile("captions.ass", ass);
    check();

    emit({ phase: "write_assets", ratio: 0.35, message: "Đã ghi xong assets" });

    // ----- 3. Encode — three pipelines depending on transition mode -----
    const { w, h } = renderResolution(aspectRatio);
    emit({ phase: "encode", ratio: 0.4, message: "Bắt đầu encode..." });

    const onFfmpegProgress = ({ progress }: { progress: number }) => {
      const r = Math.max(0, Math.min(1, progress));
      emit({ phase: "encode", ratio: 0.4 + r * 0.55, message: `Encoding ${Math.round(r * 100)}%` });
    };
    ffmpeg.on("progress", onFfmpegProgress);

    try {
      const args = buildEncodeArgs({
        ordered,
        audioExt,
        w,
        h,
        transition,
        transitionDuration,
      });
      await ffmpeg.exec(args);
    } finally {
      ffmpeg.off("progress", onFfmpegProgress);
    }
    check();

    emit({ phase: "finalize", ratio: 0.97, message: "Đọc kết quả..." });
    const data = (await ffmpeg.readFile("out.mp4")) as Uint8Array;
    emit({ phase: "finalize", ratio: 1, message: "Xong!" });
    return new Blob([data.buffer as ArrayBuffer], { type: "video/mp4" });
  } finally {
    isBusy = false;
  }
};

/** Cheap check the UI can run at mount-time to decide if rendering is even possible. */
export const isVideoRenderSupported = (): boolean =>
  typeof SharedArrayBuffer !== "undefined" && typeof WebAssembly !== "undefined";

/**
 * Smoke-test helper: warms the ffmpeg instance and resolves the elapsed time.
 * Useful for diagnosing load failures from the dev console without running a
 * full render.  Exposed on `window.__ffmpegLoadTest` in dev.
 */
export const ffmpegLoadTest = async (): Promise<{ ok: true; elapsed: number } | { ok: false; error: string }> => {
  const t0 = performance.now();
  try {
    await getFFmpeg((r, msg) => console.log(`[ffmpeg-load] ${(r * 100).toFixed(0)}% ${msg}`));
    return { ok: true, elapsed: (performance.now() - t0) / 1000 };
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }
};

if (typeof window !== "undefined") {
  (window as any).__ffmpegLoadTest = ffmpegLoadTest;
}
