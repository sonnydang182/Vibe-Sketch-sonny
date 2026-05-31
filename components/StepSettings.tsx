import React, { useState } from 'react';
import { Button } from './Button';
import { AppSettings, ImageProvider, AudioProvider } from '../types';

interface StepSettingsProps {
  settings: AppSettings;
  onSave: (settings: AppSettings) => void;
}

const IMAGE_PROVIDERS: { id: ImageProvider; label: string; description: string }[] = [
  {
    id: 'coachio_gpt_image_2',
    label: 'Coachio · GPT Image 2 (mặc định)',
    description: 'Tạo ảnh qua Coachio (model gpt_image_2). Chỉ cần Coachio API Key.',
  },
  {
    id: 'gemini',
    label: 'Gemini 3 Pro Image',
    description: 'Tạo ảnh trực tiếp qua Gemini. Cần Gemini API Key.',
  },
];

const AUDIO_PROVIDERS: { id: AudioProvider; label: string; description: string }[] = [
  {
    id: 'coachio_elevenlabs',
    label: 'Coachio · ElevenLabs TTS (mặc định)',
    description: 'Tạo voiceover qua Coachio (ElevenLabs v2). Chỉ 1 file audio gộp — caption khớp scene sẽ ghép sau bằng Whisper.',
  },
  {
    id: 'gemini',
    label: 'Gemini TTS',
    description: 'Gộp toàn bộ kịch bản thành 1 file voiceover liền mạch. Cần Gemini API Key.',
  },
];

export const StepSettings: React.FC<StepSettingsProps> = ({ settings, onSave }) => {
  const [draft, setDraft] = useState<AppSettings>(settings);
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    onSave(draft);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  return (
    <div className="flex flex-col gap-6 max-w-2xl mx-auto w-full animate-fade-in">
      <div>
        <h2 className="font-hand text-4xl font-bold text-ink">Cấu hình</h2>
        <p className="font-sans text-gray-600">
          Chỉ cần dán <strong>Coachio API Key</strong> là chạy được toàn bộ wizard (text, ảnh, voiceover). Gemini chỉ cần nếu bạn muốn dùng Gemini TTS hoặc Gemini cho ảnh.
        </p>
      </div>

      <div className="bg-white/50 backdrop-blur-sm p-8 rounded-xl border-2 border-ink/10 shadow-sm space-y-6">
        {/* Coachio API Key — primary, handles text + images + audio */}
        <div className="space-y-2">
          <label className="font-hand text-2xl text-ink block">
            Coachio API Key <span className="font-sans text-xs uppercase tracking-wider text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">Khuyến nghị</span>
          </label>
          <input
            type="password"
            autoComplete="off"
            value={draft.coachioApiKey}
            onChange={e => setDraft({ ...draft, coachioApiKey: e.target.value })}
            placeholder="lv_xxxxxxxxxxxxxxxxxxxxxxxx"
            className="w-full bg-paper border-2 border-gray-300 focus:border-ink rounded-lg p-3 font-mono text-sm outline-none transition-colors"
          />
          <p className="font-sans text-xs text-gray-500">
            Dùng cho tạo tiêu đề, kịch bản, ảnh và voiceover (ElevenLabs). Lưu cục bộ trong trình duyệt.
          </p>
        </div>

        {/* Gemini API Key — optional */}
        <div className="space-y-2 border-t border-ink/10 pt-6">
          <label className="font-hand text-2xl text-ink block">
            Gemini API Key <span className="font-sans text-xs uppercase tracking-wider text-gray-600 bg-gray-100 px-1.5 py-0.5 rounded">Tuỳ chọn</span>
          </label>
          <input
            type="password"
            autoComplete="off"
            value={draft.geminiApiKey}
            onChange={e => setDraft({ ...draft, geminiApiKey: e.target.value })}
            placeholder="AIza..."
            className="w-full bg-paper border-2 border-gray-300 focus:border-ink rounded-lg p-3 font-mono text-sm outline-none transition-colors"
          />
          <p className="font-sans text-xs text-gray-500">
            Cần nếu bạn chọn Gemini TTS hoặc Gemini cho ảnh. Không có key thì các tùy chọn Gemini sẽ bị vô hiệu.
          </p>
        </div>

        {/* Image provider */}
        <div className="border-t border-ink/10 pt-6 space-y-3">
          <label className="font-hand text-2xl text-ink block">Model tạo ảnh</label>
          <div className="space-y-2">
            {IMAGE_PROVIDERS.map(p => (
              <button
                key={p.id}
                onClick={() => setDraft({ ...draft, imageProvider: p.id })}
                className={`
                  w-full text-left p-4 rounded-lg border-2 transition-all
                  ${draft.imageProvider === p.id
                    ? 'bg-ink text-paper border-ink shadow-md'
                    : 'bg-white border-gray-200 text-gray-600 hover:border-gray-400'}
                `}
              >
                <div className="font-hand text-xl">{p.label}</div>
                <div className={`font-sans text-sm mt-0.5 ${draft.imageProvider === p.id ? 'text-paper/80' : 'text-gray-500'}`}>
                  {p.description}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Audio provider */}
        <div className="border-t border-ink/10 pt-6 space-y-3">
          <label className="font-hand text-2xl text-ink block">Model tạo voiceover</label>
          <div className="space-y-2">
            {AUDIO_PROVIDERS.map(p => (
              <button
                key={p.id}
                onClick={() => setDraft({ ...draft, audioProvider: p.id })}
                className={`
                  w-full text-left p-4 rounded-lg border-2 transition-all
                  ${draft.audioProvider === p.id
                    ? 'bg-ink text-paper border-ink shadow-md'
                    : 'bg-white border-gray-200 text-gray-600 hover:border-gray-400'}
                `}
              >
                <div className="font-hand text-xl">{p.label}</div>
                <div className={`font-sans text-sm mt-0.5 ${draft.audioProvider === p.id ? 'text-paper/80' : 'text-gray-500'}`}>
                  {p.description}
                </div>
              </button>
            ))}
          </div>

          <p className="font-sans text-[11px] text-gray-500 pt-1">
            💡 Chọn giọng / phong cách ngay tại bước "Phòng Thu Âm" — không cần quay lại Cấu hình.
          </p>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <Button onClick={handleSave} className="px-6">
            Lưu cấu hình
          </Button>
          {saved && (
            <span className="font-hand text-lg text-green-700">Đã lưu ✓</span>
          )}
        </div>
      </div>
    </div>
  );
};
