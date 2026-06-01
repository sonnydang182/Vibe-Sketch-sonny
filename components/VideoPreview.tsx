import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Scene, SceneTiming, CaptionStyle } from '../types';
import { buildCaptionChunks, CaptionChunk, WhisperWord } from '../services/captionService';

interface VideoPreviewProps {
  scenes: Scene[];
  timings: SceneTiming[];
  audioUrl: string;
  captionStyle: CaptionStyle;
  aspectRatio: '16:9' | '9:16';
  /** When present, enables karaoke mode in the preview. */
  whisperWords?: WhisperWord[];
}

/**
 * CapCut-style preview: scene image + caption overlay synced to the combined
 * voiceover audio. Drives off requestAnimationFrame for smooth scene switches
 * even when the audio's native `timeupdate` fires only ~4x/s.
 *
 * Caption mode (style.mode) decides what text shows when:
 *   - full_scene → whole scene voiceover for the scene window
 *   - word_chunks → ~chunkWords words at a time
 *   - single_word → one word, big & centered
 *   - karaoke → full line, with the active word highlighted (needs whisperWords)
 */
export const VideoPreview: React.FC<VideoPreviewProps> = ({
  scenes,
  timings,
  audioUrl,
  captionStyle,
  aspectRatio,
  whisperWords,
}) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const rafRef = useRef<number | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  // High-frequency timer for smooth chunk transitions (native timeupdate is
  // ~4Hz which makes word-level captions feel laggy).
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;

    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onSeek = () => setCurrentTime(el.currentTime);
    el.addEventListener('play', onPlay);
    el.addEventListener('pause', onPause);
    el.addEventListener('seeked', onSeek);
    el.addEventListener('timeupdate', onSeek);
    return () => {
      el.removeEventListener('play', onPlay);
      el.removeEventListener('pause', onPause);
      el.removeEventListener('seeked', onSeek);
      el.removeEventListener('timeupdate', onSeek);
    };
  }, []);

  useEffect(() => {
    if (!isPlaying) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      return;
    }
    const tick = () => {
      const el = audioRef.current;
      if (el) setCurrentTime(el.currentTime);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isPlaying]);

  // Compute caption chunks once per (scenes, timings, style) change so we're
  // not re-splitting strings 60 times a second.
  const chunks = useMemo(
    () => buildCaptionChunks(scenes, timings, captionStyle, whisperWords),
    [scenes, timings, captionStyle, whisperWords],
  );

  const sceneById = useMemo(() => new Map<string, Scene>(scenes.map(s => [s.id, s])), [scenes]);
  const activeTiming = timings.find(t => currentTime >= t.start && currentTime < t.end) ?? null;
  const activeScene: Scene | null = activeTiming
    ? sceneById.get(activeTiming.sceneId) ?? null
    : null;

  /**
   * Fill the timeline with the nearest available image so black frames don't
   * appear when individual scenes are missing their generated image. Forward
   * fill carries the most recent image; backward fill closes the head gap.
   */
  const imageBySceneId = useMemo(() => {
    const m = new Map<string, string>();
    let img: string | undefined;
    for (const t of timings) {
      const s = sceneById.get(t.sceneId);
      if (s?.imageUrl) img = s.imageUrl;
      if (img) m.set(t.sceneId, img);
    }
    img = undefined;
    for (let i = timings.length - 1; i >= 0; i--) {
      const t = timings[i];
      const s = sceneById.get(t.sceneId);
      if (s?.imageUrl) img = s.imageUrl;
      if (!m.has(t.sceneId) && img) m.set(t.sceneId, img);
    }
    return m;
  }, [timings, sceneById]);

  // Stable list of unique image URLs — used for the keep-in-DOM trick so
  // browsers don't decode a fresh <img> on every scene switch.
  const uniqueImages = useMemo(() => {
    const set = new Set<string>();
    for (const url of imageBySceneId.values()) set.add(url);
    return Array.from(set);
  }, [imageBySceneId]);

  const activeImageUrl = activeTiming ? imageBySceneId.get(activeTiming.sceneId) : undefined;

  const activeChunk: CaptionChunk | null = useMemo(() => {
    if (!chunks.length) return null;
    // Binary-ish lookup is overkill — caption chunks max out ~100 per video.
    return chunks.find(c => currentTime >= c.start && currentTime < c.end) ?? null;
  }, [chunks, currentTime]);

  const captionInline = useMemo(
    () => captionStyleToCSS(captionStyle),
    [captionStyle],
  );
  const frameAspect = aspectRatio === '16:9' ? '16 / 9' : '9 / 16';
  const maxHeight = aspectRatio === '9:16' ? 480 : undefined;

  const jumpToScene = (sceneId: string) => {
    const t = timings.find(x => x.sceneId === sceneId);
    const el = audioRef.current;
    if (!t || !el) return;
    el.currentTime = t.start + 0.01;
    setCurrentTime(el.currentTime);
  };

  return (
    <div className="space-y-3">
      <div
        className="relative bg-black rounded-lg overflow-hidden mx-auto"
        style={{ aspectRatio: frameAspect, maxHeight, width: aspectRatio === '9:16' ? 270 : '100%' }}
      >
        {/* Render every unique image once and toggle opacity. Prevents the
            decode flicker that happens when src swaps on rapid scene cuts. */}
        {uniqueImages.length > 0 ? (
          uniqueImages.map(url => (
            <img
              key={url}
              src={url}
              alt=""
              className="absolute inset-0 w-full h-full object-cover transition-opacity duration-150"
              style={{ opacity: url === activeImageUrl ? 1 : 0 }}
            />
          ))
        ) : (
          <div className="absolute inset-0 flex items-center justify-center font-hand text-paper/40">
            {scenes.length === 0 ? 'Chưa có scene' : 'Chưa có ảnh nào'}
          </div>
        )}
        {activeChunk?.text && (
          <CaptionLine chunk={activeChunk} style={captionInline} captionStyle={captionStyle} />
        )}
      </div>

      <audio ref={audioRef} src={audioUrl} controls className="w-full h-10" />

      {/* Scene scrubber strip */}
      {timings.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {timings.map((t, i) => {
            const isActive = activeTiming?.sceneId === t.sceneId;
            return (
              <button
                key={t.sceneId}
                onClick={() => jumpToScene(t.sceneId)}
                title={`Scene ${i + 1} · ${t.start.toFixed(1)}s → ${t.end.toFixed(1)}s`}
                className={`
                  flex-1 min-w-[28px] text-center font-mono text-[10px] py-1 rounded transition-colors
                  ${isActive
                    ? 'bg-ink text-paper'
                    : 'bg-white/60 border border-ink/10 text-gray-600 hover:border-ink'}
                `}
              >
                {i + 1}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

/**
 * Render one caption line. Karaoke highlight overrides the per-word color
 * for the active token; other modes just emit the chunk text.
 */
const CaptionLine: React.FC<{
  chunk: CaptionChunk;
  style: React.CSSProperties;
  captionStyle: CaptionStyle;
}> = ({ chunk, style, captionStyle }) => {
  if (chunk.highlightIndex === undefined) {
    return <div style={style}>{chunk.text}</div>;
  }

  const words = chunk.text.split(/\s+/);
  const highlightColor = HIGHLIGHT_COLOR[captionStyle.highlight];

  return (
    <div style={style}>
      {words.map((w, i) => (
        <span
          key={i}
          style={{
            color: i === chunk.highlightIndex ? highlightColor : undefined,
            marginRight: i < words.length - 1 ? '0.3em' : 0,
            transition: 'color 80ms linear',
          }}
        >
          {w}
        </span>
      ))}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Caption style → CSS — mirrors the ffmpeg ASS render closely enough that
// what you see in the preview is what you get in the final mp4.
// ---------------------------------------------------------------------------

const COLOR = {
  white: '#FFFFFF',
  yellow: '#FFD400',
} as const;

const HIGHLIGHT_COLOR = {
  yellow: '#FFD400',
  red: '#FF3B3B',
  cyan: '#00E0FF',
  green: '#3CCB7F',
} as const;

/**
 * Preview is rendered smaller than the final mp4 (e.g. 480px high vs 1280p
 * render). Scale the user's sizePx down so the visible font size in the
 * preview roughly matches what they'll see in the exported video.
 */
const PREVIEW_HEIGHT_REF = 480;

const captionStyleToCSS = (style: CaptionStyle): React.CSSProperties => {
  // Scale relative to the preview reference height; matches the ASS bump
  // single-word mode applies for impact.
  const scaled = style.sizePx * (PREVIEW_HEIGHT_REF / 720);
  const fontSize = style.mode === 'single_word' ? Math.round(scaled * 1.6) : Math.round(scaled);
  const outline = `${Math.max(2, Math.round(fontSize / 12))}px`;
  const textShadow = [
    `${outline} ${outline} 0 #000`,
    `-${outline} ${outline} 0 #000`,
    `${outline} -${outline} 0 #000`,
    `-${outline} -${outline} 0 #000`,
    `0 0 6px rgba(0,0,0,0.6)`,
  ].join(', ');

  const base: React.CSSProperties = {
    position: 'absolute',
    left: '5%',
    right: '5%',
    textAlign: 'center',
    fontWeight: 800,
    fontFamily: 'Arial, sans-serif',
    fontSize,
    lineHeight: 1.2,
    letterSpacing: 0.3,
    color: COLOR[style.textColor],
    textShadow: style.background ? 'none' : textShadow,
    backgroundColor: style.background ? 'rgba(0,0,0,0.55)' : 'transparent',
    padding: style.background ? '6px 12px' : 0,
    borderRadius: style.background ? 6 : 0,
    pointerEvents: 'none',
  };

  switch (style.position) {
    case 'top':
      return { ...base, top: '6%' };
    case 'middle':
      return { ...base, top: '50%', transform: 'translateY(-50%)' };
    case 'bottom':
    default:
      return { ...base, bottom: '6%' };
  }
};
