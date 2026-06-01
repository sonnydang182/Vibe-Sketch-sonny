# Changelog

Format follows [Keep a Changelog](https://keepachangelog.com/). Dates are YYYY-MM-DD.

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
