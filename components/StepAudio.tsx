import React, { useEffect, useRef, useState } from 'react';
import { Button } from './Button';
import { Scene, GenerationConfig, AudioProvider } from '../types';

interface StepAudioProps {
  scenes: Scene[];
  audioUrl?: string;
  isLoading: boolean;
  /** Gemini path — single combined TTS over the whole script. */
  onGenerateAudio: (overrideScript?: string) => void;
  /** Coachio path — TTS per scene (one clip per scene). Optional onlySceneId
   *  retries a single failed scene without re-running the whole batch. */
  onGenerateSceneAudios: (onlySceneId?: string) => void;
  onExportZip: () => void;
  onBack: () => void;
  duration: GenerationConfig['duration'];
  onChangeDuration: (d: GenerationConfig['duration']) => void;
  audioProvider: AudioProvider;
  hasGeminiKey: boolean;
  hasCoachioKey: boolean;
  onOpenSettings: () => void;
}

const DURATIONS: GenerationConfig['duration'][] = ['Short (60s)', 'Medium (3 mins)', 'Long (5-10 mins)'];

/**
 * Audio step — supports two modes:
 *  - Gemini: gộp toàn bộ kịch bản thành 1 voiceover liền mạch.
 *  - Coachio ElevenLabs: TTS riêng từng cảnh, giữ audio rời để dựng video sau.
 */
export const StepAudio: React.FC<StepAudioProps> = ({
  scenes,
  audioUrl,
  isLoading,
  onGenerateAudio,
  onGenerateSceneAudios,
  onExportZip,
  onBack,
  duration,
  onChangeDuration,
  audioProvider,
  hasGeminiKey,
  hasCoachioKey,
  onOpenSettings,
}) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const isCoachio = audioProvider === 'coachio_elevenlabs';

  const derivedScript = scenes.map(s => s.voiceover).filter(Boolean).join(' ');

  const [editing, setEditing] = useState(false);
  const [editedScript, setEditedScript] = useState(derivedScript);

  useEffect(() => {
    if (audioUrl && audioRef.current) {
      audioRef.current.load();
      audioRef.current.play().catch(() => {});
    }
  }, [audioUrl]);

  useEffect(() => {
    if (!editing) setEditedScript(derivedScript);
  }, [derivedScript, editing]);

  // Provider gating — show the right banner / disable the right button.
  const providerKeyMissing =
    (isCoachio && !hasCoachioKey) || (!isCoachio && !hasGeminiKey);

  const scenesWithAudio = scenes.filter(s => s.audioUrl).length;
  const canExport = isCoachio
    // Coachio path: ZIP useful as soon as at least one clip is ready (or the
    // user can skip audio entirely and re-record later).
    ? true
    : (audioUrl ? true : !hasGeminiKey);

  const scriptToUse = editing ? editedScript : derivedScript;
  const wordCount = scriptToUse.trim().split(/\s+/).filter(Boolean).length;
  const charCount = scriptToUse.length;

  // -------------------------------------------------------------------------
  // Layout
  // -------------------------------------------------------------------------
  return (
    <div className="flex flex-col gap-6 w-full max-w-4xl mx-auto h-full">
      <div className="flex flex-col md:flex-row justify-between items-center gap-4">
        <div>
          <h2 className="font-hand text-3xl font-bold text-ink">Phòng Thu Âm</h2>
          <p className="font-sans text-gray-600 text-sm">
            {isCoachio
              ? 'Coachio · ElevenLabs — tạo voiceover riêng cho từng cảnh (chuẩn bị cho luồng video tự động).'
              : 'Gemini TTS — gộp toàn bộ lời dẫn thành 1 file audio liền mạch.'}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap justify-end items-center">
          <label className="font-sans text-xs text-gray-500 flex items-center gap-1.5">
            Thời lượng:
            <select
              value={duration}
              onChange={e => onChangeDuration(e.target.value as GenerationConfig['duration'])}
              className="font-hand text-sm bg-white border border-ink/20 rounded-md px-2 py-1 hover:border-ink focus:border-ink outline-none"
            >
              {DURATIONS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </label>
          <Button variant="secondary" onClick={onBack} disabled={isLoading}>Quay lại</Button>
          <Button onClick={onExportZip} disabled={!canExport}>
            {isCoachio
              ? `⬇ Tải ZIP${scenesWithAudio > 0 ? ` (${scenesWithAudio}/${scenes.length} audio)` : ' (chưa có audio)'}`
              : (hasGeminiKey ? '⬇ Tải ZIP' : '⬇ Tải ZIP (không kèm audio)')}
          </Button>
        </div>
      </div>

      {providerKeyMissing && (
        <div className="flex flex-col md:flex-row md:items-center gap-3 p-4 rounded-xl border-2 border-amber-300 bg-amber-50">
          <div className="flex-1">
            <div className="font-hand text-lg text-amber-900">
              {isCoachio ? 'Chưa có Coachio API Key' : 'Chưa có Gemini API Key'}
            </div>
            <div className="font-sans text-xs text-amber-800/80">
              {isCoachio
                ? 'Provider hiện tại là Coachio · ElevenLabs nhưng chưa có key. Vào Cấu hình để dán key, hoặc chuyển sang Gemini TTS.'
                : 'Provider hiện tại là Gemini TTS nhưng chưa có key. Vào Cấu hình để dán key, hoặc chuyển sang Coachio TTS, hoặc bỏ qua audio và xuất ZIP.'}
            </div>
          </div>
          <Button variant="secondary" onClick={onOpenSettings} className="shrink-0">
            ⚙️ Mở Cấu hình
          </Button>
        </div>
      )}

      {isCoachio ? (
        // -------------------- COACHIO: per-scene list --------------------
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="font-hand text-xl text-ink">Audio từng cảnh</div>
              <div className="font-sans text-[11px] text-gray-500">
                {scenes.length} cảnh · {scenesWithAudio}/{scenes.length} đã tạo audio
              </div>
            </div>
            <Button
              onClick={() => onGenerateSceneAudios()}
              isLoading={isLoading}
              disabled={!derivedScript.trim() || !hasCoachioKey}
            >
              {scenesWithAudio > 0 ? '🔄 Tạo lại toàn bộ' : '🎙 Tạo voiceover từng cảnh'}
            </Button>
          </div>

          <div className="space-y-2 bg-white/40 rounded-xl border-2 border-ink/10 p-3 max-h-[60vh] overflow-y-auto">
            {scenes.map((scene, idx) => {
              const stale = scene.audioUrl && scene.audioForText && scene.audioForText !== scene.voiceover;
              return (
                <div
                  key={scene.id}
                  className="flex flex-col md:flex-row gap-3 p-3 bg-paper rounded-lg border border-ink/10"
                >
                  <div className="md:w-1/2 min-w-0">
                    <div className="font-mono text-[10px] uppercase tracking-wider text-gray-400 mb-1">
                      SCENE {idx + 1}
                    </div>
                    <div className="font-sans text-sm leading-relaxed text-ink line-clamp-3">
                      {scene.voiceover || <span className="italic text-gray-400">(trống)</span>}
                    </div>
                  </div>
                  <div className="md:w-1/2 flex flex-col gap-2">
                    {scene.audioUrl ? (
                      <audio controls src={scene.audioUrl} className="w-full h-9" />
                    ) : (
                      <div className="h-9 flex items-center font-hand text-sm text-gray-400">
                        {scene.isGeneratingAudio ? 'Đang tạo...' : 'Chưa có audio'}
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-xs">
                      {scene.audioError && (
                        <span className="text-red-700 truncate flex-1" title={scene.audioError}>
                          ⚠ {scene.audioError}
                        </span>
                      )}
                      {stale && !scene.audioError && (
                        <span className="text-amber-700 flex-1">⚠ Voiceover đã đổi — audio cũ lỗi thời.</span>
                      )}
                      <button
                        onClick={() => onGenerateSceneAudios(scene.id)}
                        disabled={isLoading || !hasCoachioKey || !scene.voiceover.trim()}
                        className="font-hand text-xs px-2 py-1 rounded-md border border-ink/20 hover:border-ink hover:bg-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {scene.audioUrl ? '🔄 Lại' : '🎙 Tạo'}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="text-xs text-gray-500 font-sans p-3 bg-ink/[0.02] rounded-lg border border-ink/5">
            💡 Mỗi cảnh có file audio riêng → trong ZIP sẽ nằm ở <code className="bg-ink/5 px-1 rounded">audio/scene_NN.mp3</code>.
            Đây là tiền đề để dựng video tự động (khớp ảnh + voiceover theo thời gian từng cảnh).
          </div>
        </div>
      ) : (
        // -------------------- GEMINI: combined single audio --------------------
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="flex flex-col gap-3 bg-white/50 p-5 rounded-xl border-2 border-ink/10 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-hand text-xl text-ink">Kịch bản gộp</div>
                <div className="font-sans text-[11px] text-gray-500">
                  {scenes.length} cảnh · {wordCount} từ · {charCount} ký tự
                </div>
              </div>
              <button
                onClick={() => setEditing(!editing)}
                className="font-hand text-sm px-3 py-1 rounded-lg border-2 border-ink/20 hover:border-ink hover:bg-white transition-colors"
                title={editing ? 'Dùng lại bản gộp tự động từ các cảnh' : 'Sửa tay trước khi TTS'}
              >
                {editing ? '⤺ Khôi phục' : '✏️ Sửa tay'}
              </button>
            </div>
            {editing ? (
              <textarea
                value={editedScript}
                onChange={e => setEditedScript(e.target.value)}
                rows={12}
                className="flex-1 w-full p-3 bg-paper rounded-lg border-2 border-ink/30 focus:border-ink outline-none resize-vertical font-sans text-sm leading-relaxed"
              />
            ) : (
              <div className="flex-1 p-3 bg-paper rounded-lg font-sans text-sm leading-relaxed whitespace-pre-wrap max-h-[40vh] overflow-y-auto">
                {derivedScript || <span className="italic text-gray-400">Chưa có lời dẫn nào.</span>}
              </div>
            )}
            {editing && (
              <p className="font-sans text-[11px] text-gray-500">
                💡 Sửa ở đây chỉ ảnh hưởng audio. Để cập nhật lời dẫn từng cảnh, quay lại Xưởng Hình Ảnh.
              </p>
            )}
          </div>

          <div className="flex flex-col items-center justify-center bg-paper paper-texture p-6 rounded-xl border-2 border-ink shadow-md relative overflow-hidden">
            <div className="text-center space-y-4 z-10 w-full flex flex-col items-center">
              <div className="w-20 h-20 bg-ink rounded-full flex items-center justify-center shadow-lg">
                {isLoading ? (
                  <div className="animate-spin rounded-full h-9 w-9 border-b-2 border-paper"></div>
                ) : (
                  <svg className="w-9 h-9 text-paper" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
                    <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
                  </svg>
                )}
              </div>

              {audioUrl ? (
                <div className="w-full bg-white/80 p-3 rounded-lg border border-ink/10">
                  <audio ref={audioRef} controls src={audioUrl} className="w-full h-10" />
                  <p className="text-[11px] text-gray-500 mt-1 font-sans">voiceover.wav</p>
                </div>
              ) : (
                <p className="font-hand text-lg text-gray-500">Chưa có audio</p>
              )}

              <Button
                onClick={() => onGenerateAudio(editing ? editedScript : undefined)}
                isLoading={isLoading}
                disabled={!scriptToUse.trim() || !hasGeminiKey}
                className="w-full max-w-xs"
              >
                {audioUrl ? '🔄 Tạo Lại Giọng Đọc' : '🎙 Tạo Giọng Đọc'}
              </Button>
            </div>

            <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-accent/10 rounded-full blur-2xl"></div>
            <div className="absolute -top-10 -left-10 w-40 h-40 bg-ink/5 rounded-full blur-2xl"></div>
          </div>
        </div>
      )}

      {/* CapCut tip */}
      <div className="text-xs text-gray-500 font-sans p-3 bg-ink/[0.02] rounded-lg border border-ink/5">
        💡 Trong ZIP: <code className="bg-ink/5 px-1 rounded">voiceover.wav</code> (audio gộp Gemini) +
        <code className="bg-ink/5 px-1 rounded mx-1">audio/scene_NN.mp3</code> (Coachio per-scene) +
        <code className="bg-ink/5 px-1 rounded mx-1">scene_NN.png</code> (ảnh từng cảnh).
      </div>
    </div>
  );
};
