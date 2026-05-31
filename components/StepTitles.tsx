import React, { useState } from 'react';
import { Button } from './Button';
import { GeneratedTitle } from '../types';

interface StepTitlesProps {
  titles: GeneratedTitle[];
  onSelect: (id: string) => void;
  /** Submit a user-typed custom title and continue. */
  onSubmitCustom: (text: string) => void;
  onNext: () => void;
  onBack: () => void;
  isLoading: boolean;
}

const CUSTOM_TITLE_ID = 'custom-title';

export const StepTitles: React.FC<StepTitlesProps> = ({
  titles,
  onSelect,
  onSubmitCustom,
  onNext,
  onBack,
  isLoading,
}) => {
  const selectedId = titles.find(t => t.selected)?.id;
  const customTitleInList = titles.find(t => t.id === CUSTOM_TITLE_ID)?.text || '';
  const [customDraft, setCustomDraft] = useState(customTitleInList);

  const isCustomSelected = selectedId === CUSTOM_TITLE_ID;
  const canContinue = Boolean(selectedId) && (!isCustomSelected || customDraft.trim().length > 0);

  const handleContinue = () => {
    if (isCustomSelected) {
      onSubmitCustom(customDraft.trim());
    }
    onNext();
  };

  return (
    <div className="flex flex-col gap-6 max-w-2xl mx-auto w-full">
      <div className="text-center">
        <h2 className="font-hand text-3xl font-bold text-ink">Chọn Tiêu Đề Viral</h2>
        <p className="font-sans text-gray-600">Đây là "câu móc" (hook) quan trọng nhất của video.</p>
      </div>

      <div className="space-y-3">
        {titles
          .filter(t => t.id !== CUSTOM_TITLE_ID)
          .map((title) => (
            <div
              key={title.id}
              onClick={() => onSelect(title.id)}
              className={`
                p-4 rounded-xl border-2 cursor-pointer transition-all duration-200 group
                ${title.selected
                  ? 'bg-ink text-paper border-ink shadow-lg scale-[1.02]'
                  : 'bg-white text-ink border-gray-200 hover:border-ink hover:shadow-md'}
              `}
            >
              <h3 className="font-sans font-bold text-lg md:text-xl">{title.text}</h3>
            </div>
          ))}

        {/* Custom title option — always last, lets the user override AI suggestions */}
        <div
          onClick={() => onSelect(CUSTOM_TITLE_ID)}
          className={`
            p-4 rounded-xl border-2 cursor-pointer transition-all duration-200
            ${isCustomSelected
              ? 'bg-ink text-paper border-ink shadow-lg scale-[1.02]'
              : 'bg-white text-ink border-dashed border-gray-300 hover:border-ink hover:shadow-md'}
          `}
        >
          <div className="font-hand text-sm uppercase tracking-wider mb-1 opacity-70">
            ✍️ Hoặc tự nhập tiêu đề của bạn
          </div>
          <input
            type="text"
            value={customDraft}
            onChange={e => setCustomDraft(e.target.value)}
            onClick={e => e.stopPropagation()}
            onFocus={() => onSelect(CUSTOM_TITLE_ID)}
            placeholder="Gõ tiêu đề bạn muốn..."
            className={`
              w-full bg-transparent outline-none font-sans font-bold text-lg md:text-xl
              ${isCustomSelected ? 'text-paper placeholder-paper/40' : 'text-ink placeholder-gray-400'}
            `}
          />
        </div>
      </div>

      <div className="flex justify-between pt-4">
        <Button variant="ghost" onClick={onBack}>Quay lại</Button>
        <Button
          onClick={handleContinue}
          disabled={!canContinue}
          isLoading={isLoading}
        >
          Viết Kịch Bản
        </Button>
      </div>
    </div>
  );
};
