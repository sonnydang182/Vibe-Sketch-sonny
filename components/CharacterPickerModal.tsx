import React, { useState, useEffect } from 'react';
import { CharacterId, Language } from '../types';
import { CHARACTERS } from '../data/characters';

const UI: Record<Language, {
  title: string; subtitle: string;
  countLabel: string; slotPrefix: string;
  defaultGroup: string; doodleGroup: string; close: string;
  done: string;
  hint1: string; hint2: string; hint3: string;
}> = {
  Vietnamese: {
    title: 'Chọn nhân vật',
    subtitle: 'AI sẽ tạo ảnh theo nhân vật bạn chọn.',
    countLabel: 'Số nhân vật:',
    slotPrefix: 'Nhân vật',
    defaultGroup: 'Mặc định',
    doodleGroup: '20 nhân vật doodle',
    close: 'Đóng',
    done: 'Xong',
    hint1: '1 nhân vật chính. Khi cần phụ trợ trong cảnh, AI có thể vẽ thêm stickman.',
    hint2: '2 nhân vật chính tương tác xuyên video. Nhân vật phụ thêm (nếu có) sẽ là stickman.',
    hint3: '3 nhân vật. Gợi ý: nhân vật thứ 3 nên để stickman để các cảnh không quá phức tạp.',
  },
  English: {
    title: 'Choose characters',
    subtitle: 'The AI will draw scenes using the characters you pick.',
    countLabel: 'How many:',
    slotPrefix: 'Character',
    defaultGroup: 'Default',
    doodleGroup: '20 doodle characters',
    close: 'Close',
    done: 'Done',
    hint1: '1 main character. The AI may add a plain stickman as a supporting figure when the script needs it.',
    hint2: '2 main characters that interact throughout. Any extra figures will be stickmen.',
    hint3: '3 characters. Tip: keep slot 3 as a stickman to avoid cluttered scenes.',
  },
  Japanese: {
    title: 'キャラクターを選ぶ',
    subtitle: '選んだキャラクターでAIが描きます。',
    countLabel: 'キャラ数:',
    slotPrefix: 'キャラ',
    defaultGroup: 'デフォルト',
    doodleGroup: '20種類のドゥードル',
    close: '閉じる',
    done: '完了',
    hint1: 'メイン1人。脇役が必要な場面では棒人間が追加される場合があります。',
    hint2: 'メイン2人が動画全体で絡みます。3人目以降は棒人間になります。',
    hint3: '3人。ヒント: 3人目を棒人間にすると画面がスッキリします。',
  },
};

interface Props {
  open: boolean;
  language: Language;
  characters: CharacterId[]; // current selection (length 1-3)
  onClose: () => void;
  onChange: (characters: CharacterId[]) => void;
}

export const CharacterPickerModal: React.FC<Props> = ({ open, language, characters, onClose, onChange }) => {
  const [draft, setDraft] = useState<CharacterId[]>(characters);
  const [activeSlot, setActiveSlot] = useState(0);

  // Sync draft when the modal opens with fresh props.
  useEffect(() => {
    if (open) {
      setDraft(characters.length > 0 ? characters : ['stickman']);
      setActiveSlot(0);
    }
  }, [open, characters]);

  if (!open) return null;
  const ui = UI[language];
  const count = draft.length;
  const stickman = CHARACTERS[0];
  const doodles = CHARACTERS.slice(1);

  const setCount = (n: 1 | 2 | 3) => {
    let next = [...draft];
    if (n > next.length) {
      // Add slots — default new ones to stickman
      while (next.length < n) next.push('stickman');
    } else {
      next = next.slice(0, n);
    }
    setDraft(next);
    setActiveSlot(s => Math.min(s, n - 1));
  };

  const pickForSlot = (id: CharacterId) => {
    const next = [...draft];
    next[activeSlot] = id;
    setDraft(next);
  };

  const commit = () => {
    onChange(draft);
    onClose();
  };

  const renderTile = (id: CharacterId, displayLabel: string, imgUrl: string, isDefault: boolean) => {
    const selected = draft[activeSlot] === id;
    return (
      <button
        key={id}
        onClick={() => pickForSlot(id)}
        className={`group relative bg-white rounded-xl border-2 transition-all overflow-hidden text-left ${
          selected
            ? 'border-ink shadow-md ring-2 ring-ink/20 scale-[1.02]'
            : 'border-ink/10 hover:border-ink/40 hover:shadow-sm'
        }`}
      >
        <div className="aspect-[4/3] bg-paper flex items-center justify-center overflow-hidden">
          {imgUrl ? (
            <img src={imgUrl} alt={displayLabel} className="w-full h-full object-contain" loading="lazy" />
          ) : (
            <span className="font-hand text-gray-400">no preview</span>
          )}
        </div>
        <div className="p-2 border-t border-ink/5">
          <div className="flex items-center justify-between gap-1">
            <span className="font-hand text-base text-ink leading-tight line-clamp-1">
              {isDefault ? '★ ' : ''}{displayLabel}
            </span>
            {selected && (
              <span className="font-hand text-xs bg-ink text-paper px-1.5 py-0.5 rounded shrink-0">✓</span>
            )}
          </div>
        </div>
      </button>
    );
  };

  const hintText = count === 1 ? ui.hint1 : count === 2 ? ui.hint2 : ui.hint3;

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-paper paper-texture rounded-2xl border-2 border-ink shadow-xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b-2 border-ink/10 bg-white/40">
          <div>
            <h3 className="font-hand text-3xl font-bold text-ink">{ui.title}</h3>
            <p className="font-sans text-sm text-gray-600">{ui.subtitle}</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-ink hover:bg-black/5 rounded-full transition-colors"
            aria-label={ui.close}
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Count + slot tabs */}
        <div className="px-5 py-3 border-b border-ink/10 bg-white/30 space-y-3">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="font-sans text-xs text-gray-500">{ui.countLabel}</span>
            {[1, 2, 3].map(n => (
              <button
                key={n}
                onClick={() => setCount(n as 1 | 2 | 3)}
                className={`font-hand text-sm px-3 py-1 rounded-full border-2 transition-colors ${
                  count === n
                    ? 'bg-ink text-paper border-ink'
                    : 'bg-white text-ink border-ink/20 hover:border-ink'
                }`}
              >
                {n}
              </button>
            ))}
            <span className="flex-1"></span>
            <button
              onClick={commit}
              className="font-hand text-base px-4 py-1 rounded-lg bg-ink text-paper hover:bg-black transition-colors"
            >
              ✓ {ui.done}
            </button>
          </div>
          <p className="font-sans text-xs text-gray-500">{hintText}</p>

          {/* Slot tabs */}
          {count > 1 && (
            <div className="flex items-center gap-2 flex-wrap">
              {draft.map((id, i) => {
                const ch = CHARACTERS.find(c => c.id === id) || stickman;
                return (
                  <button
                    key={i}
                    onClick={() => setActiveSlot(i)}
                    className={`flex items-center gap-2 px-2 py-1 rounded-lg border-2 transition-colors ${
                      activeSlot === i ? 'border-ink bg-white' : 'border-ink/15 bg-white/40 hover:border-ink/40'
                    }`}
                  >
                    <div className="w-7 h-7 rounded bg-paper border border-ink/10 overflow-hidden flex items-center justify-center">
                      {ch.thumbUrl && <img src={ch.thumbUrl} alt="" className="w-full h-full object-contain" />}
                    </div>
                    <span className="font-hand text-sm leading-tight">
                      {ui.slotPrefix} {i + 1}
                      <span className="font-sans text-[10px] text-gray-500 block leading-none">{ch.labels[language]}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Body: character grid for the active slot */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <section>
            <h4 className="font-hand text-xl text-ink mb-2 flex items-center gap-2">
              <span>★</span>{ui.defaultGroup}
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
              {renderTile(stickman.id, stickman.labels[language], stickman.thumbUrl, true)}
            </div>
          </section>
          <section>
            <h4 className="font-hand text-xl text-ink mb-2 flex items-center gap-2">
              <span>🎨</span>{ui.doodleGroup}
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
              {doodles.map(c => renderTile(c.id, `${c.index}. ${c.labels[language]}`, c.thumbUrl, false))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
