import React, { useState } from 'react';
import { Button } from './Button';
import { Language } from '../types';
import { CustomPromptModal } from './CustomPromptModal';

interface StepThumbnailProps {
  thumbnailUrl?: string;
  isGenerating: boolean;
  /** Error message from last failed attempt — shown if no thumbnail yet. */
  error?: string;
  onRegenerate: (customPrompt?: string) => void;
  onStop: () => void;
  onExportZip: () => void;
  onBack: () => void;
  aspectRatio: '16:9' | '9:16';
  language: Language;
  /** Default prompt shown in the custom modal — usually the title or visual metaphor. */
  defaultCustomPrompt?: string;
}

export const StepThumbnail: React.FC<StepThumbnailProps> = ({
  thumbnailUrl,
  isGenerating,
  error,
  onRegenerate,
  onStop,
  onExportZip,
  onBack,
  aspectRatio,
  language,
  defaultCustomPrompt = '',
}) => {
  const [customOpen, setCustomOpen] = useState(false);

  const downloadImage = (dataUrl: string, filename: string) => {
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const aspectClass = aspectRatio === '16:9' ? "max-w-3xl aspect-video" : "max-w-sm aspect-[9/16]";
  const isError = !isGenerating && !thumbnailUrl && !!error;

  return (
    <div className="flex flex-col gap-6 w-full max-w-4xl mx-auto h-full">
      <div className="flex flex-col md:flex-row justify-between items-center gap-4">
        <div>
            <h2 className="font-hand text-3xl font-bold text-ink">Ảnh Bìa (Thumbnail)</h2>
            <p className="font-sans text-gray-600 text-sm">Tạo ấn tượng đầu tiên mạnh mẽ.</p>
        </div>
        <div className="flex gap-2 flex-wrap justify-end">
             {isGenerating && (
               <Button
                 variant="secondary"
                 onClick={onStop}
                 className="!text-accent !border-accent hover:!bg-red-50"
               >
                 ■ Dừng
               </Button>
             )}
             <Button variant="secondary" onClick={onBack} disabled={isGenerating}>Quay lại</Button>
            <Button onClick={onExportZip} disabled={!thumbnailUrl || isGenerating}>
                Tiếp: Tạo Audio & Tải về
            </Button>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-6 bg-white/50 border-2 border-ink/10 rounded-xl">
        <div className={`w-full ${aspectClass} bg-paper paper-texture relative rounded-lg overflow-hidden border-4 border-ink shadow-2xl group`}>
             {isGenerating ? (
                 <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-ink/50">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-ink"></div>
                    <span className="font-hand text-xl">Đang thiết kế...</span>
                 </div>
              ) : thumbnailUrl ? (
                <>
                  <img
                    src={thumbnailUrl}
                    alt="Thumbnail"
                    className="w-full h-full object-cover"
                  />
                  {/* Hover: download only — regen/edit moved below */}
                  <div className="absolute inset-0 bg-paper/80 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center z-10">
                    <button
                        onClick={() => downloadImage(thumbnailUrl, 'thumbnail.png')}
                        className="bg-ink text-paper px-6 py-2 rounded-lg font-hand text-lg hover:bg-black transition-colors flex items-center gap-2 shadow-lg"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"></path></svg>
                        Tải Ảnh Này
                    </button>
                  </div>
                </>
              ) : isError ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-center bg-red-50/40">
                   <span className="text-3xl">⚠️</span>
                   <div className="font-hand text-2xl text-accent">Lỗi tạo thumbnail</div>
                   <div className="font-sans text-sm text-gray-500 line-clamp-3">{error}</div>
                </div>
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-ink/30 font-hand text-2xl">
                   [ Chưa có Thumbnail ]
                </div>
              )}
        </div>

        {/* Compact action strip — ALWAYS visible (works for success, error, and empty states) */}
        <div className="flex items-center gap-2 mt-4">
          <button
            onClick={() => onRegenerate()}
            disabled={isGenerating}
            className="font-hand text-base px-4 py-1.5 rounded-lg border-2 border-ink/30 hover:border-ink hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
            title={thumbnailUrl ? 'Tạo lại với prompt cũ' : 'Tạo thumbnail'}
          >
            <span>↻</span>
            <span>{thumbnailUrl ? 'Tạo Lại' : 'Tạo Ngay'}</span>
          </button>
          <button
            onClick={() => setCustomOpen(true)}
            disabled={isGenerating}
            className="font-hand text-base px-4 py-1.5 rounded-lg border-2 border-ink/30 hover:border-ink hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
            title="Sửa prompt rồi tạo lại"
          >
            <span>✏️</span>
            <span>Sửa Prompt</span>
          </button>
        </div>
      </div>

      <CustomPromptModal
        open={customOpen}
        language={language}
        defaultPrompt={defaultCustomPrompt}
        contextLabel="Thumbnail"
        onClose={() => setCustomOpen(false)}
        onSubmit={(prompt) => onRegenerate(prompt)}
      />
    </div>
  );
};
