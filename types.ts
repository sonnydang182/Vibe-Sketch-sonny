export interface Scene {
  id: string;
  voiceover: string;
  visualPrompt: string;
  keywords: string; // New field for text on image
  imageUrl?: string;
  isGeneratingImage?: boolean;
  /** Last image generation error message, cleared on retry. */
  error?: string;
  /** Older voiceover versions kept for revert (newest first, max ~3). */
  voiceoverVariants?: string[];
  /** Per-scene TTS audio (data: URL so it survives JSON serialization to history). */
  audioUrl?: string;
  isGeneratingAudio?: boolean;
  audioError?: string;
  /** Tag identifying which voiceover string produced audioUrl; lets UI know
   *  audio is stale when the user edits voiceover. */
  audioForText?: string;
}

export interface Script {
  title: string;
  scenes: Scene[];
}

export interface GeneratedTitle {
  id: string;
  text: string;
  selected: boolean;
}

export enum AppStep {
  INPUT_TOPIC = 0,
  SELECT_TITLE = 1,
  REVIEW_SCRIPT = 2,
  GENERATE_VISUALS = 3,
  GENERATE_THUMBNAIL = 4,
  GENERATE_AUDIO = 5,
  GENERATE_VIDEO = 6,
}

/** Per-scene timing inside the combined voiceover audio. */
export interface SceneTiming {
  sceneId: string;
  /** Start time in seconds. */
  start: number;
  /** End time in seconds. */
  end: number;
  /** How the timing was derived — useful for the UI to flag accuracy. */
  source: 'estimated' | 'whisper';
}

/** Position of caption on the video frame. */
export type CaptionPosition = 'bottom' | 'middle' | 'top';

/** Caption highlight (used for the karaoke per-word color when wired). */
export type CaptionHighlight = 'yellow' | 'red' | 'cyan' | 'green';

/** Caption text size preset. Maps to ASS font sizes per render resolution. */
export type CaptionSize = 'small' | 'medium' | 'large';

/**
 * How the caption text flows over time inside one scene.
 *
 *  - full_scene: show the entire scene voiceover for the whole scene window.
 *  - word_chunks: show ~chunkWords words at a time, advancing within the
 *    scene window (good default — keeps the frame uncluttered).
 *  - single_word: pop one word at a time, TikTok-style.
 *  - karaoke: per-word highlight using Whisper word-level timestamps; falls
 *    back to word_chunks when no Whisper alignment has been run.
 */
export type CaptionMode = 'full_scene' | 'word_chunks' | 'single_word' | 'karaoke';

export interface CaptionStyle {
  mode: CaptionMode;
  /** Number of words per chunk when mode === 'word_chunks'. Range 2–8. */
  chunkWords: number;
  position: CaptionPosition;
  size: CaptionSize;
  /** Primary text colour — white is the safest CTR pick. */
  textColor: 'white' | 'yellow';
  /** Word / phrase highlight colour. Used by karaoke when word timestamps land. */
  highlight: CaptionHighlight;
  /** Black box behind the line — helpful on busy backgrounds. */
  background: boolean;
}

/** Progress event from videoService.assembleVideo. */
export interface VideoRenderProgress {
  phase: 'load_ffmpeg' | 'write_assets' | 'encode' | 'finalize';
  /** 0..1 — overall completion. */
  ratio: number;
  /** Free-form short note ("Đang tải ffmpeg core...", etc.). */
  message?: string;
}

export type Language = 'Vietnamese' | 'English' | 'Japanese';

export type ImageProvider = 'gemini' | 'coachio_gpt_image_2';
export type AudioProvider = 'gemini' | 'coachio_elevenlabs';

export type CharacterId =
  | 'stickman'
  | '01-curious' | '02-hyperactive' | '03-sleepy' | '04-confident'
  | '05-anxious' | '06-mischievous' | '07-introvert' | '08-inventor'
  | '09-athlete' | '10-dreamer' | '11-strict-teacher' | '12-gamer'
  | '13-cheerful' | '14-overthinker' | '15-detective' | '16-artist'
  | '17-leader' | '18-bookworm' | '19-dramatic' | '20-gentle';

export interface GenerationConfig {
  topic: string;
  tone: 'Stoic' | 'Motivational' | 'Dark Philosophy' | 'Humorous';
  duration: 'Short (60s)' | 'Medium (3 mins)' | 'Long (5-10 mins)';
  aspectRatio: '16:9' | '9:16';
  language: Language;
  /** 1-3 characters. Index 0 = primary, others are supporting cast.
   *  Slots that should "default to stickman" simply hold 'stickman'. */
  characters: CharacterId[];
  /**
   * @deprecated kept for backward compat with v1 saves; migrated to `characters` on load.
   */
  character?: CharacterId;
}

export interface AppSettings {
  imageProvider: ImageProvider;
  audioProvider: AudioProvider;
  coachioApiKey: string;
  geminiApiKey: string;
  /** Groq API key — used for Whisper word-level alignment (step 7). */
  groqApiKey: string;
  /** Coachio TTS voice id (e.g. Mark / Brittney). Empty = default Mark. */
  coachioTtsVoice: string;
  /**
   * Free-text style instruction prepended to the Gemini TTS prompt
   * (e.g. "Read in a professional news-anchor tone"). Empty = no instruction.
   * Set via preset buttons or typed directly.
   */
  geminiTtsStyle: string;
  /** Caption render style — persisted so the picker remembers the last choice. */
  captionStyle: CaptionStyle;
}

export interface HistoryEntry {
  id: string;
  timestamp: string;
  topic: string;
  selectedTitle: string;
  thumbnailUrl?: string;
  config: GenerationConfig;
  titles: GeneratedTitle[];
  scenes: Scene[];
  fullScript: string;
  step: AppStep;
  lastGeneratedTopic: string;
  lastGeneratedTitleId: string;
}

export type DashboardView = 'create' | 'history' | 'settings' | 'setup';
