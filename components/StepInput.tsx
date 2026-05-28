import React, { useState } from 'react';
import { Button } from './Button';
import { GenerationConfig, Language, CharacterId } from '../types';
import { TopicSuggestionsModal } from './TopicSuggestionsModal';
import { CharacterPickerModal } from './CharacterPickerModal';
import { getCharacter, CharacterDef } from '../data/characters';

interface StepInputProps {
  config: GenerationConfig;
  setConfig: React.Dispatch<React.SetStateAction<GenerationConfig>>;
  onNext: () => void;
  isLoading: boolean;
}

export const StepInput: React.FC<StepInputProps> = ({ config, setConfig, onNext, isLoading }) => {
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [characterOpen, setCharacterOpen] = useState(false);
  const durations = ['Short (60s)', 'Medium (3 mins)', 'Long (5-10 mins)'] as const;
  const tones = ['Stoic', 'Motivational', 'Dark Philosophy', 'Humorous'] as const;
  const characterIds: CharacterId[] = config.characters?.length ? config.characters : ['stickman'];
  const pickedCharacters: CharacterDef[] = characterIds.map(id => getCharacter(id));
  
  const languages: { id: Language; label: string; flag: string }[] = [
      { id: 'Vietnamese', label: 'Tiếng Việt', flag: '🇻🇳' },
      { id: 'English', label: 'English', flag: '🇺🇸' },
      { id: 'Japanese', label: '日本語', flag: '🇯🇵' }
  ];

  return (
    <div className="flex flex-col gap-6 max-w-2xl mx-auto w-full animate-fade-in">
      <div className="text-center space-y-2">
        <h2 className="font-hand text-4xl font-bold text-ink">Ý tưởng của bạn là gì?</h2>
        <p className="font-sans text-gray-600">Nhập chủ đề để bắt đầu tạo video viral phong cách người que.</p>
      </div>

      <div className="bg-white/50 backdrop-blur-sm p-8 rounded-xl border-2 border-ink/10 shadow-sm space-y-6">
        
        {/* Language Selector */}
        <div className="space-y-2">
            <label className="font-hand text-2xl text-ink block">Ngôn ngữ (Language)</label>
            <div className="flex gap-4">
                {languages.map((lang) => (
                    <button
                        key={lang.id}
                        onClick={() => setConfig({ ...config, language: lang.id })}
                        className={`
                            flex-1 p-3 rounded-lg border-2 font-sans font-bold transition-all flex items-center justify-center gap-2
                            ${config.language === lang.id 
                                ? 'bg-ink text-paper border-ink shadow-md' 
                                : 'bg-white border-gray-200 text-gray-500 hover:border-gray-400'}
                        `}
                    >
                        <span className="text-xl">{lang.flag}</span>
                        {lang.label}
                    </button>
                ))}
            </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="font-hand text-2xl text-ink block">Chủ đề (Topic)</label>
            <button
              type="button"
              onClick={() => setSuggestOpen(true)}
              className="font-hand text-base px-3 py-1 rounded-full border-2 border-ink/40 text-ink bg-white/70 hover:bg-white hover:border-ink transition-colors flex items-center gap-1.5 shadow-sm"
              title={
                config.language === 'English' ? 'Open topic suggestions' :
                config.language === 'Japanese' ? 'トピック候補を開く' :
                'Mở gợi ý chủ đề'
              }
            >
              <span>✨</span>
              <span>
                {config.language === 'English' ? 'TOPIC IDEAS' :
                 config.language === 'Japanese' ? 'トピック候補' :
                 'GỢI Ý CHỦ ĐỀ'}
              </span>
            </button>
          </div>
          <input
            type="text"
            value={config.topic}
            onChange={(e) => setConfig({ ...config, topic: e.target.value })}
            placeholder={
                config.language === 'English' ? "Ex: The psychology of laziness..." :
                config.language === 'Japanese' ? "例: 怠惰の心理学..." :
                "VD: Tâm lý lười biếng..."
            }
            className="w-full bg-paper border-2 border-gray-300 focus:border-ink rounded-lg p-4 font-sans text-lg outline-none transition-colors"
            onKeyDown={(e) => e.key === 'Enter' && config.topic && onNext()}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
                <label className="font-hand text-2xl text-ink block">Giọng văn (Tone)</label>
                <div className="grid grid-cols-2 gap-2">
                    {tones.map((t) => (
                    <button
                        key={t}
                        onClick={() => setConfig({ ...config, tone: t })}
                        className={`
                        p-2 rounded-lg border-2 font-hand text-base transition-all
                        ${config.tone === t 
                            ? 'bg-ink text-paper border-ink shadow-md' 
                            : 'bg-white border-gray-200 text-gray-500 hover:border-gray-400'}
                        `}
                    >
                        {t}
                    </button>
                    ))}
                </div>
            </div>

            <div className="space-y-4">
                 <div className="space-y-2">
                    <label className="font-hand text-2xl text-ink block">Khung hình</label>
                    <div className="grid grid-cols-2 gap-2">
                        <button
                            onClick={() => setConfig({ ...config, aspectRatio: '16:9' })}
                            className={`
                            p-2 rounded-lg border-2 font-hand text-base transition-all
                            ${config.aspectRatio === '16:9' 
                                ? 'bg-ink text-paper border-ink shadow-md' 
                                : 'bg-white border-gray-200 text-gray-500 hover:border-gray-400'}
                            `}
                        >
                            Ngang (16:9)
                        </button>
                        <button
                            onClick={() => setConfig({ ...config, aspectRatio: '9:16' })}
                            className={`
                            p-2 rounded-lg border-2 font-hand text-base transition-all
                            ${config.aspectRatio === '9:16' 
                                ? 'bg-ink text-paper border-ink shadow-md' 
                                : 'bg-white border-gray-200 text-gray-500 hover:border-gray-400'}
                            `}
                        >
                            Dọc (9:16)
                        </button>
                    </div>
                </div>

                <div className="space-y-2">
                    <label className="font-hand text-2xl text-ink block">Thời lượng</label>
                    <div className="flex flex-col gap-2">
                        {durations.map((d) => (
                        <button
                            key={d}
                            onClick={() => setConfig({ ...config, duration: d })}
                            className={`
                            p-2 rounded-lg border-2 font-hand text-base transition-all text-left px-4
                            ${config.duration === d 
                                ? 'bg-ink text-paper border-ink shadow-md' 
                                : 'bg-white border-gray-200 text-gray-500 hover:border-gray-400'}
                            `}
                        >
                            {d}
                        </button>
                        ))}
                    </div>
                </div>
            </div>
        </div>

        {/* Characters (1-3) */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="font-hand text-2xl text-ink block">
              {config.language === 'English' ? `Characters (${characterIds.length})` :
               config.language === 'Japanese' ? `キャラクター (${characterIds.length})` :
               `Nhân vật (${characterIds.length})`}
            </label>
            <span className="font-sans text-xs text-gray-500">
              {config.language === 'English' ? 'Up to 3' :
               config.language === 'Japanese' ? '最大3人' :
               'Tối đa 3'}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setCharacterOpen(true)}
            className="w-full flex items-center gap-3 p-3 rounded-lg border-2 border-gray-300 hover:border-ink bg-white/70 hover:bg-white transition-colors text-left group"
          >
            <div className="flex items-center gap-2 shrink-0">
              {pickedCharacters.map((c, i) => (
                <div key={i} className="relative w-16 h-16 rounded-lg bg-paper border-2 border-ink/10 flex items-center justify-center overflow-hidden">
                  {c.thumbUrl ? (
                    <img src={c.thumbUrl} alt={c.labels[config.language]} className="w-full h-full object-contain" />
                  ) : (
                    <span className="font-hand text-xs text-gray-400">—</span>
                  )}
                  <span className="absolute top-0 left-0 bg-ink text-paper text-[9px] font-hand px-1 rounded-br">{i + 1}</span>
                </div>
              ))}
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-hand text-base text-ink leading-tight line-clamp-1">
                {pickedCharacters.map((c, i) =>
                  c.index === 0 ? `★ ${c.labels[config.language]}` : `${c.index}. ${c.labels[config.language]}`
                ).join(' · ')}
              </div>
              <div className="font-sans text-xs text-gray-500 mt-0.5 line-clamp-1">
                {config.language === 'English' ? 'Click to manage cast — pick 1, 2 or 3 characters' :
                 config.language === 'Japanese' ? 'クリックで編成 — 1〜3人選べます' :
                 'Click để chỉnh — chọn 1, 2 hoặc 3 nhân vật'}
              </div>
            </div>
            <span className="font-hand text-base px-3 py-1 rounded-full border-2 border-ink/40 text-ink bg-white shadow-sm group-hover:border-ink shrink-0">
              {config.language === 'English' ? 'EDIT' :
               config.language === 'Japanese' ? '編集' :
               'CHỈNH'}
            </span>
          </button>
        </div>

        <Button
          onClick={onNext}
          disabled={!config.topic}
          isLoading={isLoading}
          className="w-full mt-4"
        >
          {config.language === 'English' ? 'Generate Ideas' :
           config.language === 'Japanese' ? 'アイデアを生成' :
           'Tạo Ý Tưởng'}
        </Button>
      </div>

      <TopicSuggestionsModal
        open={suggestOpen}
        language={config.language}
        onClose={() => setSuggestOpen(false)}
        onPick={(t) => setConfig({ ...config, topic: t })}
      />

      <CharacterPickerModal
        open={characterOpen}
        language={config.language}
        characters={characterIds}
        onClose={() => setCharacterOpen(false)}
        onChange={(next) => setConfig({ ...config, characters: next })}
      />
    </div>
  );
};