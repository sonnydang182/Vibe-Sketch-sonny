# VibeSketch AI

Tạo nhanh video kể chuyện kiểu **người que / doodle** chỉ từ một chủ đề. Ứng dụng tự sinh tiêu đề viral, kịch bản, ảnh từng cảnh, thumbnail và voiceover — xuất ra một file ZIP để dựng video.

## Tính năng

- **Wizard 6 bước**: nhập chủ đề → tiêu đề → kịch bản → ảnh cảnh → thumbnail → voiceover.
- **Đa ngôn ngữ**: Việt / English / 日本語.
- **Gợi ý chủ đề**: 15 danh mục × 10 topic, dịch sẵn theo ngôn ngữ.
- **Lịch sử & Auto-save** trên localStorage.
- **Xuất ZIP**: kịch bản (txt) + ảnh cảnh (png) + thumbnail + voiceover (wav).

## Chạy local

Yêu cầu Node.js.

```bash
npm install
npm run dev
```

App chạy tại `http://localhost:5173/`. Vào tab **Cấu hình** và dán **Coachio API Key** — như vậy là đủ để chạy toàn bộ wizard tới bước thumbnail. Gemini API key chỉ cần thêm nếu muốn dùng phần voiceover (TTS); nếu không bạn vẫn có thể xuất ZIP (không kèm audio) và tự ghi voiceover sau.

## Stack

React 19 · TypeScript · Vite · Tailwind · JSZip · localStorage.
