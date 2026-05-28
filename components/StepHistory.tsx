import React from 'react';
import { Button } from './Button';
import { HistoryEntry } from '../types';

interface StepHistoryProps {
  entries: HistoryEntry[];
  /** ID of the project currently generating in the background, if any. */
  runningId?: string | null;
  onLoad: (id: string) => void;
  onDelete: (id: string) => void;
  onClearAll: () => void;
  onCreateNew: () => void;
}

const formatDate = (iso: string) => {
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch {
    return iso;
  }
};

export const StepHistory: React.FC<StepHistoryProps> = ({ entries, runningId, onLoad, onDelete, onClearAll, onCreateNew }) => {
  return (
    <div className="flex flex-col gap-6 max-w-5xl mx-auto w-full animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <h2 className="font-hand text-4xl font-bold text-ink">Lịch sử dự án</h2>
          <p className="font-sans text-gray-600">Tự động lưu trên trình duyệt (localStorage). Mở lại bất cứ khi nào.</p>
        </div>
        <div className="flex gap-2">
          {entries.length > 0 && (
            <Button variant="secondary" onClick={onClearAll} className="text-sm px-4 py-1">
              Xoá tất cả
            </Button>
          )}
          <Button onClick={onCreateNew} className="text-sm px-4 py-1">
            + Tạo mới
          </Button>
        </div>
      </div>

      {entries.length === 0 ? (
        <div className="bg-white/50 backdrop-blur-sm p-10 rounded-xl border-2 border-dashed border-ink/20 text-center">
          <p className="font-hand text-2xl text-ink">Chưa có dự án nào.</p>
          <p className="font-sans text-gray-500 mt-1">Bấm "Tạo mới" để bắt đầu.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {entries.map(entry => {
            const isRunning = runningId === entry.id;
            return (
            <div
              key={entry.id}
              className={`bg-white/70 backdrop-blur-sm p-4 rounded-xl border-2 shadow-sm flex flex-col gap-3 ${
                isRunning ? 'border-accent ring-2 ring-accent/20' : 'border-ink/10'
              }`}
            >
              <div className="aspect-video bg-paper border border-ink/10 rounded-lg overflow-hidden flex items-center justify-center relative">
                {entry.thumbnailUrl ? (
                  <img src={entry.thumbnailUrl} alt={entry.topic} className="w-full h-full object-cover" />
                ) : (
                  <span className="font-hand text-gray-400 text-lg">không có thumbnail</span>
                )}
                {isRunning && (
                  <span className="absolute top-2 left-2 bg-accent text-paper text-[11px] font-hand px-2 py-0.5 rounded-full flex items-center gap-1 shadow-sm">
                    <span className="w-1.5 h-1.5 rounded-full bg-paper animate-pulse"></span>
                    Đang chạy
                  </span>
                )}
              </div>
              <div className="flex-1">
                <h3 className="font-hand text-xl text-ink line-clamp-2">{entry.selectedTitle || entry.topic || 'Dự án'}</h3>
                <p className="font-sans text-xs text-gray-500 mt-1">{formatDate(entry.timestamp)}</p>
                <div className="flex flex-wrap gap-1 mt-2">
                  <span className="text-xs bg-ink/5 px-2 py-0.5 rounded-full font-sans">{entry.config.language}</span>
                  <span className="text-xs bg-ink/5 px-2 py-0.5 rounded-full font-sans">{entry.config.aspectRatio}</span>
                  <span className="text-xs bg-ink/5 px-2 py-0.5 rounded-full font-sans">{entry.config.duration}</span>
                </div>
              </div>
              <div className="flex gap-2">
                <Button onClick={() => onLoad(entry.id)} className="flex-1 text-sm py-1">
                  {isRunning ? 'Mở (đang chạy)' : 'Mở'}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => onDelete(entry.id)}
                  className="text-sm py-1 px-3"
                  disabled={isRunning}
                >
                  Xoá
                </Button>
              </div>
            </div>
          )})}
        </div>
      )}
    </div>
  );
};
