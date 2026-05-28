import React, { useEffect, useState } from 'react';
import { Button } from './Button';
import { Scene, Language, GenerationConfig } from '../types';
import { CustomPromptModal } from './CustomPromptModal';

interface StepVisualsProps {
  scenes: Scene[];
  regenerateImage: (id: string, prompt: string, keywords: string) => void;
  regenerateAllFailures: () => void;
  onNext: () => void;
  onBack: () => void;
  aspectRatio: '16:9' | '9:16';
  language: Language;
  isGeneratingBatch: boolean;
  onStop: () => void;
  // Voiceover
  onRewriteVoiceover: (id: string, mode: 'longer' | 'shorter') => void;
  onRewriteAllVoiceovers: (mode: 'longer' | 'shorter') => void;
  onEditVoiceover: (id: string, text: string) => void;
  onRevertVoiceover: (id: string, variantIdx: number) => void;
  isRewriting: boolean;
  perSceneBudget: { minWords: number; maxWords: number; perSceneSeconds: number; targetScenes: number };
  // Duration is now editable inline; rewriting voiceover uses the live value.
  duration: GenerationConfig['duration'];
  onChangeDuration: (d: GenerationConfig['duration']) => void;
}

const DURATIONS: GenerationConfig['duration'][] = ['Short (60s)', 'Medium (3 mins)', 'Long (5-10 mins)'];

export const StepVisuals: React.FC<StepVisualsProps> = ({
  scenes, regenerateImage, regenerateAllFailures, onNext, onBack, aspectRatio, language,
  isGeneratingBatch, onStop,
  onRewriteVoiceover, onRewriteAllVoiceovers, onEditVoiceover, onRevertVoiceover, isRewriting, perSceneBudget,
  duration, onChangeDuration,
}) => {
  const failedCount = scenes.filter(s => !s.imageUrl).length;

  const [playingIndex, setPlayingIndex] = useState<number | null>(null);
  const [customForScene, setCustomForScene] = useState<Scene | null>(null);
  const [editingVoiceoverId, setEditingVoiceoverId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [showVariantsFor, setShowVariantsFor] = useState<string | null>(null);

  useEffect(() => {
    if (playingIndex !== null) {
      if (playingIndex >= scenes.length) {
        setPlayingIndex(null);
        return;
      }
      const timer = setTimeout(() => {
        setPlayingIndex(prev => (prev !== null ? prev + 1 : null));
      }, 3500);
      return () => clearTimeout(timer);
    }
  }, [playingIndex, scenes.length]);

  const downloadImage = (dataUrl: string, filename: string) => {
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const startEditingVoiceover = (scene: Scene) => {
    setEditingVoiceoverId(scene.id);
    setEditingText(scene.voiceover);
    setShowVariantsFor(null);
  };

  const commitEditingVoiceover = () => {
    if (editingVoiceoverId) onEditVoiceover(editingVoiceoverId, editingText.trim());
    setEditingVoiceoverId(null);
  };

  const gridClass = aspectRatio === '16:9'
    ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
    : "grid-cols-2 md:grid-cols-3 lg:grid-cols-4";
  const aspectClass = aspectRatio === '16:9' ? "aspect-video" : "aspect-[9/16]";

  return (
    <div className="flex flex-col gap-6 w-full max-w-7xl mx-auto h-full">
      <div className="flex flex-col md:flex-row justify-between items-start gap-4">
        <div>
            <h2 className="font-hand text-3xl font-bold text-ink">Xưởng Hình Ảnh ({aspectRatio})</h2>
            <p className="font-sans text-gray-600 text-sm">Ảnh + lời dẫn — audio sẽ tạo ở bước sau.</p>
            <p className="font-sans text-[11px] text-gray-500 mt-0.5">
              Mục tiêu: <strong>~{perSceneBudget.targetScenes} cảnh</strong>
              <span className="mx-1.5">·</span>
              <strong>~{perSceneBudget.perSceneSeconds.toFixed(1)}s / cảnh</strong>
              <span className="mx-1.5">·</span>
              <strong>{perSceneBudget.minWords}–{perSceneBudget.maxWords} từ</strong> lời dẫn / cảnh
              {scenes.length > 0 && scenes.length !== perSceneBudget.targetScenes && (
                <span className="ml-2 text-accent">
                  (hiện tại: {scenes.length} cảnh)
                </span>
              )}
            </p>
        </div>
        <div className="flex gap-2 flex-wrap justify-end items-center">
            {/* Duration switcher — recomputes budget instantly */}
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
            {isGeneratingBatch && (
              <Button
                variant="secondary"
                onClick={onStop}
                className="!text-accent !border-accent hover:!bg-red-50"
              >
                ■ Dừng
              </Button>
            )}
            {failedCount > 0 && !isGeneratingBatch && (
              <Button
                variant="secondary"
                onClick={regenerateAllFailures}
                className="!text-accent !border-accent hover:!bg-red-50"
                title={`Vẽ lại ${failedCount} cảnh còn thiếu / bị lỗi`}
              >
                ↻ Vẽ Lại {failedCount} Cảnh
              </Button>
            )}
            <Button variant="secondary" onClick={() => setPlayingIndex(0)} disabled={playingIndex !== null || isGeneratingBatch || failedCount > 0}>
                {playingIndex !== null ? 'Đang chiếu...' : '▶ Xem Thử'}
            </Button>
            <Button onClick={onNext} disabled={isGeneratingBatch}>Tiếp: Tạo Thumbnail</Button>
        </div>
      </div>

      {/* Bulk voiceover actions */}
      <div className="flex flex-wrap items-center gap-2 -mt-2 px-1">
        <span className="font-sans text-xs text-gray-500">Sửa tất cả voiceover:</span>
        <button
          onClick={() => onRewriteAllVoiceovers('longer')}
          disabled={isRewriting || scenes.length === 0}
          className="font-hand text-sm px-3 py-1 rounded-lg border-2 border-ink/20 hover:border-ink hover:bg-white disabled:opacity-40 transition-colors flex items-center gap-1"
          title="Viết lại toàn bộ voiceover dài hơn (trong ngân sách thời lượng đã chọn)"
        >
          📝 Dài Tất Cả
        </button>
        <button
          onClick={() => onRewriteAllVoiceovers('shorter')}
          disabled={isRewriting || scenes.length === 0}
          className="font-hand text-sm px-3 py-1 rounded-lg border-2 border-ink/20 hover:border-ink hover:bg-white disabled:opacity-40 transition-colors flex items-center gap-1"
          title="Viết lại toàn bộ voiceover ngắn hơn"
        >
          ✂️ Ngắn Tất Cả
        </button>
        {isRewriting && (
          <span className="font-sans text-xs text-gray-500 flex items-center gap-1.5">
            <span className="inline-block w-3 h-3 border-2 border-ink/30 border-t-ink rounded-full animate-spin"></span>
            Đang viết lại...
          </span>
        )}
      </div>

      <div className={`flex-1 grid ${gridClass} gap-6 overflow-y-auto pb-10 px-4`} style={{ maxHeight: 'calc(100vh - 200px)' }}>
        {scenes.map((scene, index) => {
          const isError = !scene.isGeneratingImage && !scene.imageUrl && !!scene.error;
          const isEditing = editingVoiceoverId === scene.id;
          const showVariants = showVariantsFor === scene.id && (scene.voiceoverVariants?.length || 0) > 0;
          return (
          <div
            key={scene.id}
            className={`
                relative rounded-sm overflow-hidden border-4 transition-all duration-300 bg-paper paper-texture flex flex-col
                ${playingIndex === index ? 'border-accent shadow-2xl scale-105 z-20' : 'border-ink/10 hover:border-ink/30 shadow-md'}
            `}
          >
            {/* IMAGE AREA */}
            <div className={`${aspectClass} w-full relative group bg-transparent overflow-hidden`}>
              {scene.isGeneratingImage ? (
                 <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-ink/50">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-ink"></div>
                    <span className="font-hand">Đang vẽ...</span>
                 </div>
              ) : scene.imageUrl ? (
                <>
                  <img src={scene.imageUrl} alt="Doodle" className="w-full h-full object-cover" />
                  <div className="absolute inset-0 bg-paper/70 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center z-10 p-2">
                    <button
                        onClick={() => downloadImage(scene.imageUrl!, `scene-${index+1}.png`)}
                        className="bg-ink text-paper px-4 py-2 rounded-lg font-hand hover:bg-black transition-colors flex items-center gap-2 shadow-lg"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                        Tải Ảnh
                    </button>
                  </div>
                </>
              ) : isError ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center bg-red-50/40">
                   <span className="text-2xl">⚠️</span>
                   <div className="font-hand text-base text-accent">Lỗi tạo ảnh</div>
                   <div className="font-sans text-[11px] text-gray-500 line-clamp-3">{scene.error}</div>
                </div>
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-ink/30 font-hand text-xl">
                   [ Chờ vẽ... ]
                </div>
              )}
            </div>

            {/* IMAGE ACTION STRIP */}
            <div className="flex items-center gap-1 px-2 py-1.5 bg-white/60 border-t border-ink/5">
              <button
                onClick={() => regenerateImage(scene.id, scene.visualPrompt, scene.keywords)}
                disabled={scene.isGeneratingImage}
                className="flex-1 font-hand text-sm px-2 py-1 rounded-md border border-ink/20 hover:border-ink hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-1"
              >
                <span>↻</span><span>Vẽ Lại</span>
              </button>
              <button
                onClick={() => setCustomForScene(scene)}
                disabled={scene.isGeneratingImage}
                className="flex-1 font-hand text-sm px-2 py-1 rounded-md border border-ink/20 hover:border-ink hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-1"
              >
                <span>✏️</span><span>Sửa Prompt</span>
              </button>
            </div>

            {/* VOICEOVER PANEL */}
            <div className="p-3 border-t-2 border-ink/5 bg-white/40 backdrop-blur-sm flex-1 flex flex-col gap-2">
                <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[10px] font-bold text-ink/50 uppercase tracking-widest">CẢNH {index + 1}</span>
                    <span className="text-[10px] text-gray-500 font-sans">
                      <span className="font-bold text-accent">Text:</span> {scene.keywords}
                    </span>
                </div>

                {isEditing ? (
                  <div className="space-y-2">
                    <textarea
                      value={editingText}
                      onChange={e => setEditingText(e.target.value)}
                      autoFocus
                      rows={4}
                      className="w-full bg-paper border-2 border-ink/30 focus:border-ink rounded-lg p-2 font-sans text-sm outline-none resize-vertical"
                    />
                    <div className="flex gap-2">
                      <Button onClick={commitEditingVoiceover} className="text-xs px-2 py-0.5">Lưu</Button>
                      <Button variant="secondary" onClick={() => setEditingVoiceoverId(null)} className="text-xs px-2 py-0.5">Huỷ</Button>
                    </div>
                  </div>
                ) : (
                  <p className="font-sans text-sm font-medium text-ink leading-relaxed">
                    {scene.voiceover || <span className="italic text-gray-400">[trống]</span>}
                  </p>
                )}

                {!isEditing && (
                  <div className="flex items-center gap-1 flex-wrap pt-1">
                    <button
                      onClick={() => onRewriteVoiceover(scene.id, 'longer')}
                      disabled={isRewriting}
                      className="font-hand text-xs px-2 py-0.5 rounded border border-ink/20 hover:border-ink hover:bg-white disabled:opacity-40 transition-colors flex items-center gap-1"
                    >
                      📝 Dài
                    </button>
                    <button
                      onClick={() => onRewriteVoiceover(scene.id, 'shorter')}
                      disabled={isRewriting}
                      className="font-hand text-xs px-2 py-0.5 rounded border border-ink/20 hover:border-ink hover:bg-white disabled:opacity-40 transition-colors flex items-center gap-1"
                    >
                      ✂️ Ngắn
                    </button>
                    <button
                      onClick={() => startEditingVoiceover(scene)}
                      className="font-hand text-xs px-2 py-0.5 rounded border border-ink/20 hover:border-ink hover:bg-white transition-colors flex items-center gap-1"
                    >
                      ✏️ Sửa
                    </button>
                    {(scene.voiceoverVariants?.length || 0) > 0 && (
                      <button
                        onClick={() => setShowVariantsFor(showVariants ? null : scene.id)}
                        className="font-hand text-xs px-2 py-0.5 rounded border border-ink/20 hover:border-ink hover:bg-white transition-colors flex items-center gap-1"
                      >
                        📜 {scene.voiceoverVariants!.length}
                      </button>
                    )}
                  </div>
                )}

                {showVariants && (
                  <div className="border border-ink/10 rounded-lg p-2 bg-white/60 space-y-1">
                    <div className="text-[10px] font-bold text-ink/50 uppercase tracking-wider">Bản nháp cũ (mới → cũ)</div>
                    {scene.voiceoverVariants!.map((v, vi) => (
                      <button
                        key={vi}
                        onClick={() => { onRevertVoiceover(scene.id, vi); setShowVariantsFor(null); }}
                        className="w-full text-left text-xs font-sans p-1.5 rounded hover:bg-ink/5 transition-colors line-clamp-2"
                      >
                        {v}
                      </button>
                    ))}
                  </div>
                )}
            </div>
          </div>
        )})}
      </div>

      <CustomPromptModal
        open={!!customForScene}
        language={language}
        defaultPrompt={customForScene?.visualPrompt || ''}
        contextLabel={customForScene ? `Cảnh ${scenes.findIndex(s => s.id === customForScene.id) + 1}` : undefined}
        onClose={() => setCustomForScene(null)}
        onSubmit={(prompt) => {
          if (!customForScene) return;
          regenerateImage(customForScene.id, prompt, customForScene.keywords);
        }}
      />
    </div>
  );
};
