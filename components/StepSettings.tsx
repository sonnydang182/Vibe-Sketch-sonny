import React, { useState } from 'react';
import { Button } from './Button';
import { AppSettings, ImageProvider } from '../types';

interface StepSettingsProps {
  settings: AppSettings;
  onSave: (settings: AppSettings) => void;
}

type FunctionTab = 'text' | 'image' | 'audio' | 'whisper';

interface TabDef {
  id: FunctionTab;
  icon: string;
  label: string;
  hint: string;
}

const TABS: TabDef[] = [
  { id: 'text',    icon: '✍️',  label: 'Tạo Text',    hint: 'LLM cho tiêu đề, kịch bản, gợi ý ngữ cảnh.' },
  { id: 'image',   icon: '🎨',  label: 'Tạo Ảnh',     hint: 'Model image cho scene + thumbnail.' },
  { id: 'audio',   icon: '🎙',  label: 'Tạo Audio',   hint: 'TTS voiceover (Coachio cho EN, Gemini cho VN/JA).' },
  { id: 'whisper', icon: '🔉',  label: 'Whisper',     hint: 'Khớp caption từng từ ở bước video.' },
];

/** Visible status pill — green if a key exists, gray if missing. */
const StatusPill: React.FC<{ ok: boolean; okLabel: string; missLabel: string }> = ({ ok, okLabel, missLabel }) => (
  <span className={`font-sans text-[11px] uppercase tracking-wider px-2 py-0.5 rounded ${
    ok ? 'text-emerald-700 bg-emerald-100' : 'text-gray-500 bg-gray-100'
  }`}>
    {ok ? `✓ ${okLabel}` : `· ${missLabel}`}
  </span>
);

const IMAGE_PROVIDERS: { id: ImageProvider; label: string; description: string; needs: 'coachio' | 'gemini' }[] = [
  {
    id: 'coachio_gpt_image_2',
    label: 'Coachio · GPT Image 2',
    description: 'OpenAI gpt-image-2 qua Coachio. Sắc nét, chữ trong ảnh tốt. Mặc định.',
    needs: 'coachio',
  },
  {
    id: 'coachio_nano_banana_2',
    label: 'Coachio · Nano Banana 2',
    description: 'Google Nano Banana 2 qua Coachio. Nhanh + rẻ hơn, ổn cho doodle.',
    needs: 'coachio',
  },
  {
    id: 'gemini',
    label: 'Gemini 3 Pro Image',
    description: 'Trực tiếp qua Gemini. Cần Gemini API Key.',
    needs: 'gemini',
  },
];

export const StepSettings: React.FC<StepSettingsProps> = ({ settings, onSave }) => {
  const [draft, setDraft] = useState<AppSettings>(settings);
  const [saved, setSaved] = useState(false);
  const [tab, setTab] = useState<FunctionTab>('text');

  const handleSave = () => {
    onSave(draft);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  const hasCoachio = Boolean(draft.coachioApiKey?.trim());
  const hasGemini  = Boolean(draft.geminiApiKey?.trim());
  const hasGroq    = Boolean(draft.groqApiKey?.trim());

  return (
    <div className="flex flex-col gap-6 max-w-3xl mx-auto w-full animate-fade-in">
      <div>
        <h2 className="font-hand text-4xl font-bold text-ink">Cấu hình</h2>
        <p className="font-sans text-gray-600">
          API keys + model preference chia theo chức năng. Dán key tương ứng cho mỗi function tab.
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
            <>
              {/* Coachio key — text uses Coachio LLM (gemini-3.1-pro for script) */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <label className="font-hand text-xl text-ink">Coachio API Key</label>
                  <StatusPill ok={hasCoachio} okLabel="đã có" missLabel="trống" />
                  <span className="font-sans text-[11px] text-gray-500">Dùng cho: tiêu đề, kịch bản, gợi ý ngữ cảnh, rewrite</span>
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
                  Script dùng <code className="bg-ink/5 px-1 rounded">google/gemini-3.1-pro</code>, title + outline dùng flash-lite — chọn tự động.
                </p>
              </div>

              {/* Optional Gemini key for text — only used if Coachio absent */}
              <div className="space-y-2 border-t border-ink/10 pt-5">
                <div className="flex items-center gap-2 flex-wrap">
                  <label className="font-hand text-xl text-ink">Gemini API Key</label>
                  <StatusPill ok={hasGemini} okLabel="đã có" missLabel="trống" />
                  <span className="font-sans text-[11px] text-gray-500">Fallback nếu không có Coachio</span>
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
            </>
          )}

          {tab === 'image' && (
            <>
              {/* Model picker */}
              <div className="space-y-3">
                <label className="font-hand text-xl text-ink block">Chọn model ảnh</label>
                <div className="space-y-2">
                  {IMAGE_PROVIDERS.map(p => {
                    const active = draft.imageProvider === p.id;
                    const hasKey = p.needs === 'coachio' ? hasCoachio : hasGemini;
                    return (
                      <button
                        key={p.id}
                        onClick={() => setDraft({ ...draft, imageProvider: p.id })}
                        className={`
                          w-full text-left p-4 rounded-lg border-2 transition-all
                          ${active
                            ? 'bg-ink text-paper border-ink shadow-md'
                            : 'bg-white border-gray-200 text-gray-600 hover:border-gray-400'}
                        `}
                      >
                        <div className="flex items-center justify-between gap-3 flex-wrap">
                          <div className="font-hand text-lg">{p.label}</div>
                          <span className={`font-sans text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded ${
                            hasKey
                              ? (active ? 'bg-paper/20 text-paper' : 'bg-emerald-100 text-emerald-700')
                              : (active ? 'bg-paper/20 text-paper/80' : 'bg-gray-100 text-gray-500')
                          }`}>
                            {hasKey ? '✓ key có' : `cần ${p.needs === 'coachio' ? 'Coachio' : 'Gemini'} key`}
                          </span>
                        </div>
                        <div className={`font-sans text-sm mt-1 ${active ? 'text-paper/80' : 'text-gray-500'}`}>
                          {p.description}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Keys for image */}
              <div className="space-y-2 border-t border-ink/10 pt-5">
                <div className="flex items-center gap-2 flex-wrap">
                  <label className="font-hand text-xl text-ink">Coachio API Key</label>
                  <StatusPill ok={hasCoachio} okLabel="đã có" missLabel="trống" />
                  <span className="font-sans text-[11px] text-gray-500">Cho GPT Image 2 + Nano Banana 2</span>
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

              <div className="space-y-2 border-t border-ink/10 pt-5">
                <div className="flex items-center gap-2 flex-wrap">
                  <label className="font-hand text-xl text-ink">Gemini API Key</label>
                  <StatusPill ok={hasGemini} okLabel="đã có" missLabel="trống" />
                  <span className="font-sans text-[11px] text-gray-500">Cho Gemini 3 Pro Image</span>
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
            </>
          )}

          {tab === 'audio' && (
            <>
              <div className="bg-amber-50 border-2 border-amber-200 rounded-lg p-4 space-y-1">
                <div className="font-hand text-base text-amber-900">Provider chọn TỰ ĐỘNG theo ngôn ngữ</div>
                <ul className="font-sans text-xs text-amber-800/90 space-y-0.5 list-disc list-inside">
                  <li><strong>Tiếng Anh</strong> → Coachio · ElevenLabs (Mark / Brittney)</li>
                  <li><strong>Tiếng Việt / Nhật / khác</strong> → Gemini TTS (giọng nam / nữ chọn ở bước Audio)</li>
                </ul>
                <div className="font-sans text-[11px] text-amber-700/80 pt-1">
                  Bạn không phải chọn provider ở đây — chỉ cần dán đủ key cho ngôn ngữ định dùng.
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <label className="font-hand text-xl text-ink">Coachio API Key</label>
                  <StatusPill ok={hasCoachio} okLabel="đã có" missLabel="trống" />
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

              <div className="space-y-2 border-t border-ink/10 pt-5">
                <div className="flex items-center gap-2 flex-wrap">
                  <label className="font-hand text-xl text-ink">Gemini API Key</label>
                  <StatusPill ok={hasGemini} okLabel="đã có" missLabel="trống" />
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

              <p className="font-sans text-[11px] text-gray-500">
                💡 Chọn giọng nam/nữ + phong cách đọc ngay tại bước "Phòng Thu Âm".
              </p>
            </>
          )}

          {tab === 'whisper' && (
            <>
              <div className="space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <label className="font-hand text-xl text-ink">Groq API Key</label>
                  <StatusPill ok={hasGroq} okLabel="đã có" missLabel="trống" />
                  <span className="font-sans text-[11px] text-gray-500">Cho khớp caption từng từ</span>
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
                  Dùng <code className="bg-ink/5 px-1 rounded">whisper-large-v3-turbo</code> ở bước 7 để khớp caption chuẩn từng từ với audio. ~$0.0004/phút. Lấy ở console.groq.com.
                </p>
              </div>

              <div className="bg-ink/[0.02] border border-ink/10 rounded-lg p-4">
                <div className="font-hand text-base text-ink mb-1">Tại sao cần Whisper?</div>
                <p className="font-sans text-xs text-gray-600 leading-relaxed">
                  TTS trả về 1 file audio liền mạch. Để biết câu nào nằm ở giây nào trong file đó (để khớp scene + karaoke caption), cần transcribe ngược lại bằng Whisper.
                  Không có Groq key → vẫn render được nhưng caption chỉ chia ước tính theo số từ.
                </p>
              </div>
            </>
          )}
        </div>

        <div className="border-t-2 border-ink/10 px-6 py-4 bg-ink/[0.02] flex items-center gap-3">
          <Button onClick={handleSave} className="px-6">
            Lưu cấu hình
          </Button>
          {saved && (
            <span className="font-hand text-lg text-green-700">Đã lưu ✓</span>
          )}
          <div className="ml-auto flex items-center gap-2 text-xs">
            <span className="font-sans text-gray-500">Trạng thái key:</span>
            <StatusPill ok={hasCoachio} okLabel="Coachio" missLabel="Coachio" />
            <StatusPill ok={hasGemini}  okLabel="Gemini"  missLabel="Gemini" />
            <StatusPill ok={hasGroq}    okLabel="Groq"    missLabel="Groq" />
          </div>
        </div>
      </div>
    </div>
  );
};
