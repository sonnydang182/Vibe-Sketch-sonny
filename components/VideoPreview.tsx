import React, { useEffect, useRef, useState } from 'react';
import { Scene, SceneTiming, CaptionStyle } from '../types';

interface VideoPreviewProps {
  scenes: Scene[];
  timings: SceneTiming[];
  audioUrl: string;
  captionStyle: CaptionStyle;
  aspectRatio: '16:9' | '9:16';
}

/**
 * CapCut-style preview: scene image + caption overlay synced to the combined
 * voiceover audio. Drives off requestAnimationFrame for smooth scene switches
 * even when the audio's native `timeupdate` fires only ~4x/s.
 *
 * Caption CSS is hand-tuned to roughly match what ffmpeg's ASS render will
 * produce — same position, similar font weight + outline. Not pixel-perfect
 * but close enough to make creative decisions without waiting for a render.
 */
export const VideoPreview: React.FC<VideoPreviewProps> = ({
  scenes,
  timings,
  audioUrl,
  captionStyle,
  aspectRatio,
}) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const rafRef = useRef<number | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  // High-frequency timer: when playing, sample audio.currentTime each frame
  // so the scene flip happens within ~16ms of the timing boundary instead of
  // waiting up to 250ms for the native timeupdate event.
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

  const sceneById = new Map<string, Scene>(scenes.map(s => [s.id, s]));
  const activeTiming = timings.find(t => currentTime >= t.start && currentTime < t.end) ?? null;
  const activeScene: Scene | null = activeTiming
    ? sceneById.get(activeTiming.sceneId) ?? null
    : null;

  const captionInline = captionStyleToCSS(captionStyle);
  const frameAspect = aspectRatio === '16:9' ? '16 / 9' : '9 / 16';
  const maxHeight = aspectRatio === '9:16' ? 480 : undefined;

  // Quick scrubber: jump to a scene's start when its number is clicked.
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
        {activeScene?.imageUrl ? (
          <img
            src={activeScene.imageUrl}
            alt=""
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center font-hand text-paper/40">
            {scenes.length === 0 ? 'Chưa có scene' : 'Chưa có ảnh cho cảnh hiện tại'}
          </div>
        )}
        {activeScene?.voiceover && (
          <div style={captionInline}>
            {activeScene.voiceover}
          </div>
        )}
      </div>

      <audio
        ref={audioRef}
        src={audioUrl}
        controls
        className="w-full h-10"
      />

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

// ---------------------------------------------------------------------------
// Caption style → CSS — mirrors the ffmpeg ASS render closely enough that
// what you see in the preview is what you get in the final mp4.
// ---------------------------------------------------------------------------

const SIZE_PX = { small: 18, medium: 28, large: 40 } as const;

const COLOR = {
  white: '#FFFFFF',
  yellow: '#FFD400',
} as const;

const captionStyleToCSS = (style: CaptionStyle): React.CSSProperties => {
  const fontSize = SIZE_PX[style.size];
  const outline = `${Math.max(2, Math.round(fontSize / 12))}px`;
  // text-shadow trick to fake a 4-direction outline (matches ASS BorderStyle=1).
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
