# VibeSketch AI

Tạo nhanh video kể chuyện kiểu **người que / doodle** chỉ từ một chủ đề. Ứng dụng tự sinh tiêu đề viral, kịch bản, ảnh từng cảnh, thumbnail, voiceover — rồi **render thành file mp4 sẵn upload** ngay trong trình duyệt.

## Tính năng chính

- **Wizard 7 bước**: chủ đề → tiêu đề → kịch bản → ảnh cảnh → thumbnail → voiceover → render mp4.
- **Đa ngôn ngữ**: Việt / English / 日本語 — UI, tiêu đề, kịch bản, voiceover đều tự đổi theo ngôn ngữ chọn.
- **AI gợi ý ngữ cảnh**: nhập sườn nội dung; AI viết dàn ý trung lập, đánh dấu chỗ cần kiểm chứng (`[cần nguồn]`). Tiêu đề + kịch bản bám theo dàn ý này thay vì viết generic.
- **Voiceover thông minh theo ngôn ngữ**:
  - 🇺🇸 English → Coachio · ElevenLabs (Mark / Brittney).
  - 🇻🇳 / 🇯🇵 / khác → Gemini TTS với picker giọng nam / nữ + 4 preset phong cách.
- **Whisper alignment** (Groq `whisper-large-v3-turbo`): khớp caption từng từ với audio, hỗ trợ karaoke style.
- **Caption editor**: 4 mode (cụm từ / một từ / karaoke / cả câu), font size slider, position, highlight, sửa tay caption khi Whisper nhầm chữ.
- **Scene transitions**: cut / fade / Ken Burns. Render mp4 đúng style đã chọn trong preview.
- **Render mp4 trong browser**: ffmpeg.wasm self-hosted, COOP/COEP headers, font Inter Bold cho caption sắc nét, multi-pass encode để mọi scene + transition đều render đúng.
- **Persistence chống mất việc**: scenes / thumbnail / audio / Whisper alignment đều lưu IndexedDB, auto-restore khi reload trang.

## Provider hỗ trợ

| Function | Provider | Note |
|---|---|---|
| Tạo Text (title, script, outline) | Coachio (`gemini-3.1-pro` cho script, `flash-lite` cho title/outline) — fallback Gemini | Auto-cascade nếu Coachio thiếu model |
| Tạo Ảnh (scene + thumbnail) | Coachio **GPT Image 2**, Coachio **Nano Banana 2**, Gemini **3 Pro Image** | Chọn model trong Cấu hình → tab 🎨 |
| Tạo Audio (TTS) | English: Coachio · ElevenLabs · VN/JA/khác: Gemini TTS | Tự động theo ngôn ngữ |
| Whisper alignment | Groq `whisper-large-v3-turbo` | Optional — không có vẫn render được, caption chia ước tính theo số từ |

## Chạy local

Yêu cầu Node.js 20+.

```bash
npm install   # postinstall sẽ copy ffmpeg.wasm core + worker vào public/
npm run dev
```

App chạy tại `http://localhost:5173/`. Vào tab **Cấu hình** — UI chia 4 tab theo chức năng:

- ✍️ **Tạo Text**: Coachio API key (chính) + Gemini key (fallback).
- 🎨 **Tạo Ảnh**: chọn model image + key tương ứng.
- 🎙 **Tạo Audio**: Coachio key (TTS tiếng Anh) + Gemini key (TTS tiếng Việt / Nhật).
- 🔉 **Whisper**: Groq key (optional, cho caption sync).

Dán đủ **Coachio API Key** là chạy được toàn bộ wizard tiếng Anh (text + ảnh + voiceover + render). Nếu làm video tiếng Việt / Nhật thì cần thêm **Gemini API Key** cho phần TTS.

## Stack

- **UI**: React 19 · TypeScript 5.8 · Vite 6 · Tailwind (CDN) · JSZip.
- **Render**: `@ffmpeg/ffmpeg` 0.12 + `@ffmpeg/core` 0.12 (ESM dist, self-hosted).
- **Storage**: localStorage (metadata) + IndexedDB (assets — scene images, thumbnail, audio Blob, Whisper data).
- **Caption render**: libass via ffmpeg `subtitles=` filter, Inter Bold bundled trong `public/fonts/`.

## Roadmap rút gọn

- Tăng tốc render: thử `@ffmpeg/core-mt` (multi-thread WASM) hoặc WebCodecs API cho hardware H.264 encode.
- Quality preset (Draft 480p/15fps vs HD 1080p/30fps) cho lần xuất cuối.
- Background job queue khi tạo ảnh nhiều scene.

Chi tiết thay đổi từng version: xem [CHANGELOG.md](CHANGELOG.md).
