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
  GENERATE_AUDIO = 5
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
  /** Coachio TTS voice id (e.g. Mark / Brittney). Empty = default Mark. */
  coachioTtsVoice: string;
  /**
   * Free-text style instruction prepended to the Gemini TTS prompt
   * (e.g. "Read in a professional news-anchor tone"). Empty = no instruction.
   * Set via preset buttons or typed directly.
   */
  geminiTtsStyle: string;
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
