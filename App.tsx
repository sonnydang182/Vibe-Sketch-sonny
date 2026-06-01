import React, { useState, useEffect, useRef } from 'react';
import JSZip from 'jszip';
import { Button } from './components/Button';
import {
  AppStep,
  GenerationConfig,
  GeneratedTitle,
  Scene,
  AppSettings,
  HistoryEntry,
  DashboardView,
  SceneTiming,
} from './types';
import {
  generateViralTitles,
  generateScriptScenes,
  generateDoodleImage,
  generateThumbnailImage,
  rewriteScript,
  generateSpeech,
  setGeminiApiKey,
  setCoachioApiKey,
  getActiveGeminiKey,
  buildDurationProfile,
} from './services/geminiService';
import {
  getCharacter,
  loadCharacterRefAsBase64,
  fetchCharacterRefBlob
} from './data/characters';
import {
  saveProjectAssets,
  loadProjectAssets,
  deleteProjectAssets,
  pruneOrphanAssets,
  ProjectAssets,
} from './data/assetStorage';
import {
  generateAudioWithCoachio,
  COACHIO_VOICES,
} from './services/coachioService';

import { StepInput } from './components/StepInput';
import { StepTitles } from './components/StepTitles';
import { StepScript } from './components/StepScript';
import { StepVisuals } from './components/StepVisuals';
import { StepThumbnail } from './components/StepThumbnail';
import { StepAudio } from './components/StepAudio';
import { StepVideo } from './components/StepVideo';
import { StepHistory } from './components/StepHistory';
import { StepSettings } from './components/StepSettings';
import { StepSetup } from './components/StepSetup';
import { BackgroundJobBanner } from './components/BackgroundJobBanner';
import { hasWhisperProvider, createWhisperProvider } from './services/whisperService';
import {
  alignSceneTimingsToWhisper,
  WhisperWord,
} from './services/captionService';
import {
  assembleVideo,
  isVideoRenderSupported,
} from './services/videoService';
import { CaptionStyle, VideoRenderProgress } from './types';

const SETTINGS_KEY = 'vibesketch.settings.v1';
const HISTORY_KEY = 'vibesketch.history.v1';
const ACTIVE_PROJECT_KEY = 'vibesketch.activeProjectId.v1';

const DEFAULT_CAPTION_STYLE: CaptionStyle = {
  mode: 'word_chunks',
  chunkWords: 4,
  position: 'bottom',
  sizePx: 36,
  textColor: 'white',
  highlight: 'yellow',
  background: false,
};

/**
 * Migrate legacy caption style (`size: small|medium|large`) into the new
 * sizePx field. Settings persisted before this commit will have the enum.
 */
const migrateCaptionStyle = (raw: unknown): CaptionStyle => {
  const incoming = (raw && typeof raw === 'object' ? raw : {}) as Partial<CaptionStyle> & { size?: string };
  let sizePx = incoming.sizePx;
  if (!sizePx && typeof incoming.size === 'string') {
    sizePx = incoming.size === 'small' ? 24 : incoming.size === 'large' ? 52 : 36;
  }
  return {
    ...DEFAULT_CAPTION_STYLE,
    ...incoming,
    sizePx: sizePx ?? DEFAULT_CAPTION_STYLE.sizePx,
  };
};

const DEFAULT_SETTINGS: AppSettings = {
  imageProvider: 'coachio_gpt_image_2',
  audioProvider: 'coachio_elevenlabs',
  coachioApiKey: '',
  geminiApiKey: '',
  groqApiKey: '',
  coachioTtsVoice: COACHIO_VOICES[0].id,
  geminiTtsStyle: '',
  captionStyle: DEFAULT_CAPTION_STYLE,
  // 'fade' is the default — black-frame gap between scenes basically
  // disappears once a 200-300ms crossfade is on. User can flip to 'cut'
  // for the previous instant-swap behaviour or 'ken_burns' for cinematic.
  transition: 'fade',
  transitionDuration: 0.25,
};

const DEFAULT_CONFIG: GenerationConfig = {
  topic: '',
  tone: 'Stoic',
  duration: 'Short (60s)',
  aspectRatio: '9:16',
  language: 'Vietnamese',
  characters: ['stickman'],
};

/**
 * Migrate older configs (which only stored a single `character` field) into
 * the new `characters` array. No-op if `characters` is already present.
 */
const migrateConfig = (cfg: Partial<GenerationConfig> | undefined): GenerationConfig => {
  const base = { ...DEFAULT_CONFIG, ...(cfg || {}) };
  if (!base.characters || base.characters.length === 0) {
    const single = (cfg as any)?.character as GenerationConfig['characters'][number] | undefined;
    base.characters = single ? [single] : ['stickman'];
  }
  // Strip the deprecated single-character field so it stops re-appearing on save.
  delete (base as any).character;
  return base;
};

const loadSettings = (): AppSettings => {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      captionStyle: migrateCaptionStyle((parsed as any)?.captionStyle),
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
};

const loadHistory = (): HistoryEntry[] => {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

/**
 * Strip large binary fields from a HistoryEntry before persisting to
 * localStorage. Scene images + thumbnail live in IndexedDB instead.
 */
const toLiteEntry = (e: HistoryEntry): HistoryEntry => ({
  ...e,
  thumbnailUrl: undefined,
  scenes: e.scenes.map(s => ({ ...s, imageUrl: undefined })),
});

/**
 * Persist history metadata to localStorage. Assets (images, thumbnails)
 * are kept separately in IndexedDB so we never hit the quota.
 */
const saveHistory = (entries: HistoryEntry[]) => {
  const lite = entries.map(toLiteEntry);
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(lite));
  } catch (e) {
    // Should be rare now that assets are out, but if titles/scripts somehow
    // exceed quota, drop oldest until it fits.
    console.warn('Lite history exceeded quota (unexpected); trimming.', e);
    let trimmed = lite;
    while (trimmed.length > 0) {
      trimmed = trimmed.slice(0, -1);
      try {
        localStorage.setItem(HISTORY_KEY, JSON.stringify(trimmed));
        return;
      } catch { /* keep trimming */ }
    }
  }
};

const App: React.FC = () => {
  // Dashboard view
  const [view, setView] = useState<DashboardView>('create');

  // Wizard step
  const [step, setStep] = useState<AppStep>(AppStep.INPUT_TOPIC);
  const [isLoading, setIsLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Image generation lifecycle
  const [isGeneratingBatch, setIsGeneratingBatch] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Combined-audio single Blob, used by the StepAudio TTS + ZIP export.
  // Per-scene TTS was removed because chunked TTS produces uneven tone/pacing.
  /** Interruptible sleep — resolves either after `ms` or when signal aborts. */
  const sleep = (ms: number, signal: AbortSignal) =>
    new Promise<void>(resolve => {
      const t = setTimeout(resolve, ms);
      const onAbort = () => { clearTimeout(t); resolve(); };
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
    });

  /**
   * Silently retry an image-generation call up to `attempts` times.
   * Treats both thrown errors and undefined responses as failures.
   * Returns the first successful result, or throws the last error if all fail.
   * Honours the abort signal between attempts.
   */
  const generateWithRetry = async <T,>(
    fn: () => Promise<T | undefined>,
    signal: AbortSignal,
    attempts = 3,
  ): Promise<T> => {
    let lastError: unknown = null;
    for (let i = 1; i <= attempts; i++) {
      if (signal.aborted) throw new Error('aborted');
      try {
        const result = await fn();
        if (result !== undefined && result !== null) return result;
        lastError = new Error('AI không trả về ảnh');
      } catch (e) {
        lastError = e;
        console.warn(`Generation attempt ${i}/${attempts} failed:`, e);
      }
      if (i < attempts && !signal.aborted) {
        // Short backoff: 1.2s, 2.4s
        await sleep(1200 * i, signal);
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  };

  // Settings (persisted)
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());

  // History (persisted)
  const [history, setHistory] = useState<HistoryEntry[]>(() => loadHistory());
  const [activeProjectId, setActiveProjectId] = useState<string | null>(() => {
    try { return localStorage.getItem(ACTIVE_PROJECT_KEY); } catch { return null; }
  });

  // Project data
  const [config, setConfig] = useState<GenerationConfig>(DEFAULT_CONFIG);
  const [titles, setTitles] = useState<GeneratedTitle[]>([]);
  const [scenes, setScenes] = useState<Scene[]>([]);

  // Audio & full script
  const [fullScript, setFullScript] = useState<string>('');
  const [audioUrl, setAudioUrl] = useState<string | undefined>(undefined);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [isRewriting, setIsRewriting] = useState(false);

  // Cache
  const [lastGeneratedTopic, setLastGeneratedTopic] = useState<string>('');
  const [lastGeneratedTitleId, setLastGeneratedTitleId] = useState<string>('');

  // Thumbnail
  const [thumbnailUrl, setThumbnailUrl] = useState<string | undefined>(undefined);
  const [isGeneratingThumbnail, setIsGeneratingThumbnail] = useState(false);
  const [thumbnailError, setThumbnailError] = useState<string | undefined>(undefined);

  // Whisper alignment (step 7)
  const [whisperTimings, setWhisperTimings] = useState<SceneTiming[] | null>(null);
  /** Raw word-level Whisper output — needed for karaoke caption mode. */
  const [whisperWords, setWhisperWords] = useState<WhisperWord[] | undefined>(undefined);
  const [isAligningWhisper, setIsAligningWhisper] = useState(false);
  const [whisperError, setWhisperError] = useState<string | undefined>(undefined);

  // Video render (step 7 — final mp4)
  const [videoUrl, setVideoUrl] = useState<string | undefined>(undefined);
  const [isRendering, setIsRendering] = useState(false);
  const [renderProgress, setRenderProgress] = useState<VideoRenderProgress | undefined>(undefined);
  const [renderError, setRenderError] = useState<string | undefined>(undefined);
  const renderAbortRef = useRef<AbortController | null>(null);

  // Push API keys into the service module whenever settings change.
  useEffect(() => {
    setGeminiApiKey(settings.geminiApiKey || null);
  }, [settings.geminiApiKey]);
  useEffect(() => {
    setCoachioApiKey(settings.coachioApiKey || null);
  }, [settings.coachioApiKey]);

  // Persist settings
  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (e) {
      console.warn('Failed to persist settings:', e);
    }
  }, [settings]);

  const hasGeminiKey = Boolean(settings.geminiApiKey?.trim() || getActiveGeminiKey());
  const hasCoachioKey = Boolean(settings.coachioApiKey?.trim());
  const hasAnyKey = hasGeminiKey || hasCoachioKey;

  // Persist active project id
  useEffect(() => {
    try {
      if (activeProjectId) localStorage.setItem(ACTIVE_PROJECT_KEY, activeProjectId);
      else localStorage.removeItem(ACTIVE_PROJECT_KEY);
    } catch {}
  }, [activeProjectId]);

  // Auto-save current project to history whenever meaningful state changes.
  // Debounced so we don't write on every keystroke.
  useEffect(() => {
    const hasContent =
      config.topic.trim().length > 0 ||
      titles.length > 0 ||
      scenes.length > 0;
    if (!hasContent) return;

    const timer = setTimeout(() => {
      const id = activeProjectId || `proj-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const selectedTitle = titles.find(t => t.selected)?.text || '';
      const entry: HistoryEntry = {
        id,
        timestamp: new Date().toISOString(),
        topic: config.topic,
        selectedTitle,
        thumbnailUrl,           // Will be stripped before localStorage write
        config,
        titles,
        scenes: scenes.map(s => ({
          ...s,
          isGeneratingImage: false,
          isGeneratingAudio: false,
          audioUrl: undefined,
          audioError: undefined,
          audioForText: undefined,
          error: undefined,
        })),
        fullScript,
        step,
        lastGeneratedTopic,
        lastGeneratedTitleId,
      };

      // Update in-memory history (full, including images for the active project).
      setHistory(prev => {
        const idx = prev.findIndex(p => p.id === id);
        const next = idx >= 0
          ? [...prev.slice(0, idx), entry, ...prev.slice(idx + 1)]
          : [entry, ...prev];
        const trimmed = next.slice(0, 30);
        saveHistory(trimmed); // saves a lite copy (no images) to localStorage
        return trimmed;
      });

      // Persist images + thumbnail + audio + whisper alignment to IndexedDB
      // so refresh or project switch never loses generated state.
      const sceneImages: Record<string, string> = {};
      scenes.forEach(s => {
        if (s.imageUrl) sceneImages[s.id] = s.imageUrl;
      });
      saveProjectAssets(id, {
        sceneImages,
        thumbnailUrl,
        audioBlob: audioBlob || undefined,
        whisperTimings: whisperTimings ?? undefined,
        whisperWords: whisperWords ?? undefined,
      });

      if (!activeProjectId) setActiveProjectId(id);
    }, 800);

    return () => clearTimeout(timer);
  }, [config, titles, scenes, thumbnailUrl, audioBlob, whisperTimings, whisperWords, fullScript, step, lastGeneratedTopic, lastGeneratedTitleId, activeProjectId]);

  // On mount, hydrate the active project's assets from IndexedDB so a refresh
  // doesn't lose generated images. We do this once when the activeProjectId is
  // first known.
  const hydratedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!activeProjectId || hydratedRef.current.has(activeProjectId)) return;
    hydratedRef.current.add(activeProjectId);
    (async () => {
      const assets = await loadProjectAssets(activeProjectId);
      if (!assets) return;
      if (assets.thumbnailUrl) {
        // Only hydrate if we don't already have one in memory.
        setThumbnailUrl(prev => prev ?? assets.thumbnailUrl);
      }
      if (Object.keys(assets.sceneImages).length > 0) {
        setScenes(prev =>
          prev.map(s => (s.imageUrl || !assets.sceneImages[s.id]
            ? s
            : { ...s, imageUrl: assets.sceneImages[s.id] }))
        );
      }
      if (assets.audioBlob) {
        // Object URL lives only this session — recreate from the saved Blob.
        setAudioBlob(prev => prev ?? assets.audioBlob ?? null);
        setAudioUrl(prev => prev ?? URL.createObjectURL(assets.audioBlob!));
      }
      // Whisper alignment — restore if the user already paid for it.
      if (assets.whisperTimings?.length) {
        setWhisperTimings(prev => prev ?? assets.whisperTimings as SceneTiming[]);
      }
      if (assets.whisperWords?.length) {
        setWhisperWords(prev => prev ?? assets.whisperWords);
      }
    })();
  }, [activeProjectId]);

  // --- DASHBOARD NAV ---
  const startNewProject = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsGeneratingBatch(false);
    setIsGeneratingThumbnail(false);
    setActiveProjectId(null);
    setConfig(DEFAULT_CONFIG);
    setTitles([]);
    setScenes([]);
    setFullScript('');
    setThumbnailUrl(undefined);
    setThumbnailError(undefined);
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(undefined);
    setAudioBlob(null);
    setLastGeneratedTopic('');
    setLastGeneratedTitleId('');
    setStep(AppStep.INPUT_TOPIC);
    setView('create');
  };

  const loadFromHistory = (id: string) => {
    const entry = history.find(h => h.id === id);
    if (!entry) return;

    // Abort any in-flight image generation from the previous project.
    abortRef.current?.abort();
    abortRef.current = null;
    setIsGeneratingBatch(false);
    setIsGeneratingThumbnail(false);
    if (audioUrl) URL.revokeObjectURL(audioUrl);

    setActiveProjectId(entry.id);
    setConfig(migrateConfig(entry.config));
    setTitles(entry.titles || []);
    setScenes((entry.scenes || []).map(s => ({
      ...s,
      isGeneratingImage: false,
      isGeneratingAudio: false,
      audioUrl: undefined,
      audioError: undefined,
      audioForText: undefined,
      error: undefined,
    })));
    setThumbnailUrl(entry.thumbnailUrl); // May be undefined for lite entries
    setThumbnailError(undefined);
    setFullScript(entry.fullScript || '');
    setLastGeneratedTopic(entry.lastGeneratedTopic || entry.config.topic);
    setLastGeneratedTitleId(entry.lastGeneratedTitleId || '');
    setAudioUrl(undefined);
    setAudioBlob(null);
    setStep(entry.step ?? AppStep.INPUT_TOPIC);
    setView('create');

    // Async hydrate images + audio from IndexedDB
    (async () => {
      const assets = await loadProjectAssets(entry.id);
      if (!assets) return;
      if (assets.thumbnailUrl) setThumbnailUrl(assets.thumbnailUrl);
      if (Object.keys(assets.sceneImages).length > 0) {
        setScenes(prev =>
          prev.map(s => ({ ...s, imageUrl: assets.sceneImages[s.id] ?? s.imageUrl }))
        );
      }
      if (assets.audioBlob) {
        setAudioBlob(assets.audioBlob);
        setAudioUrl(URL.createObjectURL(assets.audioBlob));
      }
      if (assets.whisperTimings?.length) {
        setWhisperTimings(assets.whisperTimings as SceneTiming[]);
      }
      if (assets.whisperWords?.length) {
        setWhisperWords(assets.whisperWords);
      }
    })();
  };

  const deleteFromHistory = (id: string) => {
    setHistory(prev => {
      const next = prev.filter(p => p.id !== id);
      saveHistory(next);
      return next;
    });
    if (activeProjectId === id) setActiveProjectId(null);
    deleteProjectAssets(id);
  };

  const clearAllHistory = () => {
    if (!confirm('Xoá toàn bộ lịch sử?')) return;
    const idsToDelete = history.map(h => h.id);
    setHistory([]);
    saveHistory([]);
    setActiveProjectId(null);
    Promise.all(idsToDelete.map(deleteProjectAssets));
  };

  // Prune orphan IDB entries on first load (best-effort cleanup).
  useEffect(() => {
    pruneOrphanAssets(new Set(history.map(h => h.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Build per-call image generation options for the active cast (1-3 chars).
   * Empty / all-stickman casts return characterRefs=[] so the prompt falls
   * back to the classic stickman style.
   */
  const buildImageOpts = async () => {
    const ids = config.characters?.length ? config.characters : ['stickman' as const];
    const refs = await Promise.all(ids.map(async (id) => {
      const c = getCharacter(id);
      if (c.id === 'stickman') {
        return {
          isStickman: true,
          styleHint: c.styleHint,
          personalityHint: c.personalityHint,
          label: c.labels[config.language],
        };
      }
      const [inline, blob] = await Promise.all([
        loadCharacterRefAsBase64(c.id),
        fetchCharacterRefBlob(c.id),
      ]);
      return {
        inline: inline || undefined,
        blob: blob || undefined,
        styleHint: c.styleHint,
        personalityHint: c.personalityHint,
        label: c.labels[config.language],
      };
    }));

    // Smart-fallback: if the saved image provider can't run because its key is
    // missing, swap to the other one when that one IS available.
    let provider = settings.imageProvider;
    if (provider === 'coachio_gpt_image_2' && !hasCoachioKey && hasGeminiKey) {
      provider = 'gemini';
    } else if (provider === 'gemini' && !hasGeminiKey && hasCoachioKey) {
      provider = 'coachio_gpt_image_2';
    }

    return {
      provider,
      coachioApiKey: settings.coachioApiKey,
      characterRefs: refs,
    };
  };

  // --- IMPORT / EXPORT LOGIC ---

  const handleExportJSON = () => {
    const projectData = {
      version: "1.2",
      timestamp: new Date().toISOString(),
      state: {
        step,
        config,
        titles,
        scenes,
        thumbnailUrl,
        lastGeneratedTopic,
        lastGeneratedTitleId,
        fullScript
      }
    };

    const blob = new Blob([JSON.stringify(projectData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vibesketch_${config.topic.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'project'}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const data = JSON.parse(content);

        if (data && data.state) {
          const s = data.state;
          abortRef.current?.abort();
          abortRef.current = null;
          setIsGeneratingBatch(false);
          setIsGeneratingThumbnail(false);
          if (audioUrl) URL.revokeObjectURL(audioUrl);

          setActiveProjectId(null); // imported = new project entry
          setConfig(migrateConfig(s.config));
          setTitles(s.titles || []);
          setScenes((s.scenes || []).map((sc: Scene) => ({
            ...sc,
            isGeneratingImage: false,
            isGeneratingAudio: false,
            audioUrl: undefined,
            audioError: undefined,
            audioForText: undefined,
            error: undefined,
          })));
          setThumbnailUrl(s.thumbnailUrl);
          setThumbnailError(undefined);
          setLastGeneratedTopic(s.lastGeneratedTopic || s.config?.topic || '');
          setLastGeneratedTitleId(s.lastGeneratedTitleId || '');
          setFullScript(s.fullScript || '');
          setAudioUrl(undefined);
          setAudioBlob(null);
          setStep(s.step ?? AppStep.INPUT_TOPIC);
          setView('create');
          alert("Đã tải dự án thành công!");
        } else {
          alert("File JSON không hợp lệ.");
        }
      } catch (err) {
        console.error("Import error", err);
        alert("Lỗi khi đọc file.");
      }
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsText(file);
  };

  // --- GENERATION HANDLERS ---

  const handleGenerateTitles = async () => {
    if (titles.length > 0 && config.topic.trim() === lastGeneratedTopic.trim()) {
      setStep(AppStep.SELECT_TITLE);
      return;
    }

    setIsLoading(true);
    try {
      const generated = await generateViralTitles(config.topic, config.tone, config.language);
      setTitles(generated.map((t, i) => ({ id: `title-${i}`, text: t, selected: false })));
      setLastGeneratedTopic(config.topic.trim());
      setStep(AppStep.SELECT_TITLE);
    } catch (e) {
      alert("Lỗi tạo tiêu đề. Vui lòng thử lại.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectTitle = (id: string) => {
    setTitles(prev => prev.map(t => ({ ...t, selected: t.id === id })));
  };

  /**
   * Commit the user-typed custom title into the title list. We keep it as a
   * synthetic entry with a stable id so downstream code (script gen cache,
   * history) treats it the same as an AI-generated title.
   */
  const handleSubmitCustomTitle = (text: string) => {
    const CUSTOM_ID = 'custom-title';
    if (!text.trim()) return;
    setTitles(prev => {
      const others = prev.filter(t => t.id !== CUSTOM_ID).map(t => ({ ...t, selected: false }));
      return [...others, { id: CUSTOM_ID, text: text.trim(), selected: true }];
    });
    // Invalidate the script cache so the new title triggers a fresh script.
    setLastGeneratedTitleId('');
  };

  const handleGenerateScript = async () => {
    const selectedTitle = titles.find(t => t.selected);
    if (!selectedTitle) return;

    if (scenes.length > 0 && selectedTitle.id === lastGeneratedTitleId) {
      setStep(AppStep.REVIEW_SCRIPT);
      return;
    }

    setIsLoading(true);
    try {
      const generatedScenes = await generateScriptScenes(selectedTitle.text, config.duration, config.language);
      setScenes(generatedScenes);
      setLastGeneratedTitleId(selectedTitle.id);
      setStep(AppStep.REVIEW_SCRIPT);
    } catch (e) {
      alert("Lỗi tạo kịch bản.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleStopGeneration = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setIsGeneratingBatch(false);
    setIsGeneratingThumbnail(false);
    // Clear any per-scene spinner state
    setScenes(prev => prev.map(s => ({ ...s, isGeneratingImage: false })));
  };

  /** Max number of scene-image requests in flight at once. */
  const MAX_CONCURRENT = 5;

  const handleStartVisualGeneration = async () => {
    setStep(AppStep.GENERATE_VISUALS);

    // Build image opts ONCE for the whole batch — character ref is the same
    // for all scenes, so we don't need to re-fetch it per scene.
    const opts = await buildImageOpts();

    const ac = new AbortController();
    abortRef.current = ac;
    setIsGeneratingBatch(true);

    // Snapshot scenes to process. We pull from this queue with N workers
    // so up to MAX_CONCURRENT requests run in parallel.
    const todo = scenes.filter(s => !s.imageUrl);
    let nextIdx = 0;

    const processOne = async (scene: Scene) => {
      if (ac.signal.aborted) return;
      setScenes(prev => prev.map(s => s.id === scene.id ? { ...s, isGeneratingImage: true, error: undefined } : s));

      try {
        const imageUrl = await generateWithRetry(
          () => generateDoodleImage(scene.visualPrompt, scene.keywords, config.aspectRatio, config.language, opts),
          ac.signal,
        );
        if (ac.signal.aborted) {
          setScenes(prev => prev.map(s => s.id === scene.id ? { ...s, isGeneratingImage: false } : s));
          return;
        }
        setScenes(prev => prev.map(s => s.id === scene.id ? { ...s, imageUrl, isGeneratingImage: false, error: undefined } : s));
      } catch (e: any) {
        console.error(`Error generating scene ${scene.id} after retries`, e);
        const msg = (e?.message || String(e)).slice(0, 200);
        setScenes(prev => prev.map(s => s.id === scene.id ? { ...s, isGeneratingImage: false, error: msg } : s));
      }
    };

    const worker = async () => {
      while (true) {
        if (ac.signal.aborted) return;
        const i = nextIdx++;
        if (i >= todo.length) return;
        await processOne(todo[i]);
      }
    };

    const workerCount = Math.min(MAX_CONCURRENT, todo.length);
    try {
      await Promise.all(Array.from({ length: workerCount }, () => worker()));
    } finally {
      if (abortRef.current === ac) abortRef.current = null;
      setIsGeneratingBatch(false);
    }
  };

  const handleRegenerateImage = async (id: string, prompt: string, keywords: string) => {
    // Single-scene regen — share the abort controller so the Stop button works here too.
    const ac = abortRef.current ?? new AbortController();
    abortRef.current = ac;
    setIsGeneratingBatch(true);
    setScenes(prev => prev.map(s => s.id === id ? { ...s, isGeneratingImage: true, error: undefined } : s));

    try {
        const opts = await buildImageOpts();
        const imageUrl = await generateWithRetry(
          () => generateDoodleImage(prompt, keywords, config.aspectRatio, config.language, opts),
          ac.signal,
        );
        if (ac.signal.aborted) {
          setScenes(prev => prev.map(s => s.id === id ? { ...s, isGeneratingImage: false } : s));
          return;
        }
        setScenes(prev => prev.map(s => s.id === id ? { ...s, imageUrl, isGeneratingImage: false, error: undefined } : s));
    } catch (e: any) {
        console.error('Regenerate failed after retries', e);
        const msg = (e?.message || String(e)).slice(0, 200);
        setScenes(prev => prev.map(s => s.id === id ? { ...s, isGeneratingImage: false, error: msg } : s));
    } finally {
        if (abortRef.current === ac) abortRef.current = null;
        setIsGeneratingBatch(false);
    }
  };

  const handleMoveToThumbnail = async () => {
      setStep(AppStep.GENERATE_THUMBNAIL);
      if (!thumbnailUrl) {
          handleGenerateThumbnail();
      }
  };

  const handleGenerateThumbnail = async (customPrompt?: string) => {
      const ac = new AbortController();
      abortRef.current = ac;
      setIsGeneratingThumbnail(true);
      setThumbnailError(undefined);
      const selectedTitle = titles.find(t => t.selected);
      const visualMetaphor = customPrompt && customPrompt.trim()
        ? customPrompt.trim()
        : (scenes.length > 0 ? scenes[0].visualPrompt : "");

      try {
          const opts = await buildImageOpts();
          const url = await generateWithRetry(
            () => generateThumbnailImage(
              selectedTitle?.text || config.topic,
              visualMetaphor,
              config.aspectRatio,
              opts
            ),
            ac.signal,
          );
          if (ac.signal.aborted) return;
          setThumbnailUrl(url);
          setThumbnailError(undefined);
      } catch (e: any) {
          console.error('Thumbnail failed after retries', e);
          if (!ac.signal.aborted) {
            const msg = (e?.message || String(e)).slice(0, 200);
            setThumbnailError(msg);
          }
      } finally {
          if (abortRef.current === ac) abortRef.current = null;
          setIsGeneratingThumbnail(false);
      }
  };

  // --- PER-SCENE VOICEOVER ---

  /**
   * Per-scene word budget driven by the duration profile (not by scenes.length).
   * This means: when user picks "3 mins" later, the budget instantly tells
   * the AI to make each scene LONGER instead of trying to add more scenes.
   *
   * `numScenes` arg is kept only for backward compat with existing call sites;
   * the budget itself comes from the profile.
   */
  const computeMaxWordsPerScene = (_numScenes: number) => {
    const profile = buildDurationProfile(config.duration, config.language);
    return {
      minWords: profile.wordsPerScene.min,
      maxWords: profile.wordsPerScene.max,
      perSceneSeconds: profile.secsPerScene,
      targetScenes: profile.targetScenes,
    };
  };

  const pushVoiceoverVariant = (prev: Scene, newText: string): Scene => ({
    ...prev,
    voiceover: newText,
    // Keep 3 latest old versions, skip duplicates
    voiceoverVariants: [
      prev.voiceover,
      ...(prev.voiceoverVariants || []).filter(v => v !== prev.voiceover),
    ].filter(v => v && v !== newText).slice(0, 3),
  });

  /** Build the scene-context block for rewriteScript so the rewrite stays
   *  on-topic and flows with adjacent scenes. */
  const buildSceneRewriteContext = (sceneIdx: number) => {
    const cur = scenes[sceneIdx];
    if (!cur) return undefined;
    return {
      visualPrompt: cur.visualPrompt,
      keywords: cur.keywords,
      prevVoiceover: scenes[sceneIdx - 1]?.voiceover,
      nextVoiceover: scenes[sceneIdx + 1]?.voiceover,
    };
  };

  const handleRewriteSceneVoiceover = async (id: string, mode: 'longer' | 'shorter') => {
    const idx = scenes.findIndex(s => s.id === id);
    if (idx < 0) return;
    const scene = scenes[idx];
    const { minWords, maxWords, perSceneSeconds } = computeMaxWordsPerScene(scenes.length);
    setIsRewriting(true);
    try {
      const newText = await rewriteScript(scene.voiceover, mode, config.language, {
        minWords,
        maxWords,
        targetSeconds: perSceneSeconds,
        context: buildSceneRewriteContext(idx),
      });
      const trimmed = (newText || '').trim();
      if (!trimmed || trimmed === scene.voiceover.trim()) {
        // No change — surface to the user so the loading state doesn't feel broken.
        console.warn('Rewrite returned no change for scene', id);
        return;
      }
      setScenes(prev => prev.map(s => s.id === id ? pushVoiceoverVariant(s, trimmed) : s));
    } catch (e) {
      console.error(e);
      alert("Lỗi viết lại lời dẫn.");
    } finally {
      setIsRewriting(false);
    }
  };

  /** Rewrite every scene's voiceover in parallel (worker pool of 3). */
  const handleRewriteAllVoiceovers = async (mode: 'longer' | 'shorter') => {
    const { minWords, maxWords, perSceneSeconds } = computeMaxWordsPerScene(scenes.length);
    // Snapshot the index map so context (prev/next) is computed against the
    // ORIGINAL voiceovers, not the in-progress rewritten ones.
    const snapshot = scenes.map(s => ({ ...s }));
    const targets = snapshot.map((_, i) => i);
    let nextIdx = 0;
    setIsRewriting(true);

    const worker = async () => {
      while (true) {
        const wi = nextIdx++;
        if (wi >= targets.length) return;
        const sceneIdx = targets[wi];
        const scene = snapshot[sceneIdx];
        if (!scene || !scene.voiceover.trim()) continue;
        try {
          const newText = await rewriteScript(scene.voiceover, mode, config.language, {
            minWords,
            maxWords,
            targetSeconds: perSceneSeconds,
            context: {
              visualPrompt: scene.visualPrompt,
              keywords: scene.keywords,
              prevVoiceover: snapshot[sceneIdx - 1]?.voiceover,
              nextVoiceover: snapshot[sceneIdx + 1]?.voiceover,
            },
          });
          const trimmed = (newText || '').trim();
          if (trimmed && trimmed !== scene.voiceover.trim()) {
            setScenes(prev => prev.map(s => s.id === scene.id ? pushVoiceoverVariant(s, trimmed) : s));
          }
        } catch (e) {
          console.warn(`Bulk rewrite failed for scene ${scene.id}`, e);
        }
      }
    };

    try {
      await Promise.all(Array.from({ length: Math.min(3, targets.length) }, () => worker()));
    } finally {
      setIsRewriting(false);
    }
  };

  const handleEditSceneVoiceover = (id: string, text: string) => {
    setScenes(prev => prev.map(s => {
      if (s.id !== id) return s;
      const trimmed = text;
      if (trimmed === s.voiceover) return s;
      return pushVoiceoverVariant(s, trimmed);
    }));
  };

  const handleRevertSceneVoiceover = (id: string, variantIdx: number) => {
    setScenes(prev => prev.map(s => {
      if (s.id !== id) return s;
      const v = s.voiceoverVariants?.[variantIdx];
      if (!v) return s;
      return pushVoiceoverVariant(s, v);
    }));
  };

  // --- COMBINED AUDIO (TTS for the whole script in one pass) ---

  const handleMoveToAudio = () => {
    setStep(AppStep.GENERATE_AUDIO);
  };

  /**
   * Single combined TTS over the whole script for either provider. Cost-wise
   * one call per project — per-scene splitting is intentionally NOT done here
   * (10× the cost). Per-scene caption timing is recovered downstream by
   * running Whisper alignment on the combined audio.
   *
   *  - Gemini: prepends settings.geminiTtsStyle as a tone instruction.
   *  - Coachio (ElevenLabs v2): uses settings.coachioTtsVoice for the voice id.
   */
  const handleGenerateAudio = async (overrideScript?: string) => {
    const text = (overrideScript && overrideScript.trim())
      ? overrideScript.trim()
      : scenes.map(s => s.voiceover).filter(Boolean).join(' ');

    if (!text.trim()) {
      alert("Chưa có lời dẫn để tạo audio.");
      return;
    }

    setIsLoading(true);
    try {
      if (audioUrl) URL.revokeObjectURL(audioUrl);

      let blob: Blob | null = null;
      if (settings.audioProvider === 'coachio_elevenlabs') {
        const key = settings.coachioApiKey?.trim();
        if (!key) {
          alert("Cần Coachio API key (vào Cấu hình để dán).");
          return;
        }
        blob = await generateAudioWithCoachio({
          apiKey: key,
          text,
          voice: settings.coachioTtsVoice || COACHIO_VOICES[0].id,
        });
      } else {
        blob = await generateSpeech(text, config.language, settings.geminiTtsStyle);
      }

      if (blob) {
        setAudioBlob(blob);
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        setFullScript(text);
      } else {
        alert("Không thể tạo âm thanh. Thử lại sau.");
      }
    } catch (e: any) {
      console.error(e);
      alert(`Lỗi khi tạo audio: ${e?.message || e}`);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Manually edit a scene's caption text. Updates scene.voiceover (so future
   * exports / TTS regenerations stay in sync) and rewires the Whisper word
   * stream for that scene's window so karaoke mode picks up the correction
   * instead of replaying the Whisper transcription error.
   *
   * Timing strategy:
   *  - If the new word count matches the old one, swap texts in place and
   *    keep the existing per-word timestamps (cheap + precise).
   *  - Otherwise redistribute words evenly across the scene's window — loses
   *    fine timing but stays in sync with the audio it does cover.
   */
  const handleEditSceneCaption = (sceneId: string, newText: string) => {
    setScenes(prev => prev.map(s => s.id === sceneId ? { ...s, voiceover: newText } : s));

    if (!whisperWords || !whisperTimings) return;
    const t = whisperTimings.find(x => x.sceneId === sceneId);
    if (!t) return;

    const trimmed = newText.trim();
    const newWords = trimmed ? trimmed.split(/\s+/) : [];

    const inScope: WhisperWord[] = [];
    const outOfScope: WhisperWord[] = [];
    for (const w of whisperWords) {
      if (w.start >= t.start - 0.1 && w.end <= t.end + 0.1) inScope.push(w);
      else outOfScope.push(w);
    }

    let updated: WhisperWord[];
    if (newWords.length === 0) {
      updated = [];
    } else if (newWords.length === inScope.length) {
      updated = inScope.map((w, i) => ({ ...w, text: newWords[i] }));
    } else {
      const dur = Math.max(0.1, t.end - t.start);
      const per = dur / newWords.length;
      updated = newWords.map((text, i) => ({
        text,
        start: t.start + i * per,
        end: i === newWords.length - 1 ? t.end : t.start + (i + 1) * per,
      }));
    }

    const merged = [...outOfScope, ...updated].sort((a, b) => a.start - b.start);
    setWhisperWords(merged);
  };

  /**
   * Fetch the current combined voiceover blob, send it to the active Whisper
   * provider, and align the returned word timestamps back onto the scene list.
   */
  const handleAlignWithWhisper = async () => {
    if (!audioUrl) {
      alert("Chưa có audio để khớp caption.");
      return;
    }
    const provider = createWhisperProvider({
      coachioApiKey: settings.coachioApiKey,
      geminiApiKey: settings.geminiApiKey,
      groqApiKey: settings.groqApiKey,
    });
    if (!provider) {
      alert("Chưa cấu hình Whisper provider (cần Groq API key trong Cấu hình).");
      return;
    }

    setIsAligningWhisper(true);
    setWhisperError(undefined);
    try {
      const blob = await (await fetch(audioUrl)).blob();
      const words = await provider.transcribeWithTimestamps(blob, config.language);
      const timings = alignSceneTimingsToWhisper(scenes, words, config.language);
      setWhisperTimings(timings);
      setWhisperWords(words);
    } catch (e: any) {
      console.error("Whisper alignment failed", e);
      setWhisperError(e?.message || String(e));
    } finally {
      setIsAligningWhisper(false);
    }
  };

  // Drop stale alignment whenever the underlying audio or scene list changes.
  useEffect(() => {
    setWhisperTimings(null);
    setWhisperWords(undefined);
    setWhisperError(undefined);
  }, [audioUrl, scenes]);

  /**
   * Render the final mp4 via ffmpeg.wasm. Streams progress back into state so
   * the StepVideo UI can show a live phase + percent bar.
   */
  const handleRenderVideo = async (timings: SceneTiming[]) => {
    if (!audioBlob) {
      alert("Chưa có audio gộp để dựng video.");
      return;
    }
    if (!timings.length) {
      alert("Không có timing scene.");
      return;
    }
    const ac = new AbortController();
    renderAbortRef.current = ac;
    setIsRendering(true);
    setRenderError(undefined);
    setRenderProgress({ phase: 'load_ffmpeg', ratio: 0, message: 'Bắt đầu...' });
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoUrl(undefined);

    try {
      const blob = await assembleVideo({
        scenes,
        timings,
        audioBlob,
        aspectRatio: config.aspectRatio,
        captionStyle: settings.captionStyle,
        whisperWords,
        transition: settings.transition,
        transitionDuration: settings.transitionDuration,
        signal: ac.signal,
        onProgress: setRenderProgress,
      });
      if (ac.signal.aborted) return;
      const url = URL.createObjectURL(blob);
      setVideoUrl(url);
    } catch (e: any) {
      console.error("Video render failed", e);
      if (!ac.signal.aborted) {
        setRenderError(e?.message || String(e));
      }
    } finally {
      if (renderAbortRef.current === ac) renderAbortRef.current = null;
      setIsRendering(false);
    }
  };

  const handleCancelRender = () => {
    renderAbortRef.current?.abort();
    renderAbortRef.current = null;
  };

  // Drop the rendered video whenever underlying inputs change — stale.
  useEffect(() => {
    if (videoUrl) {
      URL.revokeObjectURL(videoUrl);
      setVideoUrl(undefined);
    }
    setRenderError(undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioUrl, scenes, settings.captionStyle, settings.transition, settings.transitionDuration, config.aspectRatio, whisperWords]);

  const handleExportZip = async () => {
    const zip = new JSZip();
    const folderName = config.topic.replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'project';
    const folder = zip.folder(folderName);
    if (!folder) return;

    // 1. Script + metadata
    let scriptContent = `TITLE: ${titles.find(t=>t.selected)?.text}\n`;
    scriptContent += `LANGUAGE: ${config.language}\n`;
    scriptContent += `ASPECT RATIO: ${config.aspectRatio}\n`;
    scriptContent += `DURATION: ${config.duration}\n\n`;
    const derivedFullScript = scenes.map(s => s.voiceover).join(' ');
    scriptContent += `--- FULL VOICEOVER ---\n${derivedFullScript}\n\n`;
    scriptContent += `--- SCENES ---\n`;
    scenes.forEach((scene, idx) => {
      scriptContent += `SCENE ${idx + 1} (${scene.keywords}):\nVOICEOVER: ${scene.voiceover}\nPROMPT: ${scene.visualPrompt}\n\n`;
    });
    folder.file("script.txt", scriptContent);

    // 2. Images
    scenes.forEach((scene, idx) => {
      if (scene.imageUrl && scene.imageUrl.startsWith('data:')) {
        const base64Data = scene.imageUrl.split(',')[1];
        folder.file(`scene_${String(idx + 1).padStart(2, '0')}.png`, base64Data, { base64: true });
      }
    });
    if (thumbnailUrl && thumbnailUrl.startsWith('data:')) {
      const base64Data = thumbnailUrl.split(',')[1];
      folder.file("thumbnail.png", base64Data, { base64: true });
    }

    // 3. Combined voiceover (single file — both Gemini and Coachio go here).
    // Per-scene timing is recovered downstream via Whisper alignment.
    if (audioBlob) {
      const ext = audioBlob.type.includes("wav") ? "wav" : "mp3";
      folder.file(`voiceover.${ext}`, audioBlob);
    }

    try {
      const content = await zip.generateAsync({ type: "blob" });
      const url = window.URL.createObjectURL(content);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${folderName}_vibe_project.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Error creating zip", e);
      alert("Có lỗi khi nén file.");
    }
  };

  const renderCreateView = () => {
    if (!hasAnyKey) {
      return (
        <div className="flex flex-col items-center justify-center h-full space-y-6 animate-fade-in">
          <div className="text-center space-y-2 max-w-lg">
            <h2 className="font-hand text-4xl font-bold text-ink">Cần API Key</h2>
            <p className="font-sans text-gray-600">
              Dán <strong>Coachio API Key</strong> trong tab <strong>Cấu hình</strong> là đủ để bắt đầu (tạo tiêu đề, kịch bản, ảnh).
              Gemini API key chỉ cần thêm nếu bạn muốn dùng phần voiceover (TTS).
            </p>
          </div>
          <Button onClick={() => setView('settings')} className="scale-125">
            ⚙️ Mở Cấu hình
          </Button>
        </div>
      );
    }

    switch (step) {
      case AppStep.INPUT_TOPIC:
        return (
          <StepInput
            config={config}
            setConfig={setConfig}
            onNext={handleGenerateTitles}
            isLoading={isLoading}
          />
        );
      case AppStep.SELECT_TITLE:
        return (
          <StepTitles
            titles={titles}
            onSelect={handleSelectTitle}
            onSubmitCustom={handleSubmitCustomTitle}
            onNext={handleGenerateScript}
            onBack={() => setStep(AppStep.INPUT_TOPIC)}
            isLoading={isLoading}
          />
        );
      case AppStep.REVIEW_SCRIPT:
        return (
          <StepScript
            scenes={scenes}
            setScenes={setScenes}
            onNext={handleStartVisualGeneration}
            onBack={() => setStep(AppStep.SELECT_TITLE)}
            isLoading={isLoading}
          />
        );
      case AppStep.GENERATE_VISUALS:
        return (
          <StepVisuals
            scenes={scenes}
            regenerateImage={handleRegenerateImage}
            regenerateAllFailures={handleStartVisualGeneration}
            onNext={handleMoveToThumbnail}
            onBack={() => setStep(AppStep.REVIEW_SCRIPT)}
            aspectRatio={config.aspectRatio}
            language={config.language}
            isGeneratingBatch={isGeneratingBatch}
            onStop={handleStopGeneration}
            onRewriteVoiceover={handleRewriteSceneVoiceover}
            onRewriteAllVoiceovers={handleRewriteAllVoiceovers}
            onEditVoiceover={handleEditSceneVoiceover}
            onRevertVoiceover={handleRevertSceneVoiceover}
            isRewriting={isRewriting}
            perSceneBudget={computeMaxWordsPerScene(scenes.length)}
            duration={config.duration}
            onChangeDuration={(d) => setConfig(prev => ({ ...prev, duration: d }))}
          />
        );
      case AppStep.GENERATE_THUMBNAIL:
        return (
            <StepThumbnail
                thumbnailUrl={thumbnailUrl}
                isGenerating={isGeneratingThumbnail}
                error={thumbnailError}
                onRegenerate={handleGenerateThumbnail}
                onStop={handleStopGeneration}
                onExportZip={handleMoveToAudio}
                onBack={() => setStep(AppStep.GENERATE_VISUALS)}
                aspectRatio={config.aspectRatio}
                language={config.language}
                defaultCustomPrompt={
                  scenes.length > 0 ? scenes[0].visualPrompt :
                  (titles.find(t => t.selected)?.text || config.topic)
                }
            />
        );
      case AppStep.GENERATE_AUDIO:
        return (
          <StepAudio
            scenes={scenes}
            audioUrl={audioUrl}
            isLoading={isLoading}
            onGenerateAudio={handleGenerateAudio}
            onExportZip={handleExportZip}
            onNext={() => setStep(AppStep.GENERATE_VIDEO)}
            onBack={() => setStep(AppStep.GENERATE_THUMBNAIL)}
            duration={config.duration}
            onChangeDuration={(d) => setConfig(prev => ({ ...prev, duration: d }))}
            audioProvider={settings.audioProvider}
            hasGeminiKey={hasGeminiKey}
            hasCoachioKey={hasCoachioKey}
            onOpenSettings={() => setView('settings')}
            coachioTtsVoice={settings.coachioTtsVoice || COACHIO_VOICES[0].id}
            geminiTtsStyle={settings.geminiTtsStyle || ''}
            onChangeCoachioVoice={(voiceId) => setSettings(s => ({ ...s, coachioTtsVoice: voiceId }))}
            onChangeGeminiStyle={(style) => setSettings(s => ({ ...s, geminiTtsStyle: style }))}
          />
        );
      case AppStep.GENERATE_VIDEO:
        return (
          <StepVideo
            scenes={scenes}
            audioUrl={audioUrl}
            language={config.language}
            aspectRatio={config.aspectRatio}
            hasWhisperProvider={hasWhisperProvider({
              coachioApiKey: settings.coachioApiKey,
              geminiApiKey: settings.geminiApiKey,
              groqApiKey: settings.groqApiKey,
            })}
            whisperTimings={whisperTimings}
            whisperWords={whisperWords}
            isAligningWhisper={isAligningWhisper}
            whisperError={whisperError}
            onAlignWithWhisper={handleAlignWithWhisper}
            onOpenSettings={() => setView('settings')}
            onBack={() => setStep(AppStep.GENERATE_AUDIO)}
            onExportZip={handleExportZip}
            captionStyle={settings.captionStyle ?? DEFAULT_CAPTION_STYLE}
            onChangeCaptionStyle={(captionStyle) => setSettings(s => ({ ...s, captionStyle }))}
            videoUrl={videoUrl}
            isRendering={isRendering}
            renderProgress={renderProgress}
            renderError={renderError}
            onRender={handleRenderVideo}
            onCancelRender={handleCancelRender}
            videoRenderSupported={isVideoRenderSupported()}
            onEditSceneCaption={handleEditSceneCaption}
            transition={settings.transition ?? 'fade'}
            transitionDuration={settings.transitionDuration ?? 0.25}
            onChangeTransition={(t) => setSettings(s => ({ ...s, transition: t }))}
            onChangeTransitionDuration={(sec) => setSettings(s => ({ ...s, transitionDuration: sec }))}
          />
        );
      default:
        return null;
    }
  };

  const renderContent = () => {
    if (view === 'history') {
      const isRunning = isGeneratingBatch || isGeneratingThumbnail;
      return (
        <StepHistory
          entries={history}
          runningId={isRunning ? activeProjectId : null}
          onLoad={loadFromHistory}
          onDelete={deleteFromHistory}
          onClearAll={clearAllHistory}
          onCreateNew={startNewProject}
        />
      );
    }
    if (view === 'settings') {
      return (
        <StepSettings
          settings={settings}
          onSave={(s) => setSettings(s)}
        />
      );
    }
    if (view === 'setup') {
      return <StepSetup />;
    }
    return renderCreateView();
  };

  const NavButton: React.FC<{ id: DashboardView; label: string; icon: React.ReactNode }> = ({ id, label, icon }) => (
    <button
      onClick={() => {
        // "Tạo mới" always starts a fresh project — current work is preserved
        // in History via auto-save and can be resumed by clicking it there.
        if (id === 'create') {
          startNewProject();
        } else {
          setView(id);
        }
      }}
      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg font-hand text-base transition-colors ${
        view === id ? 'bg-ink text-paper' : 'text-ink hover:bg-black/5'
      }`}
    >
      <span className="w-4 h-4">{icon}</span>
      {label}
    </button>
  );

  return (
    <div className="min-h-screen paper-texture flex flex-col">
      <header className="w-full p-6 border-b-2 border-gray-200/50 flex justify-between items-center bg-white/60 backdrop-blur-md sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-ink rounded-lg flex items-center justify-center transform -rotate-3">
            <svg className="w-6 h-6 text-paper" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
          </div>
          <h1 className="font-hand text-3xl font-bold text-ink tracking-wide">VibeSketch AI</h1>
        </div>

        <nav className="hidden md:flex items-center gap-1 bg-white/40 rounded-xl p-1 border border-ink/10">
          <NavButton id="create" label="Tạo mới" icon={
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"/></svg>
          } />
          <NavButton id="history" label="Lịch sử" icon={
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
          } />
          <NavButton id="setup" label="Setup" icon={
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/></svg>
          } />
          <NavButton id="settings" label="Cấu hình" icon={
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
          } />
        </nav>

        <div className="flex items-center gap-2 md:gap-4">
             <div className="flex gap-2 mr-2">
               <input
                 type="file"
                 ref={fileInputRef}
                 onChange={handleFileChange}
                 accept=".json"
                 className="hidden"
               />
               <button
                 onClick={handleImportClick}
                 className="p-2 text-ink hover:bg-black/5 rounded-full transition-colors tooltip"
                 title="Mở Project (JSON)"
               >
                 <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"></path></svg>
               </button>
               <button
                 onClick={handleExportJSON}
                 className="p-2 text-ink hover:bg-black/5 rounded-full transition-colors tooltip"
                 title="Lưu Project (JSON)"
               >
                 <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-4 4m0 0l-4-4m4 4V4"></path></svg>
               </button>
             </div>

             {view === 'create' && hasAnyKey && (
                 <div className="hidden lg:flex gap-3 text-sm font-sans font-semibold text-gray-500 mr-4">
                    <span className={step === AppStep.INPUT_TOPIC ? "text-ink underline decoration-2 underline-offset-4" : ""}>1. Chủ đề</span>
                    <span className="text-gray-300">→</span>
                    <span className={step === AppStep.SELECT_TITLE ? "text-ink underline decoration-2 underline-offset-4" : ""}>2. Tiêu đề</span>
                    <span className="text-gray-300">→</span>
                    <span className={step === AppStep.REVIEW_SCRIPT ? "text-ink underline decoration-2 underline-offset-4" : ""}>3. Kịch bản</span>
                    <span className="text-gray-300">→</span>
                    <span className={step === AppStep.GENERATE_VISUALS ? "text-ink underline decoration-2 underline-offset-4" : ""}>4. Hình ảnh</span>
                    <span className="text-gray-300">→</span>
                    <span className={step === AppStep.GENERATE_THUMBNAIL ? "text-ink underline decoration-2 underline-offset-4" : ""}>5. Bìa</span>
                    <span className="text-gray-300">→</span>
                    <span className={step === AppStep.GENERATE_AUDIO ? "text-ink underline decoration-2 underline-offset-4" : ""}>6. Audio</span>
                    <span className="text-gray-300">→</span>
                    <span className={step === AppStep.GENERATE_VIDEO ? "text-ink underline decoration-2 underline-offset-4" : ""}>7. Video</span>
                 </div>
             )}
        </div>
      </header>

      {/* Mobile nav bar */}
      <nav className="md:hidden flex items-center justify-around gap-1 bg-white/60 border-b border-ink/10 px-2 py-1">
        <NavButton id="create" label="Tạo" icon={<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"/></svg>} />
        <NavButton id="history" label="Lịch sử" icon={<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>} />
        <NavButton id="setup" label="Setup" icon={<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"/></svg>} />
        <NavButton id="settings" label="Cấu hình" icon={<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>} />
      </nav>

      <main className="flex-1 flex flex-col items-center justify-start p-6 md:p-12 w-full">
        {renderContent()}
      </main>

      <BackgroundJobBanner
        visible={isGeneratingBatch || isGeneratingThumbnail}
        message={(() => {
          if (isGeneratingThumbnail) return 'Đang thiết kế thumbnail...';
          const done = scenes.filter(s => s.imageUrl).length;
          const total = scenes.length;
          if (total > 0) return `Đang vẽ cảnh ${Math.min(done + 1, total)}/${total}...`;
          return 'Đang tạo ảnh...';
        })()}
        progress={(() => {
          if (isGeneratingThumbnail || scenes.length === 0) return null;
          return scenes.filter(s => s.imageUrl).length / scenes.length;
        })()}
        onStop={handleStopGeneration}
        onGoToBatch={view !== 'create' ? () => setView('create') : undefined}
      />
    </div>
  );
};

export default App;
