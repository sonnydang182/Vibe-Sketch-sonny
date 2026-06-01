import React, { useState } from 'react';
import { Button } from './Button';
import { GenerationConfig, Language, CharacterId } from '../types';
import { TopicSuggestionsModal } from './TopicSuggestionsModal';
import { CharacterPickerModal } from './CharacterPickerModal';
import { getCharacter, CharacterDef } from '../data/characters';
import { suggestContextOutline } from '../services/geminiService';

interface StepInputProps {
  config: GenerationConfig;
  setConfig: React.Dispatch<React.SetStateAction<GenerationConfig>>;
  onNext: () => void;
  isLoading: boolean;
}

type ToneId = GenerationConfig['tone'];

const TONE_LABELS: Record<ToneId, Record<Language, string>> = {
  'Stoic':            { Vietnamese: 'Khắc kỷ',        English: 'Stoic',            Japanese: '禁欲的' },
  'Motivational':     { Vietnamese: 'Truyền cảm hứng', English: 'Motivational',     Japanese: '励まし' },
  'Dark Philosophy':  { Vietnamese: 'Triết lý sâu',    English: 'Dark Philosophy',  Japanese: '深い哲学' },
  'Humorous':         { Vietnamese: 'Hài hước',       English: 'Humorous',         Japanese: 'ユーモラス' },
};

const DURATION_LABELS: Record<GenerationConfig['duration'], Record<Language, string>> = {
  'Short (60s)':       { Vietnamese: 'Ngắn (60s)',      English: 'Short (60s)',       Japanese: '短め (60秒)' },
  'Medium (3 mins)':   { Vietnamese: 'Vừa (3 phút)',    English: 'Medium (3 mins)',   Japanese: '中 (3分)' },
  'Long (5-10 mins)':  { Vietnamese: 'Dài (5-10 phút)', English: 'Long (5-10 mins)',  Japanese: '長め (5-10分)' },
};

const STRINGS = {
  heading:        { Vietnamese: 'Ý tưởng của bạn là gì?',                          English: 'What is your idea?',                                       Japanese: 'あなたのアイデアは？' },
  subheading:    { Vietnamese: 'Nhập chủ đề để bắt đầu tạo video viral phong cách người que.', English: 'Enter a topic to start creating a viral stickman-style video.', Japanese: 'トピックを入力して、棒人間風のバイラル動画を作りましょう。' },
  languageLabel: { Vietnamese: 'Ngôn ngữ (Language)',                              English: 'Language',                                                 Japanese: '言語' },
  topicLabel:    { Vietnamese: 'Chủ đề (Topic)',                                    English: 'Topic',                                                    Japanese: 'トピック' },
  topicIdeas:    { Vietnamese: 'GỢI Ý CHỦ ĐỀ',                                      English: 'TOPIC IDEAS',                                              Japanese: 'トピック候補' },
  contextBtn:    { Vietnamese: 'NGỮ CẢNH',                                          English: 'CONTEXT',                                                  Japanese: 'コンテキスト' },
  contextLabel:  { Vietnamese: 'Ngữ cảnh / Nội dung đầu vào',                       English: 'Context / Input notes',                                    Japanese: 'コンテキスト / 入力メモ' },
  contextHint:   { Vietnamese: 'Dán nguồn, góc nhìn hoặc trải nghiệm cá nhân của bạn — AI sẽ dùng để định hướng tiêu đề và kịch bản.',
                   English:    'Paste sources, the angle you want, or a personal anecdote — AI will use it to steer the titles and script.',
                   Japanese:   '参考資料、視点、または個人的なエピソードを貼り付けてください。AIがタイトルと台本に反映します。' },
  contextPlaceholder: { Vietnamese: 'VD: Tôi muốn nói về việc bỏ điện thoại 7 ngày, dựa trên trải nghiệm cá nhân và một bài nghiên cứu...',
                        English:    'Ex: I want to talk about quitting my phone for 7 days, based on my own experience and a study I read...',
                        Japanese:   '例：自分の体験と読んだ論文に基づいて、スマホ断ち7日間について話したい...' },
  suggestCtxBtn:       { Vietnamese: 'AI GỢI Ý DÀN Ý',           English: 'AI SUGGEST OUTLINE',         Japanese: 'AIアウトライン提案' },
  suggestCtxLoading:   { Vietnamese: 'Đang nghĩ…',                English: 'Thinking…',                  Japanese: '考え中…' },
  suggestCtxNeedTopic: { Vietnamese: 'Nhập chủ đề trước khi nhờ AI gợi ý.',
                         English:    'Enter a topic before asking the AI to suggest an outline.',
                         Japanese:   'AIにアウトラインを依頼する前にトピックを入力してください。' },
  suggestCtxOverwrite: { Vietnamese: 'Ghi đè ngữ cảnh hiện tại bằng gợi ý mới?',
                         English:    'Overwrite the current context with a new suggestion?',
                         Japanese:   '現在のコンテキストを新しい提案で上書きしますか？' },
  suggestCtxNeutral:   { Vietnamese: 'AI sẽ viết dàn ý trung lập — không bịa số liệu, đánh dấu chỗ cần kiểm chứng.',
                         English:    'AI writes a neutral outline — no fabricated stats, marks points to verify.',
                         Japanese:   'AIが中立的なアウトラインを作成します — 数値を捏造せず、要確認箇所を明記します。' },
  suggestCtxFail:      { Vietnamese: 'Không tạo được dàn ý. Kiểm tra kết nối / API key.',
                         English:    'Could not generate an outline. Check connectivity / API key.',
                         Japanese:   'アウトラインを生成できません。接続またはAPIキーを確認してください。' },
  toneLabel:     { Vietnamese: 'Giọng văn (Tone)',                                  English: 'Tone',                                                     Japanese: 'トーン' },
  aspectLabel:   { Vietnamese: 'Khung hình',                                        English: 'Aspect ratio',                                             Japanese: 'アスペクト比' },
  aspect169:     { Vietnamese: 'Ngang (16:9)',                                      English: 'Landscape (16:9)',                                         Japanese: '横 (16:9)' },
  aspect916:     { Vietnamese: 'Dọc (9:16)',                                        English: 'Portrait (9:16)',                                          Japanese: '縦 (9:16)' },
  durationLabel: { Vietnamese: 'Thời lượng',                                        English: 'Duration',                                                 Japanese: '長さ' },
  generate:      { Vietnamese: 'Tạo Ý Tưởng',                                       English: 'Generate Ideas',                                           Japanese: 'アイデアを生成' },
};

export const StepInput: React.FC<StepInputProps> = ({ config, setConfig, onNext, isLoading }) => {
  const [suggestOpen, setSuggestOpen] = useState(false);
  const [characterOpen, setCharacterOpen] = useState(false);
  // Context block is hidden by default so the form stays compact. Auto-open
  // it when there's existing content (returning user, resumed project).
  const [contextOpen, setContextOpen] = useState<boolean>(() => Boolean(config.context?.trim()));
  const [isSuggestingContext, setIsSuggestingContext] = useState(false);

  const handleSuggestContext = async () => {
    if (!config.topic.trim()) {
      alert(STRINGS.suggestCtxNeedTopic[lang]);
      return;
    }
    // Only ask before overwriting non-trivial existing content (>= 20 chars).
    // Below that, the textarea is essentially empty — overwrite silently.
    const existing = (config.context || '').trim();
    if (existing.length >= 20 && !confirm(STRINGS.suggestCtxOverwrite[lang])) return;

    setIsSuggestingContext(true);
    setContextOpen(true);
    try {
      const outline = await suggestContextOutline(config.topic.trim(), config.tone, config.language);
      const trimmed = (outline || '').trim();
      if (!trimmed) throw new Error('empty');
      setConfig({ ...config, context: trimmed });
    } catch (err) {
      console.error(err);
      alert(STRINGS.suggestCtxFail[lang]);
    } finally {
      setIsSuggestingContext(false);
    }
  };
  const durationOrder: GenerationConfig['duration'][] = ['Short (60s)', 'Medium (3 mins)', 'Long (5-10 mins)'];
  const toneOrder: ToneId[] = ['Stoic', 'Motivational', 'Dark Philosophy', 'Humorous'];
  const lang = config.language;
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
        <h2 className="font-hand text-4xl font-bold text-ink">{STRINGS.heading[lang]}</h2>
        <p className="font-sans text-gray-600">{STRINGS.subheading[lang]}</p>
      </div>

      <div className="bg-white/50 backdrop-blur-sm p-8 rounded-xl border-2 border-ink/10 shadow-sm space-y-6">

        {/* Language Selector */}
        <div className="space-y-2">
            <label className="font-hand text-2xl text-ink block">{STRINGS.languageLabel[lang]}</label>
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
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <label className="font-hand text-2xl text-ink block">{STRINGS.topicLabel[lang]}</label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSuggestOpen(true)}
                className="font-hand text-base px-3 py-1 rounded-full border-2 border-ink/40 text-ink bg-white/70 hover:bg-white hover:border-ink transition-colors flex items-center gap-1.5 shadow-sm"
              >
                <span>✨</span>
                <span>{STRINGS.topicIdeas[lang]}</span>
              </button>
              <button
                type="button"
                onClick={() => setContextOpen(o => !o)}
                aria-expanded={contextOpen}
                className={`font-hand text-base px-3 py-1 rounded-full border-2 transition-colors flex items-center gap-1.5 shadow-sm ${
                  contextOpen || config.context?.trim()
                    ? 'bg-ink text-paper border-ink'
                    : 'bg-white/70 hover:bg-white text-ink border-ink/40 hover:border-ink'
                }`}
              >
                <span>📝</span>
                <span>{STRINGS.contextBtn[lang]}</span>
                {config.context?.trim() && !contextOpen && (
                  <span className="ml-1 inline-block w-2 h-2 rounded-full bg-amber-400" />
                )}
              </button>
            </div>
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
            onKeyDown={(e) => e.key === 'Enter' && config.topic && !contextOpen && onNext()}
          />

          {contextOpen && (
            <div className="space-y-2 pt-2 animate-fade-in">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="min-w-0">
                  <label className="font-hand text-lg text-ink block">{STRINGS.contextLabel[lang]}</label>
                  <p className="font-sans text-xs text-gray-500">{STRINGS.contextHint[lang]}</p>
                </div>
                <button
                  type="button"
                  onClick={handleSuggestContext}
                  disabled={isSuggestingContext || !config.topic.trim()}
                  title={STRINGS.suggestCtxNeutral[lang]}
                  className={`shrink-0 font-hand text-sm px-3 py-1.5 rounded-full border-2 transition-colors flex items-center gap-1.5 shadow-sm ${
                    isSuggestingContext
                      ? 'bg-gray-100 border-gray-300 text-gray-500 cursor-wait'
                      : !config.topic.trim()
                        ? 'bg-gray-50 border-gray-200 text-gray-400 cursor-not-allowed'
                        : 'bg-amber-50 border-amber-400 text-amber-900 hover:bg-amber-100 hover:border-amber-500'
                  }`}
                >
                  {isSuggestingContext ? (
                    <>
                      <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      <span>{STRINGS.suggestCtxLoading[lang]}</span>
                    </>
                  ) : (
                    <>
                      <span>✨</span>
                      <span>{STRINGS.suggestCtxBtn[lang]}</span>
                    </>
                  )}
                </button>
              </div>
              <textarea
                value={config.context}
                onChange={(e) => setConfig({ ...config, context: e.target.value })}
                placeholder={STRINGS.contextPlaceholder[lang]}
                rows={5}
                disabled={isSuggestingContext}
                className="w-full bg-paper border-2 border-gray-300 focus:border-ink rounded-lg p-3 font-sans text-base outline-none transition-colors resize-y min-h-[120px] disabled:opacity-60"
              />
              <div className="flex items-center justify-between text-xs">
                <p className="font-sans text-amber-700/80 italic">{STRINGS.suggestCtxNeutral[lang]}</p>
                <span className="font-sans text-gray-400">
                  {(config.context || '').trim().length} chars
                </span>
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
                <label className="font-hand text-2xl text-ink block">{STRINGS.toneLabel[lang]}</label>
                <div className="grid grid-cols-2 gap-2">
                    {toneOrder.map((t) => (
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
                        {TONE_LABELS[t][lang]}
                    </button>
                    ))}
                </div>
            </div>

            <div className="space-y-4">
                 <div className="space-y-2">
                    <label className="font-hand text-2xl text-ink block">{STRINGS.aspectLabel[lang]}</label>
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
                            {STRINGS.aspect169[lang]}
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
                            {STRINGS.aspect916[lang]}
                        </button>
                    </div>
                </div>

                <div className="space-y-2">
                    <label className="font-hand text-2xl text-ink block">{STRINGS.durationLabel[lang]}</label>
                    <div className="flex flex-col gap-2">
                        {durationOrder.map((d) => (
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
                            {DURATION_LABELS[d][lang]}
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
          {STRINGS.generate[lang]}
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