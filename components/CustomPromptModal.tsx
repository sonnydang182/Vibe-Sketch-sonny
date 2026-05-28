import React, { useState, useEffect } from 'react';
import { Button } from './Button';
import { Language } from '../types';

const UI: Record<Language, {
  title: string; subtitle: string; promptLabel: string; promptHint: string;
  cancel: string; submit: string;
}> = {
  Vietnamese: {
    title: 'Vẽ lại với prompt riêng',
    subtitle: 'Sửa lại mô tả hình ảnh trước khi vẽ lại.',
    promptLabel: 'Prompt mô tả ảnh',
    promptHint: 'Mô tả ngắn gọn cảnh / nhân vật / hành động. Tiếng Anh tốt hơn cho AI.',
    cancel: 'Huỷ',
    submit: 'Vẽ lại',
  },
  English: {
    title: 'Regenerate with custom prompt',
    subtitle: 'Edit the visual description before regenerating.',
    promptLabel: 'Visual prompt',
    promptHint: 'Briefly describe the scene / character / action. English works best.',
    cancel: 'Cancel',
    submit: 'Regenerate',
  },
  Japanese: {
    title: 'カスタムプロンプトで再生成',
    subtitle: '再生成前にビジュアルの説明を編集できます。',
    promptLabel: 'ビジュアルプロンプト',
    promptHint: 'シーン／キャラクター／動作を簡潔に。英語の方が精度が高いです。',
    cancel: 'キャンセル',
    submit: '再生成',
  },
};

interface Props {
  open: boolean;
  language: Language;
  defaultPrompt: string;
  contextLabel?: string; // e.g., "Cảnh 3" or scene voiceover snippet
  onClose: () => void;
  onSubmit: (prompt: string) => void;
}

export const CustomPromptModal: React.FC<Props> = ({
  open, language, defaultPrompt, contextLabel, onClose, onSubmit,
}) => {
  const [text, setText] = useState(defaultPrompt);

  useEffect(() => {
    if (open) setText(defaultPrompt);
  }, [open, defaultPrompt]);

  if (!open) return null;
  const ui = UI[language];

  const handleSubmit = () => {
    const t = text.trim();
    if (!t) return;
    onSubmit(t);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-paper paper-texture rounded-2xl border-2 border-ink shadow-xl w-full max-w-xl flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-5 border-b-2 border-ink/10 bg-white/40">
          <div className="min-w-0">
            <h3 className="font-hand text-2xl font-bold text-ink leading-tight">{ui.title}</h3>
            <p className="font-sans text-sm text-gray-600 truncate">
              {contextLabel ? `${contextLabel} — ` : ''}{ui.subtitle}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-ink hover:bg-black/5 rounded-full transition-colors shrink-0"
            aria-label={ui.cancel}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-5 space-y-3">
          <label className="font-hand text-lg text-ink block">{ui.promptLabel}</label>
          <textarea
            value={text}
            onChange={e => setText(e.target.value)}
            rows={6}
            autoFocus
            className="w-full bg-paper border-2 border-gray-300 focus:border-ink rounded-lg p-3 font-sans text-sm outline-none transition-colors resize-vertical"
          />
          <p className="font-sans text-xs text-gray-500">{ui.promptHint}</p>
        </div>

        <div className="flex justify-end gap-2 p-5 pt-0">
          <Button variant="secondary" onClick={onClose} className="px-4 py-1">
            {ui.cancel}
          </Button>
          <Button onClick={handleSubmit} disabled={!text.trim()} className="px-4 py-1">
            ✏️ {ui.submit}
          </Button>
        </div>
      </div>
    </div>
  );
};
