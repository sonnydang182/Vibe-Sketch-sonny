# Changelog

Format follows [Keep a Changelog](https://keepachangelog.com/). Dates are YYYY-MM-DD.

## [0.4.0] — 2026-06-24

### Added
- **Local TTS (VieNeu Studio)** — self-hosted Vietnamese TTS via `http://127.0.0.1:8001`. No API key required. Toggle in Settings → 🎙 Audio. Endpoints wrapped: `GET /api/health`, `GET /api/voices`, `POST /api/tts`. Includes a "🔌 Test kết nối" button in Settings that pings `/api/health` + lists available voices.
- **Vite dev-server proxy** for Local TTS at `/local-tts/*` → `${VITE_LOCAL_TTS_TARGET || http://127.0.0.1:8001}/*`. Bypasses CORS entirely — browser sees same-origin. Auto-rewrites `http://127.0.0.1:*` / `http://localhost:*` URLs to the proxy path at fetch time so users don't have to touch the URL field.
- **Vietnamese TTS provider dropdown** in the Audio step — pick between ☁️ Gemini and 💻 Local (only appears when Local TTS is enabled). Persisted as `settings.vietnameseTtsPreference`.
- **Local voice grid** in the Audio step — fetches `/api/voices` on demand, shows a "🎲 Giọng mặc định" tile plus each available voice. Surfaces server errors inline.
- **Settings UI restructured** — 4 focused tabs (Text / Ảnh / Audio / Whisper), each showing only the keys + options relevant to that function. Removed the "Chọn provider audio" section (provider now auto-derived from language). Added a compact status bar at the bottom with pills for Coachio / Gemini / Groq / Local.

### Changed (breaking)
- **Text generation is Coachio-only** — Gemini fallback removed from `generateViralTitles`, `suggestContextOutline`, `generateScriptScenes`, and `rewriteScript`. Calls throw with "Cần Coachio API key" instead of silently rerouting.
- **Image generation is Coachio-only** — `ImageProvider` narrowed to `'coachio_gpt_image_2' | 'coachio_nano_banana_2'`. Gemini `gemini-3-pro-image-preview` path removed from both `generateDoodleImage` and `generateThumbnailImage`.
- **Error messages surface the missing setting** — e.g. "Cần Gemini API key cho TTS tiếng Việt / Nhật / khác (vào Cấu hình → Audio)" instead of a generic prompt.

## [0.3.0] — 2026-06-01

### Added
- **Nano Banana 2** image model on Coachio (`model_identifier: nano-banana-2`). Pickable in Settings → tab 🎨.
- **AI gợi ý ngữ cảnh**: button on step 0 that asks the LLM for a neutral outline (key points + things to verify) based on the topic. Prompt enforces no fabricated stats — unknown numbers / dates / studies get marked as `[cần nguồn]` / `[needs source]` / `[要出典]`.
- **Context field** (`config.context`) — free-form notes the user pastes in. Threaded into both title and script generation prompts so the output reflects the user's angle instead of generic takes.
- **Localised Tone / Duration labels** per language (VN / EN / JA) on the input step.
- **Male / female voice picker** for Gemini TTS (`config.geminiTtsGender`). Maps to prebuilt voices: VN/JA female = `Kore`, male = `Charon`; EN female = `Aoede`, male = `Puck`.
- **Settings UI redesign** — 4 tabs per function (`✍️ Tạo Text`, `🎨 Tạo Ảnh`, `🎙 Tạo Audio`, `🔉 Whisper`) with status pills showing which keys are populated.
- **Mount-time auto-restore** — reloading the page now reopens the active project from history automatically (config / titles / scenes / step), then hydrates heavy assets from IndexedDB.

### Changed
- **Audio provider is now language-driven** — `English` → Coachio · ElevenLabs; `Vietnamese / Japanese / other` → Gemini TTS. `settings.audioProvider` stays in sync with `config.language` via a side effect.
- **Coachio script model** upgraded to `google/gemini-3.1-pro` (was `flash-lite`) with an auto-fallback cascade to `flash` then `flash-lite`. Bumps `max_tokens` to 8192 so long scene arrays don't truncate.
- **Script errors surface real diagnostics** — JSON-parse failures now report whether the output was truncated mid-string vs returned as prose, plus the model identifier that ran.
- **Ken Burns motion smoothed** — preview removes the `transform 80ms linear` CSS transition that fought the RAF state updates; ffmpeg pre-scale bumped 2× → 8× with a `zoom+delta` accumulator and gentler `1.04` cap.
- **`saveProjectAssets` is now merge-based** — undefined fields preserve the previously-saved values (prevents autosave races from clobbering the thumbnail).

### Fixed
- **Render cut short** — `alignSceneTimingsToWhisper` now accepts an `audioDurationSec` so the last scene extends to the actual audio end. Combined with dropping `-shortest` from the final ffmpeg encode, the output mp4 no longer truncates the trailing silence (closing the "57s audio → 50s render" bug).
- **Thumbnail not persisting after reload** — caused by the wizard not auto-restoring the active project on mount. Now restored from in-memory history; heavy fields (thumbnail data URL, scene images, audio Blob, Whisper data) hydrate from IndexedDB in the same effect.

## [0.2.0] — 2026-05 (earlier prefix history, summarised)

- Initial video render pipeline via `@ffmpeg/ffmpeg` 0.12 + self-hosted `@ffmpeg/core` ESM, COOP/COEP credentialless, libass with Inter Bold for captions.
- Multi-pass encode: per-scene mp4 → concat demuxer (cut / ken_burns) or xfade chain (fade).
- Whisper alignment via Groq `whisper-large-v3-turbo`; karaoke caption mode using word-level timestamps.
- IndexedDB persistence for scene images, thumbnail, audio Blob, Whisper output.
- Coachio as default LLM (titles / script / outline) with Gemini fallback.
- Coachio ElevenLabs TTS (Mark / Brittney), Gemini TTS style presets.

## [0.1.0] — 2026-04

- Initial app structure: 6-step wizard, history, character picker, multilingual topic suggestions.
