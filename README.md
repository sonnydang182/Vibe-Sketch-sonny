<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# VibeSketch AI

Tạo nhanh video kể chuyện kiểu **người que / doodle** (như Better Than Yesterday, Tri Thức Vui Vẻ) chỉ từ một chủ đề. Ứng dụng tự sinh tiêu đề viral, kịch bản, ảnh từng cảnh, thumbnail và voiceover — xuất ra một file ZIP để dựng video.

### Tính năng

- **Dashboard 3 tab**: *Tạo mới* (wizard 6 bước), *Lịch sử* (auto-save trên localStorage), *Cấu hình* (API key, model tạo ảnh).
- **Đa ngôn ngữ**: Việt / English / 日本語 — toàn bộ tiêu đề, kịch bản, voiceover, gợi ý chủ đề và text trên ảnh đều bám đúng ngôn ngữ đã chọn.
- **Gợi ý chủ đề**: 15 danh mục × 10 topic, dịch sẵn theo ngôn ngữ — phù hợp video kể chuyện / diễn giải kiểu người que.
- **Nhiều provider tạo ảnh**: Gemini 3 Pro Image (mặc định) hoặc Coachio · GPT Image 2.
- **Thumbnail viral**: prompt phong cách doodle Việt — chữ tay đậm, power-words highlight đỏ/vàng, người que biểu cảm cực mạnh, bám đúng tỷ lệ 9:16 / 16:9.
- **Xuất ZIP**: kịch bản (txt) + ảnh từng cảnh (png) + thumbnail + voiceover (wav).

### Chạy local

**Yêu cầu:** Node.js

```bash
npm install
npm run dev
```

App mở ở `http://localhost:5173/`. Vào tab **Cấu hình** và dán **Gemini API Key** (lấy ở [aistudio.google.com](https://aistudio.google.com)). Nếu muốn dùng Coachio cho phần tạo ảnh, dán thêm **Coachio API Key**.

> Có thể đặt sẵn `GEMINI_API_KEY` trong `.env.local` để bỏ qua bước nhập trong UI.

### Stack

React 19 · TypeScript · Vite · Tailwind (CDN) · `@google/genai` · Coachio API · JSZip · localStorage.
