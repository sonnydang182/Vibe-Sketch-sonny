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

const FPS = 24;
const SUBTITLE_CLAUSE = "subtitles=captions.ass:fontsdir=/fonts";

/**
 * Phase 1: encode ONE scene's image into a fixed-format mp4 clip.
 * Used by the multi-pass renderer below — every scene becomes a real
 * video file with identical resolution / fps / pixel format so the
 * later concat demuxer has no input mismatches to choke on.
 *
 * The single-pass `filter_complex` path (`-loop 1 -t X -i img.png` per
 * scene + concat filter) was producing video that stuck on scene 0,
 * even with proper scale + setsar normalisation. ffmpeg.wasm's
 * still-image-as-stream handling is unreliable when many of them are
 * stitched in one graph — splitting into per-scene encodes side-steps
 * the whole class of bugs.
 */
const buildSceneEncodeArgs = (
  i: number,
  durationSec: number,
  w: number,
  h: number,
  transition: SceneTransition,
): string[] => {
  const dur = Math.max(0.1, durationSec);
  const inFile = `img_${String(i).padStart(3, "0")}.png`;
  const outFile = `scene_${String(i).padStart(3, "0")}.mp4`;

  let vf: string;
  if (transition === 'ken_burns') {
    const frames = Math.max(2, Math.round(dur * FPS));
    // Smooth Ken Burns recipe — avoids the classic zoompan jitter:
    //   1. Pre-scale 8× with lanczos so the cropped viewport has plenty of
    //      sub-pixels to choose from (1px shifts at output res = ~0.125px
    //      shifts at the source = imperceptible).
    //   2. Use the `zoom` accumulator (`zoom+delta`) instead of recomputing
    //      from frame index — accumulator keeps last frame's zoom, which is
    //      numerically smoother than `0.08*on/(N-1)` divides.
    //   3. Cap at 1.04 (was 1.08) — gentler ramp, less visible jitter.
    //   4. Hold steady at `zoom=1` for the first frame (the d=1 trick), then
    //      ramp; otherwise the first frame snaps to 1.0008 and feels jumpy.
    const target = 1.04;
    const delta = ((target - 1) / Math.max(1, frames - 1)).toFixed(6);
    vf = `scale=${w * 8}:${h * 8}:flags=lanczos,zoompan=z='min(zoom+${delta}\\,${target})':d=${frames}:fps=${FPS}:s=${w}x${h}:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)',setsar=1,format=yuv420p`;
  } else {
    vf = `scale=${w}:${h}:flags=lanczos,setsar=1,fps=${FPS},format=yuv420p`;
  }

  return [
    "-y",
    "-loop", "1",
    "-t", dur.toFixed(3),
    "-framerate", String(FPS),
    "-i", inFile,
    "-vf", vf,
    "-c:v", "libx264",
    "-preset", "ultrafast",
    "-pix_fmt", "yuv420p",
    "-t", dur.toFixed(3),
    outFile,
  ];
};

/**
 * Phase 2: stitch the per-scene mp4 clips into the final video, mux the
 * combined audio, and burn in captions.
 *
 *  - cut: concat demuxer (simplest, fastest)
 *  - fade: filter_complex chain of xfade between adjacent scene clips
 *  - ken_burns: same concat demuxer path — the zoompan was already
 *    applied in phase 1 per scene
 */
const buildFinalEncodeArgs = (
  ordered: Array<{ timing: SceneTiming }>,
  audioExt: string,
  transition: SceneTransition,
  transitionDuration: number,
): string[] => {
  const n = ordered.length;

  // Fade path — multi-input + chained xfade. Phase-1 mp4s have uniform
  // (1280x720 / 24fps / yuv420p) so xfade has no parameter mismatches.
  if (transition === 'fade' && n >= 2) {
    const args: string[] = ["-y"];
    for (let i = 0; i < n; i++) {
      args.push("-i", `scene_${String(i).padStart(3, "0")}.mp4`);
    }
    args.push("-i", `audio.${audioExt}`);
    const audioIdx = n;

    const xfadeLines: string[] = [];
    let prevLabel = '0:v';
    let prevOutputDur = ordered[0].timing.end - ordered[0].timing.start;
    for (let i = 0; i < n - 1; i++) {
      const offset = Math.max(0, prevOutputDur - transitionDuration);
      const outLabel = `vx${i + 1}`;
      xfadeLines.push(
        `[${prevLabel}][${i + 1}:v]xfade=transition=fade:duration=${transitionDuration.toFixed(3)}:offset=${offset.toFixed(3)}[${outLabel}]`,
      );
      prevLabel = outLabel;
      const nextDur = ordered[i + 1].timing.end - ordered[i + 1].timing.start;
      prevOutputDur = offset + nextDur;
    }
    const filter = [...xfadeLines, `[${prevLabel}]${SUBTITLE_CLAUSE}[vout]`].join(";");

    args.push(
      "-filter_complex", filter,
      "-map", "[vout]",
      "-map", `${audioIdx}:a`,
      "-c:v", "libx264",
      "-preset", "ultrafast",
      "-pix_fmt", "yuv420p",
      "-r", String(FPS),
      "-c:a", "aac",
      "-b:a", "128k",
      // No `-shortest`: we want the FULL audio in the output, not the
      // shortest stream. Scene timings + final freeze frame already cover
      // total audio duration (see alignSceneTimingsToWhisper audioDurationSec
      // pad), so video is the right length too.
      "out.mp4",
    );
    return args;
  }

  // cut / ken_burns / single-scene — concat demuxer + simple -vf for subs.
  return [
    "-y",
    "-f", "concat",
    "-safe", "0",
    "-i", "concat.txt",
    "-i", `audio.${audioExt}`,
    "-vf", SUBTITLE_CLAUSE,
    "-c:v", "libx264",
    "-preset", "ultrafast",
    "-pix_fmt", "yuv420p",
    "-r", String(FPS),
    "-c:a", "aac",
    "-b:a", "128k",
    "-shortest",
    "out.mp4",
  ];
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

    // Font — without this libass renders nothing for the subtitles filter.
    // Inter Bold's internal name is "Inter", which matches our ASS Style.
    try {
      await ffmpeg.createDir("/fonts");
    } catch { /* already exists */ }
    const fontRes = await fetch("/fonts/Inter-Bold.ttf");
    if (!fontRes.ok) {
      throw new Error(`Font fetch ${fontRes.status} — captions can't render without /fonts/Inter-Bold.ttf`);
    }
    await ffmpeg.writeFile(
      "/fonts/Inter-Bold.ttf",
      new Uint8Array(await fontRes.arrayBuffer()),
    );
    check();

    // ASS subtitle — compute chunks first (full scene / word chunks / single
    // word / karaoke), then emit one Dialogue line per chunk.
    const chunks = buildCaptionChunks(scenes, timings, captionStyle, whisperWords);
    const ass = buildASS(chunks, captionStyle, aspectRatio);
    await ffmpeg.writeFile("captions.ass", ass);
    check();

    emit({ phase: "write_assets", ratio: 0.35, message: "Đã ghi xong assets" });

    // ----- 3. Encode — multi-pass for reliability -----
    // Pass 1: each scene → its own mp4 clip with uniform format
    // Pass 2: concat the clips + mux audio + burn subtitles
    //
    // The single-pass `-loop 1 -t X -i img.png` × N + concat filter
    // approach was clamping output to scene 0 inside ffmpeg.wasm even
    // with all the right normalisations. Splitting into discrete encodes
    // bypasses the still-image-stream quirk entirely.
    const { w, h } = renderResolution(aspectRatio);

    // Last 80 ffmpeg log lines so encode failures surface real stderr.
    const encodeLog: string[] = [];
    const onLog = ({ message }: { message: string }) => {
      console.log("[ffmpeg]", message);
      encodeLog.push(message);
      if (encodeLog.length > 80) encodeLog.shift();
    };
    ffmpeg.on("log", onLog);

    const failWithLog = (msg: string): Error => {
      const tail = encodeLog.slice(-25).join("\n");
      return new Error(`${msg}\n\nLast ffmpeg output:\n${tail}`);
    };

    try {
      // --- Pass 1: per-scene mp4 clips ---
      // Per-scene exec doesn't give clean overall progress; just announce
      // which scene is encoding so the user sees forward motion.
      const sceneEncodeBand = 0.45; // 0.4 → 0.85 of overall progress
      for (let i = 0; i < ordered.length; i++) {
        check();
        const r = i / ordered.length;
        emit({
          phase: "encode",
          ratio: 0.4 + r * sceneEncodeBand,
          message: `Encode cảnh ${i + 1}/${ordered.length}...`,
        });
        const dur = ordered[i].timing.end - ordered[i].timing.start;
        const sceneArgs = buildSceneEncodeArgs(i, dur, w, h, transition);
        console.log(`[ffmpeg] scene ${i} args:`, sceneArgs.join(" "));
        try {
          await ffmpeg.exec(sceneArgs);
        } catch (e: any) {
          throw failWithLog(`Encode cảnh ${i + 1} fail: ${e?.message || e}`);
        }
      }
      emit({ phase: "encode", ratio: 0.85, message: "Đã encode xong các cảnh" });

      // --- Pass 2: stitch + audio + subtitles ---
      // Concat demuxer playlist (used for cut / ken_burns).
      if (transition !== 'fade' || ordered.length < 2) {
        const concatLines = ordered.map(
          (_, i) => `file 'scene_${String(i).padStart(3, "0")}.mp4'`,
        );
        await ffmpeg.writeFile("concat.txt", concatLines.join("\n"));
      }

      emit({ phase: "encode", ratio: 0.88, message: "Ghép cảnh + audio + caption..." });
      const onFfmpegProgress = ({ progress }: { progress: number }) => {
        const r = Math.max(0, Math.min(1, progress));
        emit({ phase: "encode", ratio: 0.88 + r * 0.07, message: `Mux ${Math.round(r * 100)}%` });
      };
      ffmpeg.on("progress", onFfmpegProgress);

      const finalArgs = buildFinalEncodeArgs(ordered, audioExt, transition, transitionDuration);
      console.log("[ffmpeg] final args:", finalArgs.join(" "));
      try {
        await ffmpeg.exec(finalArgs);
      } catch (e: any) {
        throw failWithLog(`Ghép video fail: ${e?.message || e}`);
      } finally {
        ffmpeg.off("progress", onFfmpegProgress);
      }
    } finally {
      ffmpeg.off("log", onLog);
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
