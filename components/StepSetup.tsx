import React from 'react';

/**
 * Placeholder tab for upcoming batch automation features.
 *
 * Planned (not yet wired up):
 *  - Topic queue: paste a list of topics → app processes them sequentially.
 *  - Title list: pre-supply your own titles to skip AI title generation.
 *  - Per-batch defaults: language, tone, duration, characters, voice.
 *  - Schedule + auto-export: drop finished ZIPs into a folder of your choice.
 */
export const StepSetup: React.FC = () => {
  return (
    <div className="flex flex-col gap-6 max-w-2xl mx-auto w-full animate-fade-in">
      <div>
        <h2 className="font-hand text-4xl font-bold text-ink">Setup chạy tự động</h2>
        <p className="font-sans text-gray-600">
          Khu vực cấu hình cho luồng sản xuất hàng loạt: danh sách chủ đề / tiêu đề có sẵn, voice mặc định, lịch chạy.
        </p>
      </div>

      <div className="bg-white/50 backdrop-blur-sm p-8 rounded-xl border-2 border-dashed border-ink/20 shadow-sm space-y-4">
        <div className="flex items-center gap-2">
          <span className="font-hand text-xs uppercase tracking-wider text-amber-700 bg-amber-100 px-2 py-0.5 rounded">
            Sắp ra mắt
          </span>
          <span className="font-sans text-sm text-gray-500">Đang phát triển</span>
        </div>

        <ul className="space-y-3 font-sans text-sm text-gray-700">
          <li className="flex gap-3">
            <span className="font-hand text-ink shrink-0">①</span>
            <div>
              <div className="font-bold text-ink">Hàng đợi chủ đề</div>
              <div className="text-gray-500">
                Dán danh sách chủ đề (1 dòng / chủ đề) — app chạy lần lượt và lưu mỗi project vào Lịch sử.
              </div>
            </div>
          </li>
          <li className="flex gap-3">
            <span className="font-hand text-ink shrink-0">②</span>
            <div>
              <div className="font-bold text-ink">Tiêu đề có sẵn</div>
              <div className="text-gray-500">
                Nếu đã có sẵn tiêu đề, bỏ qua bước AI gợi ý. (Hiện tại: trong wizard, ô "Tự nhập tiêu đề" cho phép override.)
              </div>
            </div>
          </li>
          <li className="flex gap-3">
            <span className="font-hand text-ink shrink-0">③</span>
            <div>
              <div className="font-bold text-ink">Mặc định cho batch</div>
              <div className="text-gray-500">
                Ngôn ngữ, tone, thời lượng, nhân vật, giọng đọc — dùng cho cả lô.
              </div>
            </div>
          </li>
          <li className="flex gap-3">
            <span className="font-hand text-ink shrink-0">④</span>
            <div>
              <div className="font-bold text-ink">Tạo video hoàn chỉnh</div>
              <div className="text-gray-500">
                Ghép ảnh từng cảnh + audio từng cảnh (Coachio TTS) + caption khớp thời gian → file mp4.
              </div>
            </div>
          </li>
        </ul>
      </div>
    </div>
  );
};
