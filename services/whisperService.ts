import { WhisperWord } from "./captionService";

/**
 * Plug-point for word-level Whisper transcription.
 *
 * No provider is wired yet — calling transcribeWithTimestamps() always throws
 * with a clear "select a Whisper provider" message. When the user picks one
 * (Coachio / Groq / whisper.cpp WASM), drop the implementation into
 * createWhisperProvider() below and the rest of the app keeps working.
 */

export interface WhisperProvider {
  /** Provider id for telemetry / settings persistence. */
  id: string;
  /** Human-readable label for UI. */
  label: string;
  /** Transcribe an audio Blob and return per-word timings. */
  transcribeWithTimestamps(audio: Blob, language?: string): Promise<WhisperWord[]>;
}

/**
 * Factory that returns the active Whisper provider, or null when none is
 * configured yet. The UI uses the null case to disable the "Khớp với Whisper"
 * button and show a tooltip pointing to Settings.
 *
 * TODO(whisper): wire one or more of —
 *   - Coachio Whisper (if their /task/submit supports task_type=transcription)
 *   - Groq Whisper (POST https://api.groq.com/openai/v1/audio/transcriptions)
 *   - whisper.cpp via WebAssembly (in-browser, no API key)
 */
export const createWhisperProvider = (_opts: {
  coachioApiKey?: string;
  geminiApiKey?: string;
}): WhisperProvider | null => {
  // No provider plugged in yet — caption alignment falls back to the
  // word-count estimator in captionService.estimateSceneTimings.
  return null;
};

/** Convenience boolean for UI gating. */
export const hasWhisperProvider = (opts: {
  coachioApiKey?: string;
  geminiApiKey?: string;
}): boolean => createWhisperProvider(opts) !== null;
