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
  DashboardView
} from './types';
import {
  generateViralTitles,
  generateScriptScenes,
  generateDoodleImage,
  generateThumbnailImage,
  rewriteScript,
  generateSpeech,
  setGeminiApiKey,
  getActiveGeminiKey
} from './services/geminiService';

import { StepInput } from './components/StepInput';
import { StepTitles } from './components/StepTitles';
import { StepScript } from './components/StepScript';
import { StepVisuals } from './components/StepVisuals';
import { StepThumbnail } from './components/StepThumbnail';
import { StepAudio } from './components/StepAudio';
import { StepHistory } from './components/StepHistory';
import { StepSettings } from './components/StepSettings';

const SETTINGS_KEY = 'vibesketch.settings.v1';
const HISTORY_KEY = 'vibesketch.history.v1';
const ACTIVE_PROJECT_KEY = 'vibesketch.activeProjectId.v1';

const DEFAULT_SETTINGS: AppSettings = {
  imageProvider: 'gemini',
  coachioApiKey: '',
  geminiApiKey: '',
};

const DEFAULT_CONFIG: GenerationConfig = {
  topic: '',
  tone: 'Stoic',
  duration: 'Short (60s)',
  aspectRatio: '9:16',
  language: 'Vietnamese',
};

const loadSettings = (): AppSettings => {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
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

const saveHistory = (entries: HistoryEntry[]) => {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(entries));
  } catch (e) {
    console.warn('Failed to persist history (likely quota):', e);
  }
};

const App: React.FC = () => {
  // Dashboard view
  const [view, setView] = useState<DashboardView>('create');

  // Wizard step
  const [step, setStep] = useState<AppStep>(AppStep.INPUT_TOPIC);
  const [isLoading, setIsLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // Push Gemini key into the service module whenever settings change.
  useEffect(() => {
    setGeminiApiKey(settings.geminiApiKey || null);
  }, [settings.geminiApiKey]);

  // Persist settings
  useEffect(() => {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (e) {
      console.warn('Failed to persist settings:', e);
    }
  }, [settings]);

  const hasGeminiKey = Boolean(settings.geminiApiKey?.trim() || getActiveGeminiKey());

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
        thumbnailUrl,
        config,
        titles,
        scenes: scenes.map(s => ({ ...s, isGeneratingImage: false })),
        fullScript,
        step,
        lastGeneratedTopic,
        lastGeneratedTitleId,
      };

      setHistory(prev => {
        const idx = prev.findIndex(p => p.id === id);
        const next = idx >= 0
          ? [...prev.slice(0, idx), entry, ...prev.slice(idx + 1)]
          : [entry, ...prev];
        // Keep newest 50
        const trimmed = next.slice(0, 50);
        saveHistory(trimmed);
        return trimmed;
      });

      if (!activeProjectId) setActiveProjectId(id);
    }, 800);

    return () => clearTimeout(timer);
  }, [config, titles, scenes, thumbnailUrl, fullScript, step, lastGeneratedTopic, lastGeneratedTitleId, activeProjectId]);

  // --- DASHBOARD NAV ---
  const startNewProject = () => {
    setActiveProjectId(null);
    setConfig(DEFAULT_CONFIG);
    setTitles([]);
    setScenes([]);
    setFullScript('');
    setThumbnailUrl(undefined);
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
    setActiveProjectId(entry.id);
    setConfig(entry.config);
    setTitles(entry.titles || []);
    setScenes((entry.scenes || []).map(s => ({ ...s, isGeneratingImage: false })));
    setThumbnailUrl(entry.thumbnailUrl);
    setFullScript(entry.fullScript || '');
    setLastGeneratedTopic(entry.lastGeneratedTopic || entry.config.topic);
    setLastGeneratedTitleId(entry.lastGeneratedTitleId || '');
    setAudioUrl(undefined);
    setAudioBlob(null);
    setStep(entry.step ?? AppStep.INPUT_TOPIC);
    setView('create');
  };

  const deleteFromHistory = (id: string) => {
    setHistory(prev => {
      const next = prev.filter(p => p.id !== id);
      saveHistory(next);
      return next;
    });
    if (activeProjectId === id) {
      setActiveProjectId(null);
    }
  };

  const clearAllHistory = () => {
    if (!confirm('Xoá toàn bộ lịch sử?')) return;
    setHistory([]);
    saveHistory([]);
    setActiveProjectId(null);
  };

  const imageProviderOpts = {
    provider: settings.imageProvider,
    coachioApiKey: settings.coachioApiKey,
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
          setActiveProjectId(null); // imported = new project entry
          setConfig(s.config);
          setTitles(s.titles || []);
          setScenes((s.scenes || []).map((sc: Scene) => ({ ...sc, isGeneratingImage: false })));
          setThumbnailUrl(s.thumbnailUrl);
          setLastGeneratedTopic(s.lastGeneratedTopic || s.config.topic);
          setLastGeneratedTitleId(s.lastGeneratedTitleId || '');
          setFullScript(s.fullScript || '');
          setAudioUrl(undefined);
          setAudioBlob(null);
          setStep(s.step);
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

  const handleStartVisualGeneration = async () => {
    setStep(AppStep.GENERATE_VISUALS);

    for (const scene of scenes) {
        if (!scene.imageUrl) {
            setScenes(prev => prev.map(s => s.id === scene.id ? { ...s, isGeneratingImage: true } : s));
            try {
                const imageUrl = await generateDoodleImage(scene.visualPrompt, scene.keywords, config.aspectRatio, config.language, imageProviderOpts);
                setScenes(prev => prev.map(s => s.id === scene.id ? { ...s, imageUrl, isGeneratingImage: false } : s));
                await new Promise(r => setTimeout(r, 2000));
            } catch (e: any) {
                console.error(`Error generating scene ${scene.id}`, e);
                setScenes(prev => prev.map(s => s.id === scene.id ? { ...s, isGeneratingImage: false } : s));
            }
        }
    }
  };

  const handleRegenerateImage = async (id: string, prompt: string, keywords: string) => {
    setScenes(prev => prev.map(s => s.id === id ? { ...s, isGeneratingImage: true } : s));
    try {
        const imageUrl = await generateDoodleImage(prompt, keywords, config.aspectRatio, config.language, imageProviderOpts);
        setScenes(prev => prev.map(s => s.id === id ? { ...s, imageUrl, isGeneratingImage: false } : s));
    } catch (e) {
        console.error(e);
        alert("Lỗi tạo ảnh. Kiểm tra lại API key hoặc thử lại sau.");
        setScenes(prev => prev.map(s => s.id === id ? { ...s, isGeneratingImage: false } : s));
    }
  };

  const handleMoveToThumbnail = async () => {
      setStep(AppStep.GENERATE_THUMBNAIL);
      if (!thumbnailUrl) {
          handleGenerateThumbnail();
      }
  };

  const handleGenerateThumbnail = async () => {
      setIsGeneratingThumbnail(true);
      const selectedTitle = titles.find(t => t.selected);
      const visualMetaphor = scenes.length > 0 ? scenes[0].visualPrompt : "";

      try {
          const url = await generateThumbnailImage(
            selectedTitle?.text || config.topic,
            visualMetaphor,
            config.aspectRatio,
            imageProviderOpts
          );
          setThumbnailUrl(url);
      } catch (e) {
          console.error(e);
          alert("Lỗi tạo thumbnail.");
      } finally {
          setIsGeneratingThumbnail(false);
      }
  };

  // --- AUDIO LOGIC ---

  const handleMoveToAudio = () => {
    setStep(AppStep.GENERATE_AUDIO);
    if (!fullScript) {
      const combined = scenes.map(s => s.voiceover).join(' ');
      setFullScript(combined);
    }
  };

  const handleRewriteScript = async (mode: 'longer' | 'shorter') => {
    setIsRewriting(true);
    try {
      const newText = await rewriteScript(fullScript, mode, config.language);
      setFullScript(newText);
    } catch (e) {
      alert("Lỗi viết lại kịch bản.");
    } finally {
      setIsRewriting(false);
    }
  };

  const handleGenerateAudio = async () => {
    setIsLoading(true);
    try {
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
      const blob = await generateSpeech(fullScript, config.language);
      if (blob) {
        setAudioBlob(blob);
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
      } else {
        alert("Không thể tạo âm thanh. Thử lại sau.");
      }
    } catch (e) {
      console.error(e);
      alert("Lỗi khi tạo audio.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleExportZip = async () => {
    const zip = new JSZip();
    const folderName = config.topic.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const folder = zip.folder(folderName);

    if (!folder) return;

    let scriptContent = `TITLE: ${titles.find(t=>t.selected)?.text}\n`;
    scriptContent += `LANGUAGE: ${config.language}\n`;
    scriptContent += `ASPECT RATIO: ${config.aspectRatio}\n\n`;
    scriptContent += `--- FULL VOICEOVER SCRIPT ---\n${fullScript}\n\n`;
    scriptContent += `--- SCENES ---\n`;
    scenes.forEach((scene, idx) => {
        scriptContent += `SCENE ${idx + 1} (${scene.keywords}):\nVOICEOVER: ${scene.voiceover}\nPROMPT: ${scene.visualPrompt}\n\n`;
    });
    folder.file("script.txt", scriptContent);

    scenes.forEach((scene, idx) => {
        if (scene.imageUrl && scene.imageUrl.startsWith('data:')) {
            const base64Data = scene.imageUrl.split(',')[1];
            folder.file(`scene_${idx + 1}.png`, base64Data, { base64: true });
        }
    });

    if (thumbnailUrl && thumbnailUrl.startsWith('data:')) {
        const base64Data = thumbnailUrl.split(',')[1];
        folder.file("thumbnail.png", base64Data, { base64: true });
    }

    if (audioBlob) {
      folder.file("voiceover.wav", audioBlob);
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
    if (!hasGeminiKey) {
      return (
        <div className="flex flex-col items-center justify-center h-full space-y-6 animate-fade-in">
          <div className="text-center space-y-2 max-w-lg">
            <h2 className="font-hand text-4xl font-bold text-ink">Cần Gemini API Key</h2>
            <p className="font-sans text-gray-600">
              Tạo tiêu đề, kịch bản, voiceover và ảnh đều dùng Gemini. Vào tab <strong>Cấu hình</strong> để dán API key (lấy ở aistudio.google.com).
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
            onNext={handleMoveToThumbnail}
            onBack={() => setStep(AppStep.REVIEW_SCRIPT)}
            aspectRatio={config.aspectRatio}
          />
        );
      case AppStep.GENERATE_THUMBNAIL:
        return (
            <StepThumbnail
                thumbnailUrl={thumbnailUrl}
                isGenerating={isGeneratingThumbnail}
                onRegenerate={handleGenerateThumbnail}
                onExportZip={handleMoveToAudio}
                onBack={() => setStep(AppStep.GENERATE_VISUALS)}
                aspectRatio={config.aspectRatio}
            />
        );
      case AppStep.GENERATE_AUDIO:
        return (
          <StepAudio
            script={fullScript}
            setScript={setFullScript}
            audioUrl={audioUrl}
            onGenerateAudio={handleGenerateAudio}
            onRewrite={handleRewriteScript}
            onExportZip={handleExportZip}
            onBack={() => setStep(AppStep.GENERATE_THUMBNAIL)}
            isLoading={isLoading}
            isRewriting={isRewriting}
          />
        );
      default:
        return null;
    }
  };

  const renderContent = () => {
    if (view === 'history') {
      return (
        <StepHistory
          entries={history}
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
    return renderCreateView();
  };

  const NavButton: React.FC<{ id: DashboardView; label: string; icon: React.ReactNode }> = ({ id, label, icon }) => (
    <button
      onClick={() => {
        if (id === 'create' && view !== 'create') {
          // Returning to create — keep current project
          setView('create');
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

             {view === 'create' && hasGeminiKey && (
                 <div className="hidden lg:flex gap-4 text-sm font-sans font-semibold text-gray-500 mr-4">
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
                 </div>
             )}
        </div>
      </header>

      {/* Mobile nav bar */}
      <nav className="md:hidden flex items-center justify-around gap-1 bg-white/60 border-b border-ink/10 px-2 py-1">
        <NavButton id="create" label="Tạo" icon={<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4"/></svg>} />
        <NavButton id="history" label="Lịch sử" icon={<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>} />
        <NavButton id="settings" label="Cấu hình" icon={<svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>} />
      </nav>

      <main className="flex-1 flex flex-col items-center justify-start p-6 md:p-12 w-full">
        {renderContent()}
      </main>
    </div>
  );
};

export default App;
