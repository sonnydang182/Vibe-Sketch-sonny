import React, { useEffect, useRef, useState } from 'react';
import { Button } from './Button';
import { Scene, GenerationConfig, AudioProvider, Language } from '../types';
import { COACHIO_VOICES } from '../services/coachioService';
import {
  LocalTtsVoice,
  listLocalTtsVoices,
  checkLocalTtsHealth,
} from '../services/localTtsService';

interface StepAudioProps {
  scenes: Scene[];
  audioUrl?: string;
  isLoading: boolean;
  /** Single combined TTS over the whole script — both providers route through here. */
  onGenerateAudio: (overrideScript?: string) => void;
  onExportZip: () => void;
  /** Continue to step 7 (caption + video). Requires audio to exist. */
  onNext: () => void;
  onBack: () => void;
  duration: GenerationConfig['duration'];
  onChangeDuration: (d: GenerationConfig['duration']) => void;
  audioProvider: AudioProvider;
  /** Drives provider auto-pick (English → Coachio, else → Gemini). */
  language: Language;
  hasGeminiKey: boolean;
  hasCoachioKey: boolean;
  onOpenSettings: () => void;
  /** Per-project voice settings — live-editable in this step (persisted via App). */
  coachioTtsVoice: string;
  geminiTtsStyle: string;
  geminiTtsGender: 'female' | 'male';
  onChangeCoachioVoice: (voiceId: string) => void;
  onChangeGeminiStyle: (style: string) => void;
  onChangeGeminiGender: (g: 'female' | 'male') => void;
  // ---- Local TTS (Vietnamese only) ----
  /** Toggle from Settings — if false, the "Local" option is disabled. */
  localTtsEnabled: boolean;
  /** Base URL for the local TTS server (e.g. http://127.0.0.1:8001). */
  localTtsUrl: string;
  /** Selected voice id from GET /api/voices. */
  localTtsVoice: string;
  /** Vietnamese TTS provider preference (gemini | local). */
  vietnameseTtsPreference: 'gemini' | 'local';
  onChangeLocalTtsVoice: (voiceId: string) => void;
  onChangeVietnameseTtsPreference: (p: 'gemini' | 'local') => void;
}

const DURATIONS: GenerationConfig['duration'][] = ['Short (60s)', 'Medium (3 mins)', 'Long (5-10 mins)'];

/** Predefined Gemini TTS style presets. Click to set the textarea below. */
const GEMINI_STYLE_PRESETS: { id: string; label: string; instruction: string }[] = [
  { id: 'normal', label: 'Bình thường', instruction: '' },
  { id: 'professional', label: 'Chuyên nghiệp', instruction: 'Read the following clearly, like a professional news anchor — confident, neutral, well-paced.' },
  { id: 'inspirational', label: 'Truyền cảm hứng', instruction: 'Read the following with energy and passion, like a motivational speaker — warm, engaging, varied intonation.' },
  { id: 'storyteller', label: 'Kể chuyện', instruction: 'Read the following warmly like a storyteller, with natural pauses and an engaging, intimate tone.' },
];

/**
 * Audio step — gộp toàn bộ kịch bản thành 1 voiceover liền mạch.
 *
 * Picker giọng/phong cách sống ngay tại bước này (không phải mở Cấu hình).
 * Per-scene timing sẽ được suy ra sau bằng Whisper alignment (xem roadmap video).
 */
export const StepAudio: React.FC<StepAudioProps> = ({
  scenes,
  audioUrl,
  isLoading,
  onGenerateAudio,
  onExportZip,
  onNext,
  onBack,
  duration,
  onChangeDuration,
  audioProvider,
  language,
  hasGeminiKey,
  hasCoachioKey,
  onOpenSettings,
  coachioTtsVoice,
  geminiTtsStyle,
  geminiTtsGender,
  onChangeCoachioVoice,
  onChangeGeminiStyle,
  onChangeGeminiGender,
  localTtsEnabled,
  localTtsUrl,
  localTtsVoice,
  vietnameseTtsPreference,
  onChangeLocalTtsVoice,
  onChangeVietnameseTtsPreference,
}) => {
  const audioRef = useRef<HTMLAudioElement>(null);
  // Provider mode is derived from language + Vietnamese sub-preference.
  //   English    → Coachio ElevenLabs
  //   Vietnamese → Gemini OR Local (user picks in this component)
  //   Japanese/x → Gemini
  const isCoachio = language === 'English';
  const canUseLocal = language === 'Vietnamese' && localTtsEnabled;
  const isLocal = canUseLocal && vietnameseTtsPreference === 'local';
  const isGemini = !isCoachio && !isLocal;

  // Fetch local voices on demand — only when the user is on Vietnamese +
  // Local mode. Fetches lazily and caches while this step is mounted.
  const [localVoices, setLocalVoices] = useState<LocalTtsVoice[]>([]);
  const [localLoadingVoices, setLocalLoadingVoices] = useState(false);
  const [localHealthErr, setLocalHealthErr] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!isLocal) return;
    let cancelled = false;
    (async () => {
      setLocalLoadingVoices(true);
      setLocalHealthErr(undefined);
      try {
        const health = await checkLocalTtsHealth(localTtsUrl);
        if (cancelled) return;
        if (!health.loaded) {
          setLocalHealthErr('Server chưa nạp model — chờ chút rồi thử lại.');
        }
        const voices = await listLocalTtsVoices(localTtsUrl);
        if (!cancelled) setLocalVoices(voices);
      } catch (e: any) {
        if (!cancelled) {
          setLocalHealthErr(
            `Không kết nối được: ${e?.message || e}. Kiểm tra server đã chạy tại ${localTtsUrl}?`,
          );
          setLocalVoices([]);
        }
      } finally {
        if (!cancelled) setLocalLoadingVoices(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isLocal, localTtsUrl]);

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

  // Provider key requirements:
  //   Coachio path  → needs Coachio key
  //   Gemini path   → needs Gemini key
  //   Local path    → needs the server reachable (checked separately)
  const providerKeyMissing =
    (isCoachio && !hasCoachioKey) ||
    (isGemini && !hasGeminiKey);

  const scriptToUse = editing ? editedScript : derivedScript;
  const wordCount = scriptToUse.trim().split(/\s+/).filter(Boolean).length;
  const charCount = scriptToUse.length;

  const providerLabel = isCoachio
    ? 'Coachio · ElevenLabs (EN)'
    : isLocal
      ? `Local TTS · VieNeu (${language})`
      : `Gemini TTS (${language})`;
  // Localized labels for the gender picker — chosen language drives copy.
  const genderLabels: Record<Language, { female: string; male: string; heading: string; hint: string }> = {
    Vietnamese: { female: 'Giọng nữ', male: 'Giọng nam', heading: 'Chọn giọng',
                  hint: 'Gemini TTS — chọn giọng nam/nữ. Đổi ngôn ngữ tự động đổi voice prebuilt.' },
    English:    { female: 'Female',   male: 'Male',     heading: 'Voice',
                  hint: 'Gemini TTS — pick male or female. Voice auto-tuned per language.' },
    Japanese:   { female: '女性ボイス', male: '男性ボイス', heading: 'ボイス',
                  hint: 'Gemini TTS — 男性 / 女性を選択。言語に応じて自動調整。' },
  };
  const exportLabel = !audioUrl
    ? (providerKeyMissing ? '⬇ Tải ZIP (không kèm audio)' : '⬇ Tải ZIP')
    : '⬇ Tải ZIP';

  return (
    <div className="flex flex-col gap-6 w-full max-w-4xl mx-auto h-full">
      <div className="flex flex-col md:flex-row justify-between items-center gap-4">
        <div>
          <h2 className="font-hand text-3xl font-bold text-ink">Phòng Thu Âm</h2>
          <p className="font-sans text-gray-600 text-sm">
            {providerLabel} — 1 file audio liền mạch (caption khớp scene ghép sau bằng Whisper).
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
          <Button variant="secondary" onClick={onExportZip} disabled={!audioUrl && !providerKeyMissing}>
            {exportLabel}
          </Button>
          <Button onClick={onNext} disabled={!audioUrl}>
            Khớp Caption →
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
              Vào Cấu hình để dán API key, đổi provider, hoặc bỏ qua audio và xuất ZIP.
            </div>
          </div>
          <Button variant="secondary" onClick={onOpenSettings} className="shrink-0">
            ⚙️ Mở Cấu hình
          </Button>
        </div>
      )}

      {/* Vietnamese-only: pick provider (Gemini vs Local VieNeu). Only shown
          when local TTS is enabled in Settings. */}
      {canUseLocal && (
        <div className="bg-emerald-50/60 backdrop-blur-sm p-4 rounded-xl border-2 border-emerald-200 space-y-2">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <label className="font-hand text-lg text-emerald-900">Provider TTS tiếng Việt</label>
            <span className="font-sans text-[11px] text-emerald-800/70">
              Local đang bật ({localTtsUrl})
            </span>
          </div>
          <div className="flex gap-2">
            <select
              value={vietnameseTtsPreference}
              onChange={e => onChangeVietnameseTtsPreference(e.target.value as 'gemini' | 'local')}
              className="flex-1 bg-white border-2 border-emerald-300 focus:border-emerald-600 rounded-lg p-2 font-sans text-sm outline-none transition-colors"
            >
              <option value="gemini">☁️ Gemini TTS (cloud — cần API key)</option>
              <option value="local">💻 Local TTS · VieNeu Studio (không cần key)</option>
            </select>
          </div>
        </div>
      )}

      {/* Voice / Style picker — inline so user can tune the voice without
          leaving the wizard. Updates persist via App's settings handler. */}
      <div className="bg-white/50 backdrop-blur-sm p-4 rounded-xl border-2 border-ink/10 space-y-3">
        {isCoachio ? (
          <>
            <div className="flex items-center justify-between gap-3">
              <label className="font-hand text-lg text-ink">Giọng đọc</label>
              <span className="font-sans text-[11px] text-gray-500">{providerLabel}</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {COACHIO_VOICES.map(v => (
                <button
                  key={v.id}
                  onClick={() => onChangeCoachioVoice(v.id)}
                  className={`
                    p-2 rounded-lg border-2 text-left transition-all
                    ${coachioTtsVoice === v.id
                      ? 'bg-ink text-paper border-ink shadow-md'
                      : 'bg-white border-gray-200 text-gray-600 hover:border-gray-400'}
                  `}
                >
                  <div className="font-hand text-base">{v.label}</div>
                  <div className={`font-mono text-[10px] truncate ${coachioTtsVoice === v.id ? 'text-paper/60' : 'text-gray-400'}`}>
                    {v.id}
                  </div>
                </button>
              ))}
            </div>
          </>
        ) : isLocal ? (
          <>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <label className="font-hand text-lg text-ink">Chọn giọng (Local)</label>
              <span className="font-sans text-[11px] text-gray-500">{providerLabel}</span>
            </div>

            {localHealthErr && (
              <div className="p-3 rounded-lg border-2 border-red-200 bg-red-50 font-sans text-xs text-red-800">
                ⚠️ {localHealthErr}
              </div>
            )}

            {localLoadingVoices ? (
              <div className="font-sans text-sm text-gray-500 italic">Đang tải danh sách giọng…</div>
            ) : localVoices.length === 0 ? (
              <div className="font-sans text-sm text-gray-500 italic">
                {localHealthErr
                  ? 'Không tải được giọng — kiểm tra server rồi tải lại trang.'
                  : 'Server không có giọng nào — dùng giọng mặc định của VieNeu.'}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-64 overflow-y-auto pr-1">
                <button
                  onClick={() => onChangeLocalTtsVoice('')}
                  className={`
                    p-2 rounded-lg border-2 text-left transition-all
                    ${localTtsVoice === ''
                      ? 'bg-ink text-paper border-ink shadow-md'
                      : 'bg-white border-gray-200 text-gray-600 hover:border-gray-400'}
                  `}
                >
                  <div className="font-hand text-base">🎲 Giọng mặc định</div>
                  <div className={`font-mono text-[10px] truncate ${localTtsVoice === '' ? 'text-paper/60' : 'text-gray-400'}`}>
                    (server chọn)
                  </div>
                </button>
                {localVoices.map(v => (
                  <button
                    key={v.id}
                    onClick={() => onChangeLocalTtsVoice(v.id)}
                    className={`
                      p-2 rounded-lg border-2 text-left transition-all
                      ${localTtsVoice === v.id
                        ? 'bg-ink text-paper border-ink shadow-md'
                        : 'bg-white border-gray-200 text-gray-600 hover:border-gray-400'}
                    `}
                  >
                    <div className="font-hand text-base">{v.label}</div>
                    <div className={`font-mono text-[10px] truncate ${localTtsVoice === v.id ? 'text-paper/60' : 'text-gray-400'}`}>
                      {v.id}
                    </div>
                  </button>
                ))}
              </div>
            )}
            <p className="font-sans text-[11px] text-gray-500">
              💻 Local TTS chạy tại {localTtsUrl}. Không dùng API cloud → không tốn token, giới hạn quota theo máy bạn.
            </p>
          </>
        ) : (
          <>
            {/* Gender picker — first, since it's the primary choice */}
            <div className="flex items-center justify-between gap-3">
              <label className="font-hand text-lg text-ink">{genderLabels[language].heading}</label>
              <span className="font-sans text-[11px] text-gray-500">{providerLabel}</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {(['female', 'male'] as const).map(g => {
                const active = geminiTtsGender === g;
                return (
                  <button
                    key={g}
                    onClick={() => onChangeGeminiGender(g)}
                    className={`
                      p-3 rounded-lg border-2 text-center transition-all flex items-center justify-center gap-2
                      ${active
                        ? 'bg-ink text-paper border-ink shadow-md'
                        : 'bg-white border-gray-200 text-gray-600 hover:border-gray-400'}
                    `}
                  >
                    <span className="text-xl">{g === 'female' ? '👩' : '👨'}</span>
                    <span className="font-hand text-base">{genderLabels[language][g]}</span>
                  </button>
                );
              })}
            </div>

            {/* Style preset row — secondary tuning */}
            <div className="flex items-center justify-between gap-3 pt-2">
              <label className="font-hand text-base text-ink">Phong cách đọc</label>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {GEMINI_STYLE_PRESETS.map(preset => {
                const active = geminiTtsStyle.trim() === preset.instruction.trim();
                return (
                  <button
                    key={preset.id}
                    onClick={() => onChangeGeminiStyle(preset.instruction)}
                    className={`
                      p-2 rounded-lg border-2 text-center transition-all
                      ${active
                        ? 'bg-ink text-paper border-ink shadow-md'
                        : 'bg-white border-gray-200 text-gray-600 hover:border-gray-400'}
                    `}
                  >
                    <div className="font-hand text-sm">{preset.label}</div>
                  </button>
                );
              })}
            </div>
            <textarea
              value={geminiTtsStyle}
              onChange={e => onChangeGeminiStyle(e.target.value)}
              placeholder="Hoặc tự nhập hướng dẫn — vd: 'Read calmly with long pauses, like a meditation guide'."
              rows={2}
              className="w-full bg-paper border-2 border-gray-300 focus:border-ink rounded-lg p-2 font-sans text-xs outline-none transition-colors resize-vertical"
            />
            <p className="font-sans text-[11px] text-gray-500">
              {genderLabels[language].hint} Hướng dẫn được ghép vào đầu prompt TTS — bỏ trống = giọng mặc định.
            </p>
          </>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left: combined script */}
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

        {/* Right: TTS player */}
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
                <p className="text-[11px] text-gray-500 mt-1 font-sans">{providerLabel}</p>
              </div>
            ) : (
              <p className="font-hand text-lg text-gray-500">Chưa có audio</p>
            )}

            <Button
              onClick={() => onGenerateAudio(editing ? editedScript : undefined)}
              isLoading={isLoading}
              disabled={!scriptToUse.trim() || providerKeyMissing}
              className="w-full max-w-xs"
            >
              {audioUrl ? '🔄 Tạo Lại Giọng Đọc' : '🎙 Tạo Giọng Đọc'}
            </Button>
          </div>

          <div className="absolute -bottom-10 -right-10 w-40 h-40 bg-accent/10 rounded-full blur-2xl"></div>
          <div className="absolute -top-10 -left-10 w-40 h-40 bg-ink/5 rounded-full blur-2xl"></div>
        </div>
      </div>

      {/* CapCut tip */}
      <div className="text-xs text-gray-500 font-sans p-3 bg-ink/[0.02] rounded-lg border border-ink/5">
        💡 Trong ZIP: <code className="bg-ink/5 px-1 rounded">voiceover.wav</code> hoặc <code className="bg-ink/5 px-1 rounded">voiceover.mp3</code> (audio gộp) +
        <code className="bg-ink/5 px-1 rounded mx-1">scene_NN.png</code> (ảnh từng cảnh).
        Trên CapCut, kéo voiceover làm track audio chính rồi rải ảnh theo nhịp lời dẫn.
      </div>
    </div>
  );
};
