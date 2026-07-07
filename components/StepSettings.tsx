import React, { useState } from 'react';
import { Button } from './Button';
import { AppSettings, ImageProvider } from '../types';
import { checkLocalTtsHealth, listLocalTtsVoices, DEFAULT_LOCAL_TTS_URL } from '../services/localTtsService';

interface StepSettingsProps {
  settings: AppSettings;
  onSave: (settings: AppSettings) => void;
}

type FunctionTab = 'text' | 'image' | 'audio' | 'whisper';

const TABS: { id: FunctionTab; icon: string; label: string; hint: string }[] = [
  { id: 'text',    icon: '✍️',  label: 'Text',    hint: 'Coachio → tiêu đề, kịch bản, gợi ý dàn ý.' },
  { id: 'image',   icon: '🎨',  label: 'Ảnh',     hint: 'Coachio → ảnh scene + thumbnail. Chọn 1 model.' },
  { id: 'audio',   icon: '🎙',  label: 'Audio',   hint: 'TTS auto theo ngôn ngữ. Tiếng Việt có tùy chọn Local.' },
  { id: 'whisper', icon: '🔉',  label: 'Whisper', hint: 'Groq → khớp caption từng từ.' },
];

const IMAGE_MODELS: { id: ImageProvider; label: string; description: string }[] = [
  {
    id: 'coachio_gpt_image_2',
    label: 'GPT Image 2',
    description: 'Sắc nét, chữ trong ảnh tốt. Mặc định.',
  },
  {
    id: 'coachio_nano_banana_2',
    label: 'Nano Banana 2',
    description: 'Nhanh + rẻ hơn, ổn cho doodle.',
  },
];

/** Compact status pill: filled if key exists, muted if empty. */
const KeyPill: React.FC<{ ok: boolean; name: string }> = ({ ok, name }) => (
  <span className={`font-sans text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded ${
    ok ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'
  }`}>
    {ok ? '✓' : '·'} {name}
  </span>
);

export const StepSettings: React.FC<StepSettingsProps> = ({ settings, onSave }) => {
  const [draft, setDraft] = useState<AppSettings>(settings);
  const [saved, setSaved] = useState(false);
  const [tab, setTab] = useState<FunctionTab>('text');
  const [localCheckState, setLocalCheckState] = useState<
    { state: 'idle' } | { state: 'checking' } | { state: 'ok'; voiceCount: number } | { state: 'err'; msg: string }
  >({ state: 'idle' });

  const hasCoachio = Boolean(draft.coachioApiKey?.trim());
  const hasGemini  = Boolean(draft.geminiApiKey?.trim());
  const hasGroq    = Boolean(draft.groqApiKey?.trim());

  const handleSave = () => {
    onSave(draft);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const testLocalTts = async () => {
    const url = draft.localTtsUrl || DEFAULT_LOCAL_TTS_URL;
    setLocalCheckState({ state: 'checking' });
    try {
      const health = await checkLocalTtsHealth(url);
      if (!health.loaded) {
        setLocalCheckState({ state: 'err', msg: 'Server chạy nhưng model chưa nạp — chờ 1 lát.' });
        return;
      }
      const voices = await listLocalTtsVoices(url);
      setLocalCheckState({ state: 'ok', voiceCount: voices.length });
    } catch (e: any) {
      setLocalCheckState({ state: 'err', msg: e?.message || String(e) });
    }
  };

  return (
    <div className="flex flex-col gap-6 max-w-3xl mx-auto w-full animate-fade-in">
      <div>
        <h2 className="font-hand text-4xl font-bold text-ink">Cấu hình</h2>
        <p className="font-sans text-gray-600">
          <strong>Coachio</strong> lo text + ảnh. <strong>Gemini</strong> chỉ dùng cho TTS tiếng Việt/Nhật/khác.
          <strong> Groq</strong> tuỳ chọn cho caption sync.
        </p>
      </div>

      <div className="bg-white/50 backdrop-blur-sm rounded-xl border-2 border-ink/10 shadow-sm overflow-hidden">
        {/* Tab strip */}
        <div className="flex border-b-2 border-ink/10 bg-ink/[0.02]">
          {TABS.map(t => {
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`
                  flex-1 px-3 py-3 font-hand text-base transition-all border-b-2 -mb-0.5
                  flex items-center justify-center gap-1.5
                  ${active
                    ? 'bg-paper text-ink border-ink'
                    : 'text-gray-500 hover:text-ink hover:bg-paper/60 border-transparent'}
                `}
              >
                <span className="text-base">{t.icon}</span>
                <span className="hidden sm:inline">{t.label}</span>
              </button>
            );
          })}
        </div>

        {/* Tab body */}
        <div className="p-6 space-y-6">
          <p className="font-sans text-sm text-gray-600 italic">{TABS.find(t => t.id === tab)?.hint}</p>

          {tab === 'text' && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <label className="font-hand text-xl text-ink">Coachio API Key</label>
                <KeyPill ok={hasCoachio} name="Coachio" />
              </div>
              <input
                type="password"
                autoComplete="off"
                value={draft.coachioApiKey}
                onChange={e => setDraft({ ...draft, coachioApiKey: e.target.value })}
                placeholder="lv_xxxxxxxxxxxxxxxxxxxxxxxx"
                className="w-full bg-paper border-2 border-gray-300 focus:border-ink rounded-lg p-3 font-mono text-sm outline-none transition-colors"
              />
              <p className="font-sans text-xs text-gray-500">
                Script dùng <code className="bg-ink/5 px-1 rounded">google/gemini-3.1-pro</code>,
                title + outline dùng flash-lite — auto cascade nếu model không có.
              </p>
            </div>
          )}

          {tab === 'image' && (
            <>
              <div className="space-y-3">
                <label className="font-hand text-xl text-ink block">Model ảnh</label>
                <div className="space-y-2">
                  {IMAGE_MODELS.map(m => {
                    const active = draft.imageProvider === m.id;
                    return (
                      <button
                        key={m.id}
                        onClick={() => setDraft({ ...draft, imageProvider: m.id })}
                        className={`
                          w-full text-left p-3 rounded-lg border-2 transition-all
                          ${active
                            ? 'bg-ink text-paper border-ink shadow-md'
                            : 'bg-white border-gray-200 text-gray-600 hover:border-gray-400'}
                        `}
                      >
                        <div className="font-hand text-lg">{m.label}</div>
                        <div className={`font-sans text-sm mt-0.5 ${active ? 'text-paper/80' : 'text-gray-500'}`}>
                          {m.description}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-2 border-t border-ink/10 pt-5">
                <div className="flex items-center gap-2 flex-wrap">
                  <label className="font-hand text-xl text-ink">Coachio API Key</label>
                  <KeyPill ok={hasCoachio} name="Coachio" />
                </div>
                <input
                  type="password"
                  autoComplete="off"
                  value={draft.coachioApiKey}
                  onChange={e => setDraft({ ...draft, coachioApiKey: e.target.value })}
                  placeholder="lv_xxxxxxxxxxxxxxxxxxxxxxxx"
                  className="w-full bg-paper border-2 border-gray-300 focus:border-ink rounded-lg p-3 font-mono text-sm outline-none transition-colors"
                />
                <p className="font-sans text-xs text-gray-500">Cùng key với tab Text — cả 2 model ảnh đều qua Coachio.</p>
              </div>
            </>
          )}

          {tab === 'audio' && (
            <>
              {/* Language routing summary */}
              <div className="bg-amber-50 border-2 border-amber-200 rounded-lg p-3 space-y-1">
                <div className="font-hand text-base text-amber-900">Auto theo ngôn ngữ</div>
                <ul className="font-sans text-xs text-amber-800/90 space-y-0.5 list-disc list-inside">
                  <li><strong>English</strong> → Coachio · ElevenLabs (Mark / Brittney)</li>
                  <li><strong>Vietnamese</strong> → Gemini (mặc định) hoặc <strong>Local TTS</strong> nếu bật</li>
                  <li><strong>Japanese / khác</strong> → Gemini TTS</li>
                </ul>
              </div>

              {/* Gemini key — needed for VN/JA/other */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <label className="font-hand text-xl text-ink">Gemini API Key</label>
                  <KeyPill ok={hasGemini} name="Gemini" />
                  <span className="font-sans text-[11px] text-gray-500">Cho TTS tiếng Việt / Nhật / khác</span>
                </div>
                <input
                  type="password"
                  autoComplete="off"
                  value={draft.geminiApiKey}
                  onChange={e => setDraft({ ...draft, geminiApiKey: e.target.value })}
                  placeholder="AIza..."
                  className="w-full bg-paper border-2 border-gray-300 focus:border-ink rounded-lg p-3 font-mono text-sm outline-none transition-colors"
                />
              </div>

              {/* Coachio key — needed for English */}
              <div className="space-y-2 border-t border-ink/10 pt-5">
                <div className="flex items-center gap-2 flex-wrap">
                  <label className="font-hand text-xl text-ink">Coachio API Key</label>
                  <KeyPill ok={hasCoachio} name="Coachio" />
                  <span className="font-sans text-[11px] text-gray-500">Cho TTS tiếng Anh (ElevenLabs)</span>
                </div>
                <input
                  type="password"
                  autoComplete="off"
                  value={draft.coachioApiKey}
                  onChange={e => setDraft({ ...draft, coachioApiKey: e.target.value })}
                  placeholder="lv_xxxxxxxxxxxxxxxxxxxxxxxx"
                  className="w-full bg-paper border-2 border-gray-300 focus:border-ink rounded-lg p-3 font-mono text-sm outline-none transition-colors"
                />
              </div>

              {/* Local TTS toggle + URL */}
              <div className="space-y-2 border-t border-ink/10 pt-5">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <label className="font-hand text-xl text-ink flex items-center gap-2">
                    💻 Local TTS <span className="font-sans text-[11px] font-normal px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded uppercase tracking-wider">VN only</span>
                  </label>
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={draft.localTtsEnabled}
                      onChange={e => setDraft({ ...draft, localTtsEnabled: e.target.checked })}
                      className="w-5 h-5 accent-ink"
                    />
                    <span className="font-hand text-base text-ink">{draft.localTtsEnabled ? 'Đang bật' : 'Tắt'}</span>
                  </label>
                </div>
                <p className="font-sans text-xs text-gray-600">
                  Kết nối server <strong>VieNeu Studio</strong> chạy local — không cần API key, không tốn token.
                  Khi bật, Bước Audio thêm dropdown chọn Gemini/Local cho kịch bản tiếng Việt.
                </p>

                {draft.localTtsEnabled && (
                  <div className="space-y-2 pt-2">
                    <label className="font-hand text-base text-ink block">URL server</label>
                    <div className="flex gap-2 flex-wrap">
                      <input
                        type="text"
                        value={draft.localTtsUrl}
                        onChange={e => setDraft({ ...draft, localTtsUrl: e.target.value })}
                        placeholder={DEFAULT_LOCAL_TTS_URL}
                        className="flex-1 min-w-[240px] bg-paper border-2 border-gray-300 focus:border-ink rounded-lg p-2 font-mono text-sm outline-none transition-colors"
                      />
                      <button
                        type="button"
                        onClick={testLocalTts}
                        disabled={localCheckState.state === 'checking'}
                        className="font-hand text-sm px-3 py-1.5 rounded-lg border-2 border-ink/40 hover:border-ink bg-white shadow-sm disabled:opacity-60"
                      >
                        {localCheckState.state === 'checking' ? '⏳ Đang test…' : '🔌 Test kết nối'}
                      </button>
                    </div>
                    {localCheckState.state === 'ok' && (
                      <div className="p-2 rounded border-2 border-emerald-200 bg-emerald-50 font-sans text-xs text-emerald-800">
                        ✓ Kết nối OK · {localCheckState.voiceCount} giọng sẵn sàng.
                      </div>
                    )}
                    {localCheckState.state === 'err' && (
                      <div className="p-2 rounded border-2 border-red-200 bg-red-50 font-sans text-xs text-red-800">
                        ⚠️ {localCheckState.msg}
                      </div>
                    )}
                    <p className="font-sans text-[11px] text-gray-500">
                      Server mặc định: <code className="bg-ink/5 px-1 rounded">{DEFAULT_LOCAL_TTS_URL}</code>.
                      Request tự chạy qua Vite proxy (<code className="bg-ink/5 px-1 rounded">/local-tts</code>) để tránh CORS —
                      không cần sửa server VieNeu.
                      Đổi port khác? Set env <code className="bg-ink/5 px-1 rounded">VITE_LOCAL_TTS_TARGET</code> rồi restart <code className="bg-ink/5 px-1 rounded">npm run dev</code>.
                    </p>
                  </div>
                )}
              </div>

              <p className="font-sans text-[11px] text-gray-500">
                💡 Chọn giọng nam/nữ + phong cách đọc ngay ở Bước Audio.
              </p>
            </>
          )}

          {tab === 'whisper' && (
            <>
              <div className="space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <label className="font-hand text-xl text-ink">Groq API Key</label>
                  <KeyPill ok={hasGroq} name="Groq" />
                  <span className="font-sans text-[11px] text-gray-500">Optional</span>
                </div>
                <input
                  type="password"
                  autoComplete="off"
                  value={draft.groqApiKey}
                  onChange={e => setDraft({ ...draft, groqApiKey: e.target.value })}
                  placeholder="gsk_..."
                  className="w-full bg-paper border-2 border-gray-300 focus:border-ink rounded-lg p-3 font-mono text-sm outline-none transition-colors"
                />
                <p className="font-sans text-xs text-gray-500">
                  Dùng <code className="bg-ink/5 px-1 rounded">whisper-large-v3-turbo</code> để khớp caption từng từ.
                  ~$0.0004/phút. Không có key vẫn render được — caption chỉ chia ước tính theo số từ.
                </p>
              </div>
            </>
          )}
        </div>

        {/* Footer: save + status pill row */}
        <div className="border-t-2 border-ink/10 px-6 py-4 bg-ink/[0.02] flex items-center gap-3 flex-wrap">
          <Button onClick={handleSave} className="px-6">
            Lưu cấu hình
          </Button>
          {saved && <span className="font-hand text-lg text-green-700">Đã lưu ✓</span>}
          <div className="ml-auto flex items-center gap-2 text-xs">
            <span className="font-sans text-gray-500">Keys:</span>
            <KeyPill ok={hasCoachio} name="Coachio" />
            <KeyPill ok={hasGemini}  name="Gemini" />
            <KeyPill ok={hasGroq}    name="Groq" />
            <KeyPill ok={draft.localTtsEnabled} name="Local" />
          </div>
        </div>
      </div>
    </div>
  );
};
