import React, { useEffect, useMemo, useState } from 'react';
import { Button } from './Button';
import { Scene, SceneTiming, Language } from '../types';
import {
  estimateSceneTimings,
  buildSRT,
  buildVTT,
  probeAudioDuration,
} from '../services/captionService';

interface StepVideoProps {
  scenes: Scene[];
  audioUrl?: string;
  language: Language;
  /** When false, the "Khớp với Whisper" button is disabled with an info hint. */
  hasWhisperProvider: boolean;
  onAlignWithWhisper: () => void;
  onBack: () => void;
  onExportZip: () => void;
}

const formatClock = (s: number): string => {
  const total = Math.max(0, s);
  const m = Math.floor(total / 60);
  const sec = total % 60;
  return `${String(m).padStart(2, '0')}:${sec.toFixed(2).padStart(5, '0')}`;
};

/**
 * StepVideo — bước cuối của wizard. Tạm thời chỉ làm 3 việc:
 *   1. Tính timing scene từ audio gộp (estimate dựa trên word-count khi chưa
 *      có Whisper, hoặc word-level alignment khi có).
 *   2. Cho download SRT / VTT để dùng trong CapCut / DaVinci.
 *   3. Hiển thị placeholder cho "Render mp4" — sẽ làm trong PR kế tiếp
 *      (ffmpeg.wasm, ảnh + audio + subtitle burn-in).
 */
export const StepVideo: React.FC<StepVideoProps> = ({
  scenes,
  audioUrl,
  language,
  hasWhisperProvider,
  onAlignWithWhisper,
  onBack,
  onExportZip,
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

  // Estimated timings — what we show until Whisper is wired in.
  const timings: SceneTiming[] = useMemo(() => {
    if (!audioDuration || audioDuration <= 0) return [];
    return estimateSceneTimings(scenes, audioDuration, language);
  }, [scenes, audioDuration, language]);

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

  const canCaption = audioUrl && audioDuration && timings.length > 0;

  return (
    <div className="flex flex-col gap-6 w-full max-w-4xl mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-center gap-4">
        <div>
          <h2 className="font-hand text-3xl font-bold text-ink">Khớp Caption + Dựng Video</h2>
          <p className="font-sans text-gray-600 text-sm">
            Suy timing scene từ audio gộp → xuất caption (SRT/VTT). Render mp4 tự động sẽ thêm trong PR sau.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap justify-end items-center">
          <Button variant="secondary" onClick={onBack}>Quay lại</Button>
          <Button onClick={onExportZip} disabled={scenes.length === 0}>⬇ Tải ZIP</Button>
        </div>
      </div>

      {!audioUrl && (
        <div className="p-4 rounded-xl border-2 border-amber-300 bg-amber-50">
          <div className="font-hand text-lg text-amber-900">Chưa có audio</div>
          <p className="font-sans text-xs text-amber-800/80">
            Quay lại Phòng Thu Âm và tạo voiceover trước rồi mới khớp caption được.
          </p>
        </div>
      )}

      {audioError && (
        <div className="p-4 rounded-xl border-2 border-red-300 bg-red-50">
          <div className="font-hand text-lg text-red-900">Lỗi đọc audio</div>
          <p className="font-sans text-xs text-red-800/80">{audioError}</p>
        </div>
      )}

      {/* Timing source + Whisper plug-in */}
      <div className="bg-white/50 backdrop-blur-sm p-4 rounded-xl border-2 border-ink/10 flex flex-col md:flex-row md:items-center gap-3">
        <div className="flex-1 space-y-1">
          <div className="font-hand text-lg text-ink">Phương pháp khớp caption</div>
          <div className="font-sans text-[12px] text-gray-600">
            {timings[0]?.source === 'whisper'
              ? 'Đã khớp bằng Whisper (word-level timestamps).'
              : 'Đang dùng estimate theo word-count — đủ chính xác ~80%. Khớp Whisper sẽ chuẩn từng từ.'}
          </div>
        </div>
        <Button
          variant="secondary"
          onClick={onAlignWithWhisper}
          disabled={!hasWhisperProvider || !audioUrl}
          title={!hasWhisperProvider ? 'Chưa có Whisper provider — sẽ thêm trong PR sau' : ''}
        >
          🎯 Khớp với Whisper {!hasWhisperProvider && '(Sắp ra mắt)'}
        </Button>
      </div>

      {/* Per-scene timing table */}
      <div className="bg-white/50 backdrop-blur-sm rounded-xl border-2 border-ink/10 overflow-hidden">
        <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-ink/[0.04] border-b border-ink/10 font-mono text-[10px] uppercase tracking-wider text-gray-500">
          <div className="col-span-1">#</div>
          <div className="col-span-2">Bắt đầu</div>
          <div className="col-span-2">Kết thúc</div>
          <div className="col-span-1 text-right">Giây</div>
          <div className="col-span-6">Lời dẫn</div>
        </div>
        <div className="max-h-[55vh] overflow-y-auto divide-y divide-ink/5">
          {scenes.length === 0 && (
            <div className="p-4 font-sans text-sm italic text-gray-400">Chưa có scene nào.</div>
          )}
          {scenes.map((scene, idx) => {
            const t = timings.find(x => x.sceneId === scene.id);
            const dur = t ? t.end - t.start : 0;
            return (
              <div key={scene.id} className="grid grid-cols-12 gap-2 px-4 py-2 items-start font-sans text-xs">
                <div className="col-span-1 font-mono text-gray-400">{idx + 1}</div>
                <div className="col-span-2 font-mono text-ink">
                  {t ? formatClock(t.start) : '—'}
                </div>
                <div className="col-span-2 font-mono text-ink">
                  {t ? formatClock(t.end) : '—'}
                </div>
                <div className="col-span-1 font-mono text-right text-gray-600">
                  {t ? `${dur.toFixed(1)}s` : '—'}
                </div>
                <div className="col-span-6 text-ink leading-relaxed">
                  {scene.voiceover || <span className="italic text-gray-400">(trống)</span>}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Download actions */}
      <div className="flex flex-wrap gap-2 items-center justify-end">
        <span className="font-sans text-[11px] text-gray-500 mr-auto">
          {audioDuration ? `Tổng audio: ${audioDuration.toFixed(2)}s` : ''}
        </span>
        <Button variant="secondary" onClick={handleDownloadSrt} disabled={!canCaption}>
          ⬇ captions.srt
        </Button>
        <Button variant="secondary" onClick={handleDownloadVtt} disabled={!canCaption}>
          ⬇ captions.vtt
        </Button>
        <Button onClick={() => alert('Render mp4 tự động sẽ thêm trong PR sau (ffmpeg.wasm).')} disabled>
          🎬 Render video (Sắp ra mắt)
        </Button>
      </div>

      <div className="text-xs text-gray-500 font-sans p-3 bg-ink/[0.02] rounded-lg border border-ink/5">
        💡 Tạm thời: dùng SRT/VTT trong CapCut / DaVinci / Premiere — kéo vào timeline cùng audio + ảnh các scene.
        Bước render tự động (ffmpeg.wasm) sẽ thay thế khâu thủ công này trong PR tới.
      </div>
    </div>
  );
};
