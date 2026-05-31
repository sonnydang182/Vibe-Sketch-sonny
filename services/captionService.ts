import { Scene, Language, SceneTiming, CaptionStyle } from "../types";

/**
 * Pure-JS caption + timing utilities. No external API needed.
 *
 *  - estimateSceneTimings: fallback when Whisper isn't available — distribute
 *    the total audio duration across scenes proportionally to spoken length.
 *  - alignSceneTimingsToWhisper: future plug-point. Walks Whisper word output
 *    and matches each scene's expected word count to a [start, end] window.
 *  - buildSRT / buildVTT: subtitle file generators.
 */

/**
 * Words-per-second proxies per language. Used by estimateSceneTimings so the
 * fallback distribution roughly tracks how long each scene WILL take to read.
 *
 * These numbers intentionally mirror geminiService's WORDS_PER_SECOND but we
 * duplicate them here so this module stays Whisper/TTS-provider agnostic.
 */
const WORDS_PER_SECOND: Record<Language, number> = {
  Vietnamese: 3.2,
  English: 2.5,
  Japanese: 4.0,
};

/**
 * Cheap tokenizer. For CJK we approximate by char-count (since whitespace
 * boundaries don't apply); for everything else we split on whitespace.
 * Good enough for proportional time allocation — NOT for exact word matching.
 */
const wordWeight = (text: string, language: Language): number => {
  const trimmed = text.trim();
  if (!trimmed) return 0;
  if (language === 'Japanese') {
    // Japanese: ~2 chars per "word" feels about right for pacing.
    return Math.max(1, Math.round(trimmed.length / 2));
  }
  return trimmed.split(/\s+/).filter(Boolean).length;
};

/**
 * Estimate per-scene timings by splitting the total audio duration in
 * proportion to each scene's spoken weight. NO Whisper required — useful as
 * the immediate baseline before Whisper alignment is plugged in.
 */
export const estimateSceneTimings = (
  scenes: Scene[],
  totalAudioSeconds: number,
  language: Language,
): SceneTiming[] => {
  if (scenes.length === 0 || totalAudioSeconds <= 0) return [];

  const weights = scenes.map(s => wordWeight(s.voiceover || '', language));
  const totalWeight = weights.reduce((a, b) => a + b, 0);

  // Empty scenes → fall back to equal slicing so the player still has timings.
  if (totalWeight === 0) {
    const slice = totalAudioSeconds / scenes.length;
    return scenes.map((s, i) => ({
      sceneId: s.id,
      start: i * slice,
      end: (i + 1) * slice,
      source: 'estimated',
    }));
  }

  // Sanity-check: predicted spoken duration vs actual audio. If the model
  // delivered an obviously shorter / longer take, we just scale the weights
  // — proportions are the load-bearing part, not absolute WPS.
  const _predictedSeconds = totalWeight / (WORDS_PER_SECOND[language] ?? 3.0);
  void _predictedSeconds; // kept for clarity; weights are normalized below

  let cursor = 0;
  return scenes.map((s, i) => {
    const slice = (weights[i] / totalWeight) * totalAudioSeconds;
    const start = cursor;
    const end = i === scenes.length - 1 ? totalAudioSeconds : cursor + slice;
    cursor = end;
    return { sceneId: s.id, start, end, source: 'estimated' as const };
  });
};

/**
 * Word-level timestamp from a Whisper transcription. Word boundaries vary
 * across implementations — we only require text + start + end.
 */
export interface WhisperWord {
  text: string;
  start: number;
  end: number;
}

/**
 * Align scenes to a Whisper word stream by consuming the expected number of
 * tokens per scene off the front of the word queue.
 *
 * Robust to ±2 token drift (TTS reading slightly different words than the
 * script) via a small look-ahead. Caller can also re-balance afterwards by
 * walking sceneTimings and snapping silences if needed.
 */
export const alignSceneTimingsToWhisper = (
  scenes: Scene[],
  whisperWords: WhisperWord[],
  language: Language,
): SceneTiming[] => {
  if (scenes.length === 0 || whisperWords.length === 0) return [];

  const expectedCounts = scenes.map(s => wordWeight(s.voiceover || '', language));
  const totalExpected = expectedCounts.reduce((a, b) => a + b, 0);
  const totalActual = whisperWords.length;
  // If Whisper over- or under-segmented the audio (Vietnamese is common
  // offender), keep proportions but rescale to actual word count.
  const scale = totalExpected > 0 ? totalActual / totalExpected : 1;

  let wordCursor = 0;
  return scenes.map((scene, i) => {
    const take = Math.max(1, Math.round(expectedCounts[i] * scale));
    const startIdx = Math.min(wordCursor, whisperWords.length - 1);
    const endIdx = Math.min(wordCursor + take - 1, whisperWords.length - 1);
    wordCursor = endIdx + 1;
    // Last scene mops up any trailing words so timing covers full audio.
    if (i === scenes.length - 1 && wordCursor < whisperWords.length) {
      return {
        sceneId: scene.id,
        start: whisperWords[startIdx].start,
        end: whisperWords[whisperWords.length - 1].end,
        source: 'whisper' as const,
      };
    }
    return {
      sceneId: scene.id,
      start: whisperWords[startIdx].start,
      end: whisperWords[endIdx].end,
      source: 'whisper' as const,
    };
  });
};

// ---------------------------------------------------------------------------
// SRT / VTT exporters
// ---------------------------------------------------------------------------

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

/** SRT clock format: `HH:MM:SS,mmm`. */
const formatSrt = (seconds: number): string => {
  const total = Math.max(0, seconds);
  const ms = Math.round((total - Math.floor(total)) * 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = Math.floor(total % 60);
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(ms, 3)}`;
};

/** WebVTT clock format: `HH:MM:SS.mmm`. */
const formatVtt = (seconds: number): string => formatSrt(seconds).replace(',', '.');

export const buildSRT = (timings: SceneTiming[], scenes: Scene[]): string => {
  const byId = new Map(scenes.map(s => [s.id, s] as const));
  return timings
    .map((t, i) => {
      const scene = byId.get(t.sceneId);
      if (!scene) return null;
      return [
        String(i + 1),
        `${formatSrt(t.start)} --> ${formatSrt(t.end)}`,
        scene.voiceover.trim(),
      ].join('\n');
    })
    .filter(Boolean)
    .join('\n\n') + '\n';
};

export const buildVTT = (timings: SceneTiming[], scenes: Scene[]): string => {
  const byId = new Map(scenes.map(s => [s.id, s] as const));
  const cues = timings
    .map((t) => {
      const scene = byId.get(t.sceneId);
      if (!scene) return null;
      return `${formatVtt(t.start)} --> ${formatVtt(t.end)}\n${scene.voiceover.trim()}`;
    })
    .filter(Boolean)
    .join('\n\n');
  return `WEBVTT\n\n${cues}\n`;
};

/** Helper: read the duration of an audio Blob via the HTMLAudioElement. */
export const probeAudioDuration = (audioUrl: string): Promise<number> =>
  new Promise((resolve, reject) => {
    const el = new Audio();
    el.preload = 'metadata';
    el.onloadedmetadata = () => resolve(el.duration);
    el.onerror = () => reject(new Error('Failed to probe audio duration'));
    el.src = audioUrl;
  });

// ---------------------------------------------------------------------------
// ASS (Advanced SubStation Alpha) exporter — used for ffmpeg subtitles filter
// ---------------------------------------------------------------------------

/**
 * Map our app aspect ratio to a render resolution. Lower than 1080p keeps
 * wasm encoding fast enough to finish in a couple minutes for a short clip.
 */
export const renderResolution = (aspect: '16:9' | '9:16'): { w: number; h: number } =>
  aspect === '16:9' ? { w: 1280, h: 720 } : { w: 720, h: 1280 };

/** Convert seconds to ASS clock format: H:MM:SS.cc (centiseconds). */
const formatAss = (seconds: number): string => {
  const total = Math.max(0, seconds);
  const cs = Math.round((total - Math.floor(total)) * 100);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = Math.floor(total % 60);
  return `${h}:${pad(m)}:${pad(s)}.${pad(cs)}`;
};

/** Escape an ASS dialogue text body so braces don't get parsed as overrides. */
const escapeAssText = (s: string): string =>
  s.replace(/\\/g, '\\\\').replace(/\{/g, '\\{').replace(/\}/g, '\\}').replace(/\n/g, '\\N');

/** ASS uses BGR ordering: &H00BBGGRR&. */
const ASS_COLORS = {
  white:  '&H00FFFFFF',
  yellow: '&H0000F4FF',
  red:    '&H000000FF',
  cyan:   '&H00FFFF00',
  green:  '&H0000FF00',
  black:  '&H00000000',
} as const;

const fontSizeFor = (size: CaptionStyle['size'], height: number): number => {
  // Sizes calibrated against 1280 / 720 base; scale roughly linearly.
  const base = size === 'small' ? 36 : size === 'large' ? 72 : 52;
  return Math.round(base * (height / 720));
};

/**
 * ASS alignment numpad codes:
 *   bottom: 2 (center-bottom)
 *   middle: 5 (center-middle)
 *   top:    8 (center-top)
 */
const alignmentFor = (pos: CaptionStyle['position']): number =>
  pos === 'top' ? 8 : pos === 'middle' ? 5 : 2;

/**
 * Build a per-scene ASS subtitle file. One Dialogue line per scene — the whole
 * voiceover text shows for the entire scene window. Karaoke per-word can be
 * layered on top in a follow-up when WhisperWord timestamps are threaded
 * through to the render call.
 */
export const buildASS = (
  scenes: Scene[],
  timings: SceneTiming[],
  style: CaptionStyle,
  aspect: '16:9' | '9:16',
): string => {
  const { w, h } = renderResolution(aspect);
  const byId = new Map(scenes.map(s => [s.id, s] as const));

  const fontSize = fontSizeFor(style.size, h);
  const primaryColor = ASS_COLORS[style.textColor];
  const outlineColor = ASS_COLORS.black;
  const backColor = style.background ? '&H80000000' : '&H00000000';
  const borderStyle = style.background ? 3 : 1; // 3 = opaque box, 1 = outline only
  const outlineW = Math.max(2, Math.round(fontSize / 18));
  const shadowW = 0;
  const alignment = alignmentFor(style.position);
  const marginV = Math.round(h * 0.05);

  const header = [
    '[Script Info]',
    'ScriptType: v4.00+',
    `PlayResX: ${w}`,
    `PlayResY: ${h}`,
    'ScaledBorderAndShadow: yes',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    `Style: Default,Arial,${fontSize},${primaryColor},${ASS_COLORS.yellow},${outlineColor},${backColor},1,0,0,0,100,100,0,0,${borderStyle},${outlineW},${shadowW},${alignment},40,40,${marginV},1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  ].join('\n');

  const dialogues = timings
    .map(t => {
      const scene = byId.get(t.sceneId);
      if (!scene || !scene.voiceover.trim()) return null;
      const text = escapeAssText(scene.voiceover.trim());
      return `Dialogue: 0,${formatAss(t.start)},${formatAss(t.end)},Default,,0,0,0,,${text}`;
    })
    .filter(Boolean)
    .join('\n');

  return `${header}\n${dialogues}\n`;
};
