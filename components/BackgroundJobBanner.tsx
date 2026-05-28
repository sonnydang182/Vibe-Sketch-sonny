import React from 'react';

interface Props {
  visible: boolean;
  /** e.g., "Đang vẽ 3/8 cảnh..." */
  message: string;
  /** Number 0..1 for progress bar; null hides it (used for indeterminate jobs). */
  progress?: number | null;
  onStop: () => void;
  onGoToBatch?: () => void;
}

/**
 * Floating, sticky status banner — visible in every view (Create / History /
 * Settings) while an image-generation job is running in the background.
 */
export const BackgroundJobBanner: React.FC<Props> = ({
  visible, message, progress, onStop, onGoToBatch,
}) => {
  if (!visible) return null;
  const pct = typeof progress === 'number' ? Math.max(0, Math.min(1, progress)) : null;

  return (
    <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[90] w-[min(92vw,520px)] bg-ink text-paper rounded-xl border-2 border-ink shadow-2xl overflow-hidden animate-fade-in">
      <div className="flex items-center gap-3 p-3">
        <div className="relative w-8 h-8 shrink-0">
          <div className="absolute inset-0 rounded-full border-2 border-paper/20"></div>
          <div className="absolute inset-0 rounded-full border-2 border-paper border-t-transparent animate-spin"></div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-hand text-base leading-tight truncate">{message}</div>
          <div className="font-sans text-[11px] text-paper/60">Tiếp tục chạy nền dù bạn chuyển tab</div>
        </div>
        <div className="flex gap-1 shrink-0">
          {onGoToBatch && (
            <button
              onClick={onGoToBatch}
              className="font-hand text-sm px-3 py-1 rounded-lg bg-paper/10 hover:bg-paper/20 transition-colors"
              title="Mở luồng đang chạy"
            >
              Mở
            </button>
          )}
          <button
            onClick={onStop}
            className="font-hand text-sm px-3 py-1 rounded-lg bg-accent/90 hover:bg-accent text-paper transition-colors"
            title="Dừng tạo ảnh"
          >
            ■ Dừng
          </button>
        </div>
      </div>
      {pct !== null && (
        <div className="h-1 bg-paper/15">
          <div
            className="h-full bg-paper transition-all duration-300"
            style={{ width: `${pct * 100}%` }}
          />
        </div>
      )}
    </div>
  );
};
