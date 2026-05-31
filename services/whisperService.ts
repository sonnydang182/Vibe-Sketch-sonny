import { WhisperWord } from "./captionService";
import { Language } from "../types";

/**
 * Plug-point for word-level Whisper transcription.
 *
 * Active provider: Groq (whisper-large-v3-turbo). Other providers
 * (Coachio if/when they add transcription, whisper.cpp via WASM, etc.)
 * can be slotted into createWhisperProvider() without touching callers.
 */

export interface WhisperProvider {
  /** Provider id for telemetry / settings persistence. */
  id: string;
  /** Human-readable label for UI. */
  label: string;
  /** Transcribe an audio Blob and return per-word timings. */
  transcribeWithTimestamps(audio: Blob, language?: Language): Promise<WhisperWord[]>;
}

// ---------------------------------------------------------------------------
// Groq (whisper-large-v3-turbo, OpenAI-compatible /audio/transcriptions)
// ---------------------------------------------------------------------------

const GROQ_BASE = "https://api.groq.com/openai/v1";

/** Map our app's Language to the ISO-639-1 code Whisper expects. */
const toWhisperLang = (lang?: Language): string | undefined => {
  if (!lang) return undefined;
  if (lang === 'Vietnamese') return 'vi';
  if (lang === 'English') return 'en';
  if (lang === 'Japanese') return 'ja';
  return undefined;
};

interface GroqWordOut { word: string; start: number; end: number }
interface GroqSegmentOut {
  start: number;
  end: number;
  text: string;
  words?: GroqWordOut[];
}
interface GroqTranscriptionResponse {
  text?: string;
  language?: string;
  duration?: number;
  words?: GroqWordOut[];
  segments?: GroqSegmentOut[];
}

const createGroqProvider = (apiKey: string): WhisperProvider => ({
  id: 'groq',
  label: 'Groq · whisper-large-v3-turbo',
  async transcribeWithTimestamps(audio: Blob, language?: Language): Promise<WhisperWord[]> {
    if (!apiKey) throw new Error("Groq API key is missing");

    const form = new FormData();
    // Naming the file ".mp3" is a hint — Groq sniffs the actual codec.
    form.append('file', audio, 'voiceover.mp3');
    form.append('model', 'whisper-large-v3-turbo');
    form.append('response_format', 'verbose_json');
    // Word-level timestamps — required for caption sync.
    form.append('timestamp_granularities[]', 'word');
    form.append('timestamp_granularities[]', 'segment');
    form.append('temperature', '0');
    const iso = toWhisperLang(language);
    if (iso) form.append('language', iso);

    const res = await fetch(`${GROQ_BASE}/audio/transcriptions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Groq Whisper failed (${res.status}): ${text}`);
    }

    const data = await res.json() as GroqTranscriptionResponse;
    // Prefer the top-level word list; fall back to flattening segment.words.
    const flat: GroqWordOut[] =
      data.words ?? data.segments?.flatMap(s => s.words ?? []) ?? [];

    if (!flat.length) {
      throw new Error("Groq Whisper returned no word-level timestamps. Check that the audio has speech.");
    }

    return flat.map(w => ({ text: w.word, start: w.start, end: w.end }));
  },
});

/**
 * Factory that returns the active Whisper provider, or null when none is
 * configured. The UI uses the null case to disable the alignment button and
 * point users to Settings.
 */
export const createWhisperProvider = (opts: {
  coachioApiKey?: string;
  geminiApiKey?: string;
  groqApiKey?: string;
}): WhisperProvider | null => {
  if (opts.groqApiKey?.trim()) return createGroqProvider(opts.groqApiKey.trim());
  // Future: Coachio / whisper.cpp WASM go here.
  return null;
};

/** Convenience boolean for UI gating. */
export const hasWhisperProvider = (opts: {
  coachioApiKey?: string;
  geminiApiKey?: string;
  groqApiKey?: string;
}): boolean => createWhisperProvider(opts) !== null;
