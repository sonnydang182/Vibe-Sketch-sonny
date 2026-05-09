import React, { useState } from 'react';
import { Button } from './Button';
import { AppSettings, ImageProvider } from '../types';

interface StepSettingsProps {
  settings: AppSettings;
  onSave: (settings: AppSettings) => void;
}

const PROVIDERS: { id: ImageProvider; label: string; description: string }[] = [
  {
    id: 'gemini',
    label: 'Gemini 3 Pro Image (mặc định)',
    description: 'Sử dụng API key của Google AI Studio (Gemini). Dùng cho cả tạo text và tạo ảnh.',
  },
  {
    id: 'coachio_gpt_image_2',
    label: 'Coachio · GPT Image 2',
    description: 'Tạo ảnh qua API Coachio (model gpt_image_2). Vẫn cần Gemini key cho tạo text.',
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
        <p className="font-sans text-gray-600">Chọn nhà cung cấp tạo ảnh và quản lý API key.</p>
      </div>

      <div className="bg-white/50 backdrop-blur-sm p-8 rounded-xl border-2 border-ink/10 shadow-sm space-y-6">
        {/* Gemini API Key — required for text + (default) image */}
        <div className="space-y-2">
          <label className="font-hand text-2xl text-ink block">Gemini API Key</label>
          <input
            type="password"
            autoComplete="off"
            value={draft.geminiApiKey}
            onChange={e => setDraft({ ...draft, geminiApiKey: e.target.value })}
            placeholder="AIza... (lấy ở aistudio.google.com)"
            className="w-full bg-paper border-2 border-gray-300 focus:border-ink rounded-lg p-3 font-mono text-sm outline-none transition-colors"
          />
          <p className="font-sans text-xs text-gray-500">
            Dùng cho tạo tiêu đề, kịch bản, voiceover và ảnh (khi chọn Gemini). Lưu cục bộ trong trình duyệt.
          </p>
        </div>

        <div className="border-t border-ink/10 pt-6 space-y-3">
          <label className="font-hand text-2xl text-ink block">Model tạo ảnh</label>
          <div className="space-y-2">
            {PROVIDERS.map(p => (
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

        {draft.imageProvider === 'coachio_gpt_image_2' && (
          <div className="space-y-2">
            <label className="font-hand text-2xl text-ink block">Coachio API Key</label>
            <input
              type="password"
              autoComplete="off"
              value={draft.coachioApiKey}
              onChange={e => setDraft({ ...draft, coachioApiKey: e.target.value })}
              placeholder="lv_xxxxxxxxxxxxxxxxxxxxxxxx"
              className="w-full bg-paper border-2 border-gray-300 focus:border-ink rounded-lg p-3 font-mono text-sm outline-none transition-colors"
            />
            <p className="font-sans text-xs text-gray-500">
              Lưu cục bộ trong trình duyệt (localStorage). Không gửi lên server bên thứ ba.
            </p>
          </div>
        )}

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
