import React, { useEffect, useMemo, useState } from 'react';
import { Button } from './Button';
import { VideoPreview } from './VideoPreview';
import {
  Scene,
  SceneTiming,
  Language,
  CaptionStyle,
  CaptionMode,
  CaptionPosition,
  CaptionSize,
  CaptionHighlight,
  VideoRenderProgress,
} from '../types';
import {
  estimateSceneTimings,
  buildSRT,
  buildVTT,
  probeAudioDuration,
  WhisperWord,
} from '../services/captionService';

interface StepVideoProps {
  scenes: Scene[];
  audioUrl?: string;
  language: Language;
  aspectRatio: '16:9' | '9:16';
  /** When false, the "Khớp với Whisper" button is disabled with an info hint. */
  hasWhisperProvider: boolean;
  whisperTimings: SceneTiming[] | null;
  /** Raw Whisper word stream — enables karaoke mode when present. */
  whisperWords?: WhisperWord[];
  isAligningWhisper: boolean;
  whisperError?: string;
  onAlignWithWhisper: () => void;
  onOpenSettings: () => void;
  onBack: () => void;
  onExportZip: () => void;

  // Caption style — persisted via settings.
  captionStyle: CaptionStyle;
  onChangeCaptionStyle: (style: CaptionStyle) => void;

  // Render lifecycle — owned by App.tsx.
  videoUrl?: string;
  isRendering: boolean;
  renderProgress?: VideoRenderProgress;
  renderError?: string;
  onRender: (timings: SceneTiming[]) => void;
  onCancelRender: () => void;
  /** True if SharedArrayBuffer / wasm is unavailable in this browser. */
  videoRenderSupported: boolean;
}

const formatClock = (s: number): string => {
  const total = Math.max(0, s);
  const m = Math.floor(total / 60);
  const sec = total % 60;
  return `${String(m).padStart(2, '0')}:${sec.toFixed(2).padStart(5, '0')}`;
};

// -------- Caption preset options (compact UI vocabulary) --------

const MODES: { id: CaptionMode; label: string; hint: string; requiresWhisper?: boolean }[] = [
  { id: 'word_chunks', label: 'Cụm từ', hint: 'Hiển thị 3–5 từ một lúc (mặc định)' },
  { id: 'single_word', label: 'Một từ', hint: 'Pop từng từ, font tự to (TikTok style)' },
  { id: 'karaoke', label: 'Karaoke', hint: 'Highlight từ đang đọc — cần Whisper', requiresWhisper: true },
  { id: 'full_scene', label: 'Cả câu', hint: 'Hiện toàn bộ lời dẫn (có thể che khung)' },
];

const POSITIONS: { id: CaptionPosition; label: string }[] = [
  { id: 'bottom', label: 'Dưới' },
  { id: 'middle', label: 'Giữa' },
  { id: 'top', label: 'Trên' },
];

const SIZES: { id: CaptionSize; label: string }[] = [
  { id: 'small', label: 'Nhỏ' },
  { id: 'medium', label: 'Vừa' },
  { id: 'large', label: 'To' },
];

const HIGHLIGHTS: { id: CaptionHighlight; label: string; swatch: string }[] = [
  { id: 'yellow', label: 'Vàng', swatch: '#FFD400' },
  { id: 'red', label: 'Đỏ', swatch: '#FF3B3B' },
  { id: 'cyan', label: 'Cyan', swatch: '#00E0FF' },
  { id: 'green', label: 'Xanh', swatch: '#3CCB7F' },
];

const TEXT_COLORS: { id: CaptionStyle['textColor']; label: string; swatch: string }[] = [
  { id: 'white', label: 'Trắng', swatch: '#FFFFFF' },
  { id: 'yellow', label: 'Vàng', swatch: '#FFD400' },
];

const PROGRESS_LABEL: Record<VideoRenderProgress['phase'], string> = {
  load_ffmpeg: 'Tải ffmpeg.wasm',
  write_assets: 'Ghi ảnh + audio vào FS',
  encode: 'Encode',
  finalize: 'Hoàn tất',
};

/**
 * StepVideo — bước cuối: khớp caption (Whisper / estimate) + render mp4.
 *
 * UI chia 4 khối từ trên xuống:
 *   1. Phương pháp khớp caption (Whisper status / button).
 *   2. Cấu hình caption (vị trí, kích cỡ, màu, nền).
 *   3. Bảng timing per-scene + download SRT/VTT (tham khảo).
 *   4. Render video (progress, preview, download mp4).
 */
export const StepVideo: React.FC<StepVideoProps> = ({
  scenes,
  audioUrl,
  language,
  aspectRatio,
  hasWhisperProvider,
  whisperTimings,
  whisperWords,
  isAligningWhisper,
  whisperError,
  onAlignWithWhisper,
  onOpenSettings,
  onBack,
  onExportZip,
  captionStyle,
  onChangeCaptionStyle,
  videoUrl,
  isRendering,
  renderProgress,
  renderError,
  onRender,
  onCancelRender,
  videoRenderSupported,
}) => {
  const [audioDuration, setAudioDuration] = useState<number | null>(null);
  const [audioError, setAudioError] = useState<string | null>(null);

  useEffect(() => {
    if (!audioUrl) {
      setAudioDuration(null);
      return;
    }
    setAudioError(null);
    probeAudioDuration(audioUrl)
      .then(setAudioDuration)
      .catch(err => setAudioError(err?.message || String(err)));
  }, [audioUrl]);

  const timings: SceneTiming[] = useMemo(() => {
    if (whisperTimings && whisperTimings.length > 0) return whisperTimings;
    if (!audioDuration || audioDuration <= 0) return [];
    return estimateSceneTimings(scenes, audioDuration, language);
  }, [whisperTimings, scenes, audioDuration, language]);

  const sceneHasImage = scenes.filter(s => s.imageUrl).length;
  const allScenesHaveImage = scenes.length > 0 && sceneHasImage === scenes.length;

  const downloadFile = (filename: string, mime: string, body: string) => {
    const blob = new Blob([body], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadSrt = () => {
    if (!timings.length) return;
    downloadFile('captions.srt', 'application/x-subrip', buildSRT(timings, scenes));
  };
  const handleDownloadVtt = () => {
    if (!timings.length) return;
    downloadFile('captions.vtt', 'text/vtt', buildVTT(timings, scenes));
  };
  const handleDownloadMp4 = () => {
    if (!videoUrl) return;
    const a = document.createElement('a');
    a.href = videoUrl;
    a.download = 'video.mp4';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const canCaption = audioUrl && audioDuration && timings.length > 0;
  const canRender =
    videoRenderSupported &&
    audioUrl &&
    allScenesHaveImage &&
    timings.length > 0 &&
    !isRendering;

  const progressRatio = renderProgress?.ratio ?? 0;

  return (
    <div className="flex flex-col gap-6 w-full max-w-4xl mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-center gap-4">
        <div>
          <h2 className="font-hand text-3xl font-bold text-ink">Khớp Caption + Dựng Video</h2>
          <p className="font-sans text-gray-600 text-sm">
            Khớp timing → cấu hình caption → render mp4 ngay trong browser (ffmpeg.wasm).
          </p>
        </div>
        <div className="flex gap-2 flex-wrap justify-end items-center">
          <Button variant="secondary" onClick={onBack} disabled={isRendering}>Quay lại</Button>
          <Button variant="secondary" onClick={onExportZip} disabled={scenes.length === 0 || isRendering}>
            ⬇ Tải ZIP
          </Button>
        </div>
      </div>

      {!audioUrl && (
        <div className="p-4 rounded-xl border-2 border-amber-300 bg-amber-50">
          <div className="font-hand text-lg text-amber-900">Chưa có audio</div>
          <p className="font-sans text-xs text-amber-800/80">
            Quay lại Phòng Thu Âm và tạo voiceover trước.
          </p>
        </div>
      )}

      {audioError && (
        <div className="p-4 rounded-xl border-2 border-red-300 bg-red-50">
          <div className="font-hand text-lg text-red-900">Lỗi đọc audio</div>
          <p className="font-sans text-xs text-red-800/80">{audioError}</p>
        </div>
      )}

      {/* 1. Caption alignment method */}
      <section className="bg-white/50 backdrop-blur-sm p-4 rounded-xl border-2 border-ink/10 space-y-2">
        <div className="flex flex-col md:flex-row md:items-center gap-3">
          <div className="flex-1 space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] uppercase tracking-wider text-gray-400">Bước 1</span>
              <div className="font-hand text-lg text-ink">Phương pháp khớp caption</div>
            </div>
            <div className="font-sans text-[12px] text-gray-600">
              {timings[0]?.source === 'whisper'
                ? '✓ Đã khớp bằng Whisper (Groq · whisper-large-v3-turbo, word-level).'
                : hasWhisperProvider
                  ? 'Đang dùng estimate word-count. Bấm Khớp Whisper để chuẩn từng từ.'
                  : 'Đang dùng estimate word-count. Thêm Groq API key trong Cấu hình để khớp chuẩn.'}
            </div>
          </div>
          {hasWhisperProvider ? (
            <Button
              variant="secondary"
              onClick={onAlignWithWhisper}
              isLoading={isAligningWhisper}
              disabled={!audioUrl || isAligningWhisper || isRendering}
            >
              🎯 {whisperTimings ? 'Khớp lại' : 'Khớp với Whisper'}
            </Button>
          ) : (
            <Button variant="secondary" onClick={onOpenSettings}>
              ⚙️ Thêm Groq Key
            </Button>
          )}
        </div>
        {whisperError && (
          <div className="font-sans text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">
            ⚠ {whisperError}
          </div>
        )}
      </section>

      {/* 2. Caption style config */}
      <section className="bg-white/50 backdrop-blur-sm p-4 rounded-xl border-2 border-ink/10 space-y-4">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-wider text-gray-400">Bước 2</span>
          <div className="font-hand text-lg text-ink">Cấu hình caption</div>
        </div>

        {/* Mode picker — the primary "how does caption flow" decision */}
        <div className="space-y-1.5">
          <label className="font-sans text-xs uppercase tracking-wider text-gray-500">Phong cách caption</label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
            {MODES.map(m => {
              const disabled = m.requiresWhisper && (!whisperWords || whisperWords.length === 0);
              const active = captionStyle.mode === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => onChangeCaptionStyle({ ...captionStyle, mode: m.id })}
                  disabled={disabled}
                  title={disabled ? 'Cần khớp Whisper trước (Bước 1)' : m.hint}
                  className={`
                    flex flex-col items-start text-left p-2.5 rounded-md border-2 transition-all min-h-[58px]
                    ${active
                      ? 'bg-ink text-paper border-ink shadow-md'
                      : 'bg-white border-gray-200 text-gray-700 hover:border-gray-400'}
                    ${disabled ? 'opacity-40 cursor-not-allowed' : ''}
                  `}
                >
                  <span className="font-hand text-base">{m.label}</span>
                  <span className={`font-sans text-[10px] leading-snug ${active ? 'text-paper/70' : 'text-gray-500'}`}>
                    {m.hint}
                  </span>
                </button>
              );
            })}
          </div>
          {captionStyle.mode === 'word_chunks' && (
            <div className="flex items-center gap-3 pt-2">
              <label className="font-sans text-xs text-gray-600">Số từ / cụm:</label>
              <input
                type="range"
                min={2}
                max={8}
                value={captionStyle.chunkWords}
                onChange={e => onChangeCaptionStyle({ ...captionStyle, chunkWords: Number(e.target.value) })}
                className="flex-1 accent-ink"
              />
              <span className="font-mono text-sm text-ink min-w-[1.5em] text-center">{captionStyle.chunkWords}</span>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Position */}
          <div className="space-y-1.5">
            <label className="font-sans text-xs uppercase tracking-wider text-gray-500">Vị trí</label>
            <div className="grid grid-cols-3 gap-1.5">
              {POSITIONS.map(p => (
                <button
                  key={p.id}
                  onClick={() => onChangeCaptionStyle({ ...captionStyle, position: p.id })}
                  className={`px-2 py-1.5 rounded-md border-2 font-hand text-sm transition-all ${
                    captionStyle.position === p.id
                      ? 'bg-ink text-paper border-ink'
                      : 'bg-white border-gray-200 text-gray-700 hover:border-gray-400'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Size */}
          <div className="space-y-1.5">
            <label className="font-sans text-xs uppercase tracking-wider text-gray-500">Kích cỡ</label>
            <div className="grid grid-cols-3 gap-1.5">
              {SIZES.map(s => (
                <button
                  key={s.id}
                  onClick={() => onChangeCaptionStyle({ ...captionStyle, size: s.id })}
                  className={`px-2 py-1.5 rounded-md border-2 font-hand text-sm transition-all ${
                    captionStyle.size === s.id
                      ? 'bg-ink text-paper border-ink'
                      : 'bg-white border-gray-200 text-gray-700 hover:border-gray-400'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* Text color */}
          <div className="space-y-1.5">
            <label className="font-sans text-xs uppercase tracking-wider text-gray-500">Màu chữ</label>
            <div className="grid grid-cols-2 gap-1.5">
              {TEXT_COLORS.map(c => (
                <button
                  key={c.id}
                  onClick={() => onChangeCaptionStyle({ ...captionStyle, textColor: c.id })}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded-md border-2 font-hand text-sm transition-all ${
                    captionStyle.textColor === c.id
                      ? 'bg-ink text-paper border-ink'
                      : 'bg-white border-gray-200 text-gray-700 hover:border-gray-400'
                  }`}
                >
                  <span className="w-3 h-3 rounded-sm border border-black/30" style={{ background: c.swatch }} />
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* Highlight color (reserved for karaoke per-word) */}
          <div className="space-y-1.5">
            <label className="font-sans text-xs uppercase tracking-wider text-gray-500">
              Màu highlight <span className="text-gray-400">(dùng cho karaoke)</span>
            </label>
            <div className="grid grid-cols-4 gap-1.5">
              {HIGHLIGHTS.map(h => (
                <button
                  key={h.id}
                  onClick={() => onChangeCaptionStyle({ ...captionStyle, highlight: h.id })}
                  className={`flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-md border-2 font-hand text-xs transition-all ${
                    captionStyle.highlight === h.id
                      ? 'bg-ink text-paper border-ink'
                      : 'bg-white border-gray-200 text-gray-700 hover:border-gray-400'
                  }`}
                >
                  <span className="w-3 h-3 rounded-full border border-black/30" style={{ background: h.swatch }} />
                  {h.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
          <input
            type="checkbox"
            checked={captionStyle.background}
            onChange={e => onChangeCaptionStyle({ ...captionStyle, background: e.target.checked })}
            className="w-4 h-4"
          />
          Nền đen mờ đằng sau caption (đọc dễ trên ảnh phức tạp)
        </label>
      </section>

      {/* 3. Live preview — assembled scenes + audio + captions */}
      <section className="bg-white/50 backdrop-blur-sm p-4 rounded-xl border-2 border-ink/10 space-y-3">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-wider text-gray-400">Bước 3</span>
          <div className="font-hand text-lg text-ink">Preview</div>
          <span className="font-sans text-[11px] text-gray-500">
            (xem ráp thực tế trước khi render)
          </span>
        </div>
        {canCaption && audioUrl ? (
          <VideoPreview
            scenes={scenes}
            timings={timings}
            audioUrl={audioUrl}
            captionStyle={captionStyle}
            aspectRatio={aspectRatio}
            whisperWords={whisperWords}
          />
        ) : (
          <div className="text-center py-8 font-hand text-gray-400">
            Cần audio + scenes có ảnh để preview.
          </div>
        )}
      </section>

      {/* 4. Per-scene timing table */}
      <section className="bg-white/50 backdrop-blur-sm rounded-xl border-2 border-ink/10 overflow-hidden">
        <div className="px-4 py-2 flex items-center justify-between gap-2 bg-ink/[0.04] border-b border-ink/10">
          <div className="flex items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-wider text-gray-400">Bước 4</span>
            <span className="font-hand text-lg text-ink">Timing per-scene</span>
            <span className="font-sans text-[11px] text-gray-500">
              {audioDuration ? `Audio: ${audioDuration.toFixed(2)}s` : '...'}
            </span>
          </div>
          <div className="flex gap-1.5">
            <button onClick={handleDownloadSrt} disabled={!canCaption} className="font-mono text-[10px] px-2 py-1 rounded border border-ink/20 hover:border-ink disabled:opacity-40">SRT</button>
            <button onClick={handleDownloadVtt} disabled={!canCaption} className="font-mono text-[10px] px-2 py-1 rounded border border-ink/20 hover:border-ink disabled:opacity-40">VTT</button>
          </div>
        </div>
        <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-ink/[0.02] border-b border-ink/10 font-mono text-[10px] uppercase tracking-wider text-gray-500">
          <div className="col-span-1">#</div>
          <div className="col-span-2">Bắt đầu</div>
          <div className="col-span-2">Kết thúc</div>
          <div className="col-span-1 text-right">Giây</div>
          <div className="col-span-6">Lời dẫn</div>
        </div>
        <div className="max-h-[35vh] overflow-y-auto divide-y divide-ink/5">
          {scenes.length === 0 && (
            <div className="p-4 font-sans text-sm italic text-gray-400">Chưa có scene nào.</div>
          )}
          {scenes.map((scene, idx) => {
            const t = timings.find(x => x.sceneId === scene.id);
            const dur = t ? t.end - t.start : 0;
            return (
              <div key={scene.id} className="grid grid-cols-12 gap-2 px-4 py-2 items-start font-sans text-xs">
                <div className="col-span-1 font-mono text-gray-400">{idx + 1}</div>
                <div className="col-span-2 font-mono text-ink">{t ? formatClock(t.start) : '—'}</div>
                <div className="col-span-2 font-mono text-ink">{t ? formatClock(t.end) : '—'}</div>
                <div className="col-span-1 font-mono text-right text-gray-600">{t ? `${dur.toFixed(1)}s` : '—'}</div>
                <div className="col-span-6 text-ink leading-relaxed line-clamp-2">
                  {scene.voiceover || <span className="italic text-gray-400">(trống)</span>}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 5. Render mp4 */}
      <section className="bg-paper paper-texture p-5 rounded-xl border-2 border-ink shadow-md space-y-3">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] uppercase tracking-wider text-gray-500">Bước 5</span>
          <div className="font-hand text-xl text-ink">Render video mp4</div>
        </div>

        {!videoRenderSupported && (
          <div className="font-sans text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded p-2">
            ⚠ Trình duyệt không hỗ trợ SharedArrayBuffer/WASM. Chỉ Chrome / Edge / Firefox bản mới + COOP/COEP headers chạy được. Trên dev server đã bật headers; nếu vẫn lỗi → reload bằng Cmd+Shift+R.
          </div>
        )}

        {!allScenesHaveImage && (
          <div className="font-sans text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded p-2">
            ⚠ Còn {scenes.length - sceneHasImage}/{scenes.length} cảnh chưa có ảnh. Quay lại bước Hình ảnh để tạo nốt.
          </div>
        )}

        {renderError && (
          <div className="font-sans text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">
            ⚠ {renderError}
          </div>
        )}

        {/* Progress */}
        {isRendering && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs font-sans">
              <span className="font-hand text-base text-ink">
                {renderProgress ? PROGRESS_LABEL[renderProgress.phase] : 'Đang chuẩn bị...'}
              </span>
              <span className="font-mono text-gray-500">
                {Math.round(progressRatio * 100)}%
              </span>
            </div>
            <div className="h-3 bg-white/60 rounded-full overflow-hidden border border-ink/10">
              <div
                className="h-full bg-ink transition-all duration-200"
                style={{ width: `${progressRatio * 100}%` }}
              />
            </div>
            {renderProgress?.message && (
              <div className="font-mono text-[11px] text-gray-500">{renderProgress.message}</div>
            )}
            <div className="flex justify-end">
              <button
                onClick={onCancelRender}
                className="font-hand text-sm px-3 py-1 rounded-md border-2 border-red-300 text-red-700 hover:bg-red-50"
              >
                Huỷ render
              </button>
            </div>
          </div>
        )}

        {/* Render trigger */}
        {!isRendering && (
          <div className="flex flex-wrap gap-2 items-center justify-end">
            <span className="font-sans text-[11px] text-gray-500 mr-auto">
              Resolution: {aspectRatio === '16:9' ? '1280×720' : '720×1280'} · libx264 · ultrafast
            </span>
            <Button onClick={() => onRender(timings)} disabled={!canRender}>
              {videoUrl ? '🔄 Render lại' : '🎬 Render mp4'}
            </Button>
          </div>
        )}

        {/* Preview + download */}
        {videoUrl && !isRendering && (
          <div className="space-y-2 bg-white/80 p-3 rounded-lg border border-ink/10">
            <video
              src={videoUrl}
              controls
              className="w-full rounded-md bg-black"
              style={{ aspectRatio: aspectRatio === '16:9' ? '16/9' : '9/16', maxHeight: aspectRatio === '9:16' ? 480 : undefined }}
            />
            <div className="flex justify-end">
              <Button variant="secondary" onClick={handleDownloadMp4}>⬇ Tải video.mp4</Button>
            </div>
          </div>
        )}
      </section>

      <div className="text-xs text-gray-500 font-sans p-3 bg-ink/[0.02] rounded-lg border border-ink/5">
        💡 Đổi phong cách caption ở Bước 2 → preview ở Bước 3 cập nhật ngay → render mp4 khi chốt. Karaoke chỉ bật được sau khi khớp Whisper ở Bước 1.
      </div>
    </div>
  );
};
