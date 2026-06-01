import { GoogleGenAI, Type, Modality } from "@google/genai";
import { Scene, Language, ImageProvider } from "../types";
import {
  generateImageWithCoachio,
  uploadImage as coachioUpload,
  coachioChat,
  coachioChatJSON,
  COACHIO_SMART_MODEL,
} from "./coachioService";

let userGeminiApiKey: string | null = null;
let userCoachioApiKey: string | null = null;

/** Set the runtime Gemini API key (called from settings). Pass empty string to clear. */
export const setGeminiApiKey = (key: string | null | undefined) => {
  userGeminiApiKey = key && key.trim() ? key.trim() : null;
};

/** Set the runtime Coachio API key (called from settings). Pass empty string to clear. */
export const setCoachioApiKey = (key: string | null | undefined) => {
  userCoachioApiKey = key && key.trim() ? key.trim() : null;
};

/** Returns the active Gemini API key: user-supplied takes precedence, then env. */
export const getActiveGeminiKey = (): string | undefined => {
  if (userGeminiApiKey) return userGeminiApiKey;
  const envKey = process.env.API_KEY;
  return envKey && envKey.length > 0 ? envKey : undefined;
};

/** Returns the active Coachio API key (user-supplied only — no env fallback). */
export const getActiveCoachioKey = (): string | undefined =>
  userCoachioApiKey || undefined;

const getAI = () => new GoogleGenAI({ apiKey: getActiveGeminiKey() });

/**
 * Helper for Retry Logic (Handles 429 Rate Limits and 503 Overloads)
 */
const withRetry = async <T>(fn: () => Promise<T>, retries = 5, delay = 5000): Promise<T> => {
  try {
    return await fn();
  } catch (error: any) {
    const status = error.status || (error.error && error.error.code);
    const message = error.message || "";
    
    const isRetryable = 
      status === 429 || 
      status === 503 || 
      message.includes('429') || 
      message.includes('503') ||
      message.toLowerCase().includes('overloaded') ||
      message.toLowerCase().includes('unavailable');

    if (retries > 0 && isRetryable) {
      console.warn(`Gemini API busy (${status}). Retrying in ${delay/1000}s... (${retries} retries left)`);
      await new Promise(resolve => setTimeout(resolve, delay));
      const nextDelay = delay * 1.5 + Math.random() * 1000;
      return withRetry(fn, retries - 1, nextDelay);
    }
    throw error;
  }
};

const LANGUAGE_CONFIG: Record<Language, {
    role: string;
    formulas: string;
    scriptRules: string;
    visualText: string;
    voiceName: string;
}> = {
    'Vietnamese': {
        role: "viral YouTube strategist for the Vietnamese market — write like a thoughtful Vietnamese creator, not like a marketing template",
        formulas: `
        Pick the formula that fits the topic naturally. Don't force a heavy hook on a gentle topic.
        1. Biến đổi cực hạn: [Hành động] + [Đối tượng] + [Trạng thái mới] — VD: "Bỏ điện thoại 7 ngày, đầu óc trở nên sắc bén".
        2. Sự thật phũ phàng: "Tại sao bạn mãi [trạng thái xấu] dù đã [cố gắng]?" — chỉ dùng khi chủ đề thực sự nặng.
        3. Thách đố / chứng minh: "Cho tôi 5 phút, tôi sẽ chứng minh [điều bất ngờ]." (hoặc biến thể "2 phút", "60 giây").
        4. Lời cảnh tỉnh: "[Hành động ngay] nếu không muốn [hậu quả]." — dùng tiết chế, đừng doạ thái quá.
        5. Tiêu đề nhẹ / kể chuyện: nếu chủ đề không hợp 4 công thức trên, viết một tiêu đề tự nhiên (kể chuyện, câu hỏi tò mò, hoặc nhận định ngắn) — vẫn cuốn nhưng không "câu view" lộ liễu.

        Trộn đa dạng: trong 5 tiêu đề trả về, KHÔNG dùng cùng một công thức 2 lần liên tiếp. Nếu chủ đề nhẹ nhàng, ưu tiên #5.`,
        scriptRules: "Tone: Street-smart, engaging, uses Vietnamese internet slang if appropriate, distinctively Vietnamese perspective. Tránh sáo rỗng kiểu 'BẠN SẼ KHÔNG TIN' / 'BÍ MẬT KHÔNG AI NÓI'.",
        visualText: "Text inside image must be Vietnamese.",
        voiceName: "Kore"
    },
    'English': {
        role: "viral YouTube strategist for the US/Global market",
        formulas: `
        1. Extreme Transformation: How I became [Unstoppable/Stoic] by doing [Simple Action].
        2. The Harsh Truth: Why you are still [Broke/Unhappy] despite [Hard Work].
        3. The Warning: Stop doing [Action] immediately (Here is why).`,
        scriptRules: "Tone: Punchy, idiomatic English, direct, 'Better Than Yesterday' or 'Kurzgesagt' style.",
        visualText: "Text inside image must be English.",
        voiceName: "Puck"
    },
    'Japanese': {
        role: "viral YouTube strategist for the Japanese market",
        formulas: `
        1. Extreme Transformation: [Action] shite, [Status] ni naru houhou (How to become [Status] by [Action]). Use strong kanji.
        2. Cruel Truth: Nazebito wa [Fail] suru no ka? (Why people fail?).
        3. Wake-up Call: [Action] yamenasai (Stop [Action]). Zettai ni (Absolutely).`,
        scriptRules: "Tone: High-context, engaging, manga-style storytelling structure (Ki-Sho-Ten-Ketsu), polite yet impactful (Desu/Masu or Da/Dearu depending on tone).",
        visualText: "Text inside image must be Japanese (Kanji/Kana).",
        voiceName: "Kore"
    }
};

/**
 * Generate Viral Titles. Uses Coachio when its key is set, otherwise Gemini.
 */
export const generateViralTitles = async (
  topic: string,
  tone: string,
  language: Language,
  context?: string,
): Promise<string[]> => {
  const config = LANGUAGE_CONFIG[language];

  const contextBlock = (context && context.trim())
    ? `\n\n    EXTRA CONTEXT FROM THE CREATOR (treat as authoritative — titles must align with this angle, not generic takes on "${topic}"):\n    """\n    ${context.trim()}\n    """`
    : '';

  const prompt = `
    Act as a ${config.role}.
    Generate 5 viral YouTube titles in ${language} based on the keyword: "${topic}".
    Tone: ${tone}.${contextBlock}

    Title formulas to draw from (pick whichever fits naturally — mix them, don't repeat the same one):
    ${config.formulas}

    Capitalize 1–2 POWER WORDS in each title for emphasis (not every word). Avoid clickbait clichés.
    Return ONLY a JSON array of 5 strings, like ["Title 1", "Title 2", ...].
  `;

  const coachioKey = getActiveCoachioKey();
  if (coachioKey) {
    try {
      return await coachioChatJSON<string[]>(coachioKey, prompt, { temperature: 0.9 });
    } catch (error) {
      console.error("Error generating titles (Coachio):", error);
      return ["Error generating titles. Please try again."];
    }
  }

  const ai = getAI();
  try {
    return await withRetry(async () => {
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: { type: Type.STRING }
          }
        }
      });
      return response.text ? JSON.parse(response.text) : [];
    });
  } catch (error) {
    console.error("Error generating titles:", error);
    return ["Error generating titles. Please try again."];
  }
};

/**
 * Generate a neutral, factual outline / talking points for a given topic so
 * the user can pre-fill the Context field on step 0. The AI is explicitly
 * told NOT to fabricate facts (numbers, dates, names, quotes) and to mark
 * placeholders where the user should plug in their own data.
 *
 * Output is plain markdown (bullet list), localised per language. Returns
 * the raw text — the caller just dumps it into the context textarea.
 */
export const suggestContextOutline = async (
  topic: string,
  tone: string,
  language: Language,
): Promise<string> => {
  // Localised placeholder + closing instructions so the AI knows which
  // language to write in AND which placeholder marker to use for unknown
  // facts (so the user can spot what to fill in later).
  const i18n: Record<Language, { placeholder: string; outputLang: string; closing: string }> = {
    Vietnamese: {
      placeholder: '[cần nguồn]',
      outputLang: 'Vietnamese',
      closing: 'Viết dàn ý bằng tiếng Việt, dùng markdown bullet, dài tối đa ~250 từ. Không thêm lời chào hay đoạn mở đầu, chỉ trả về dàn ý.',
    },
    English: {
      placeholder: '[needs source]',
      outputLang: 'English',
      closing: 'Write the outline in English, use markdown bullets, max ~250 words. No greeting or intro line — outline only.',
    },
    Japanese: {
      placeholder: '[要出典]',
      outputLang: 'Japanese',
      closing: '日本語で、markdownの箇条書き、最大250語程度。挨拶や導入は不要、アウトラインのみ返してください。',
    },
  };
  const t = i18n[language];

  const prompt = `
You are a neutral research assistant helping a YouTube creator outline a video on this topic:
"${topic}"

The intended tone is "${tone}", but your job here is NOT to write a script — it is to give the creator a balanced, factual research outline they can edit.

HARD RULES — these matter more than style:
1. ACCURACY OVER FLOW: never invent statistics, dates, study names, quotes, or attributions. If a specific number/study/quote would naturally fit, write the placeholder ${t.placeholder} so the creator knows to plug their own source in.
2. NO BIAS: if the topic is contested or has multiple valid perspectives, present at least two sides briefly. Don't moralise, don't pick a side for the creator.
3. NO CLICKBAIT FRAMING: this is a planning document, not a hook. Use neutral, descriptive language.
4. STAY ON TOPIC: don't drift into tangents. Every bullet must directly serve the stated topic.
5. STRUCTURE (in this order):
   - **Góc nhìn / Angle:** 1–2 sentences on the most useful angle to take.
   - **Các ý chính / Key points:** 3–5 bullets. Each is a structural idea, not a claim. Sub-bullet only if it clarifies what the creator needs to research.
   - **Kết / Takeaway:** 1 sentence on what the viewer should walk away with.
   - **Cần kiểm chứng / To verify:** short list of specific facts the creator should look up before publishing (uses the ${t.placeholder} marker).

${t.closing}
`;

  const coachioKey = getActiveCoachioKey();
  if (coachioKey) {
    try {
      return await coachioChat(coachioKey, prompt, { temperature: 0.4, maxTokens: 1200 });
    } catch (error) {
      console.error('Error generating context outline (Coachio):', error);
      throw error;
    }
  }

  const ai = getAI();
  try {
    return await withRetry(async () => {
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: prompt,
        config: { temperature: 0.4 },
      });
      return response.text || '';
    });
  } catch (error) {
    console.error('Error generating context outline:', error);
    throw error;
  }
};

/**
 * Total-duration profile shared between script generation and per-scene
 * rewrite budgeting. Key insight: scene count should NOT scale linearly
 * with duration — cap at ~28 so viewers don't get whiplash. Instead, longer
 * videos get longer voiceovers per scene.
 */
export interface DurationProfile {
  totalSeconds: number;
  targetScenes: number;
  secsPerScene: number;
  wordsPerScene: { min: number; max: number; target: number };
  density: 'snappy' | 'engaging' | 'cinematic';
}

const WORDS_PER_SECOND: Record<Language, number> = {
  Vietnamese: 3.2,
  English: 2.5,
  Japanese: 4.0,
};

/** Parse the user-facing duration label into total seconds. */
const parseDurationSeconds = (label: string): number => {
  if (label.includes('60s') || label.includes('60 s')) return 60;
  if (label.includes('3 min')) return 180;
  if (label.includes('5-10') || label.includes('Long')) return 450;
  return 180;
};

/**
 * Build a duration profile. Scene count grows slowly with duration so the
 * voiceover per scene scales up too (matching the chosen total duration).
 *
 *   60s  →  14 scenes × ~4.3s   →   ~14 words / scene (VN)
 *  120s  →  18 scenes × ~6.7s   →   ~22 words / scene
 *  180s  →  22 scenes × ~8.2s   →   ~26 words / scene
 *  450s  →  28 scenes × ~16s    →   ~51 words / scene  (capped)
 */
export const buildDurationProfile = (
  durationLabel: string,
  language: Language,
): DurationProfile => {
  const totalSeconds = parseDurationSeconds(durationLabel);
  const targetScenes =
    totalSeconds <= 60 ? 14 :
    totalSeconds <= 120 ? 18 :
    totalSeconds <= 180 ? 22 :
    totalSeconds <= 300 ? 25 : 28;
  const secsPerScene = totalSeconds / targetScenes;
  const wps = WORDS_PER_SECOND[language] ?? 3.0;
  const target = Math.round(secsPerScene * wps);
  const min = Math.max(3, Math.floor(target * 0.75));
  const max = Math.max(min + 2, Math.ceil(target * 1.25));
  const density: DurationProfile['density'] =
    secsPerScene < 5 ? 'snappy' :
    secsPerScene < 10 ? 'engaging' : 'cinematic';
  return { totalSeconds, targetScenes, secsPerScene, wordsPerScene: { min, max, target }, density };
};

/**
 * Generate Script, Visual Descriptions and Keywords
 */
export const generateScriptScenes = async (
  title: string,
  duration: string,
  language: Language,
  context?: string,
): Promise<Scene[]> => {
  const config = LANGUAGE_CONFIG[language];
  const profile = buildDurationProfile(duration, language);

  const densityFeel: Record<DurationProfile['density'], string> = {
    snappy: 'snappy, fast-cut, TikTok-style — every line punches',
    engaging: 'engaging with breathing room — like a polished YouTube explainer',
    cinematic: 'cinematic and reflective — longer beats, more storytelling per scene',
  };

  const contextBlock = (context && context.trim())
    ? `\n\n    EXTRA CONTEXT FROM THE CREATOR (treat as the authoritative angle / source material — every scene must build on this rather than generic takes on the topic):\n    """\n    ${context.trim()}\n    """`
    : '';

  const prompt = `
    Act as a master storyteller for ${language} explainer videos (stick-figure / doodle style).
    Create a script for a video titled: "${title}".
    Target total duration: ${duration} (~${profile.totalSeconds}s).${contextBlock}

    TONE & LANGUAGE RULES (CRITICAL):
    1. **Universal Appeal:** Simple, punchy, and understandable.
    2. **Engaging Voice:** Sound like a smart friend sharing a secret.
    3. **Cultural Context:** ${config.scriptRules}

    PACING & DENSITY (HARD CONSTRAINT — must match the requested duration):
    - Total scenes: aim for ${profile.targetScenes} scenes (acceptable range: ${Math.max(8, profile.targetScenes - 3)}–${profile.targetScenes + 3}).
    - DO NOT exceed 30 scenes total — instead, make each scene's voiceover LONGER if the duration is long.
    - Each scene plays for ~${profile.secsPerScene.toFixed(1)} seconds.
    - Each scene's voiceover: target ~${profile.wordsPerScene.target} words (range ${profile.wordsPerScene.min}–${profile.wordsPerScene.max}).
    - The overall feel should be ${densityFeel[profile.density]}.

    STRUCTURE REQUIREMENTS:
    1. **THE HOOK (first 2-3 scenes):**
       - Scene 1: Statement/Question. Scene 2: The twist/problem. Scene 3: Bridge to the body.
    2. **The Body:** Break down the concept into visual steps. Each scene = one idea + one visual.
    3. **The Conclusion:** A powerful, memorable one-liner that loops back to the hook.

    VISUAL INSTRUCTION:
    - Ensure logical visual progression (comic-strip style — each scene builds on the previous).
    - Visuals must be simple character / stick-figure metaphors.

    For each scene, provide:
    - 'voiceover': ${language} spoken text, MUST be within the ${profile.wordsPerScene.min}–${profile.wordsPerScene.max} word range.
    - 'visualPrompt': clear visual metaphor (describe in English for the artist).
    - 'keywords': exact text to overlay on the image (${config.visualText}, 1-3 words max).

    Return ONLY a JSON array of ${profile.targetScenes} (±3) scene objects, like:
    [{"voiceover":"...","visualPrompt":"...","keywords":"..."}, ...]
  `;

  type SceneJSON = { voiceover: string; visualPrompt: string; keywords: string };
  const toScenes = (data: SceneJSON[]): Scene[] =>
    data.map((item, index) => ({
      id: `scene-${index}-${Date.now()}`,
      voiceover: item.voiceover,
      visualPrompt: item.visualPrompt,
      keywords: item.keywords,
    }));

  const coachioKey = getActiveCoachioKey();
  if (coachioKey) {
    // Script JSON is the largest structured output in the app. Try the
    // smart (pro) tier first; if Coachio's catalog doesn't include it (404
    // / "unknown model"), fall back through full-flash and finally lite.
    // This way the user always gets a working result, and we still default
    // to the most reliable model when available.
    const candidates = [
      COACHIO_SMART_MODEL,        // google/gemini-3.1-pro — best at strict JSON
      "google/gemini-3.1-flash",  // mid tier fallback
      "google/gemini-3.1-flash-lite", // worst case — same as the default
    ];
    const errors: string[] = [];
    for (const model of candidates) {
      try {
        console.log(`[script] Coachio model: ${model}`);
        const data = await coachioChatJSON<SceneJSON[]>(coachioKey, prompt, {
          model,
          temperature: 0.8,
          maxTokens: 8192,
        });
        if (!Array.isArray(data) || data.length === 0) {
          throw new Error(`returned ${Array.isArray(data) ? 'empty array' : 'non-array value'}`);
        }
        return toScenes(data);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.warn(`[script] ${model} failed: ${msg}`);
        errors.push(`${model}: ${msg}`);
        // Only continue the cascade for model-availability errors. If it's
        // a key/auth issue, fail fast — every subsequent model will fail
        // the same way and we just waste roundtrips.
        const lower = msg.toLowerCase();
        const isModelMissing = /\b(404|400|model|not found|unknown|unsupported|invalid)\b/.test(lower);
        const isAuth = /\b(401|403|unauthor|forbidden|api[- ]?key)\b/.test(lower);
        if (isAuth || !isModelMissing) break;
      }
    }
    throw new Error(`[Coachio script] Tất cả model thất bại:\n${errors.join('\n')}`);
  }

  const ai = getAI();
  try {
    return await withRetry(async () => {
      const response = await ai.models.generateContent({
        model: "gemini-3-pro-preview",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                voiceover: { type: Type.STRING },
                visualPrompt: { type: Type.STRING },
                keywords: { type: Type.STRING }
              },
              required: ["voiceover", "visualPrompt", "keywords"]
            }
          }
        }
      });

      if (response.text) {
        return toScenes(JSON.parse(response.text));
      }
      return [];
    });
  } catch (error) {
    console.error("Error generating script:", error);
    return [];
  }
};

interface CharacterRef {
  /** Inline base64 + mime, used by Gemini directly. */
  inline?: { data: string; mimeType: string };
  /** Blob, used to upload to Coachio. */
  blob?: Blob;
  /** Style hint for the prompt: "doodle character with brown short hair...". */
  styleHint: string;
  /** Personality hint: "curious, holding a magnifying glass". */
  personalityHint: string;
  /** Visible label for prompt context: "Tò mò". */
  label: string;
  /** True when this slot is the default stickman (no reference image). */
  isStickman?: boolean;
}

interface ImageProviderOpts {
  provider?: ImageProvider;
  coachioApiKey?: string;
  /** 0-3 character references. Empty / undefined = pure stickman scene. */
  characterRefs?: CharacterRef[];
}

const buildCharacterStyleBlock = (refs?: CharacterRef[]): string => {
  const doodles = (refs || []).filter(r => !r.isStickman && r.inline);
  const stickmanCount = (refs || []).filter(r => r.isStickman).length;

  // Pure stickman scene (no doodle references at all)
  if (doodles.length === 0) {
    return `
    CHARACTER STYLE — CLASSIC STICKMAN${stickmanCount > 1 ? `S (${stickmanCount} of them)` : ''}:
    - Perfect circle head, simple thin black stick limbs.
    - Clear facial expression (eyes + mouth only) reflecting the scene emotion.
    - No clothing, no hair details. Pure minimalist stickman.`;
  }

  if (doodles.length === 1 && stickmanCount === 0) {
    const r = doodles[0];
    return `
    CHARACTER STYLE — SINGLE DOODLE (must match the attached reference image):
    - Main character: ${r.styleHint}. Personality / typical pose: ${r.personalityHint}.
    - Loose hand-drawn doodle line style: black outlines + light cel-shading with flat colors.
    - Keep RECOGNIZABLE across scenes (same hair, outfit, palette as reference).
    - Adapt only pose / expression to fit the scene.
    - If the script needs a SUPPORTING figure (e.g., the main character talking to someone),
      use a small classic stickman beside the main doodle — never invent a second doodle.`;
  }

  const list = doodles
    .map((r, i) => `    - Character ${i + 1} ("${r.label}"): ${r.styleHint}. Personality: ${r.personalityHint}.`)
    .join('\n');

  return `
    CHARACTER STYLE — DOODLE CAST (must match the attached reference images, in order):
${list}
    - Loose hand-drawn doodle line style: black outlines + light cel-shading + flat colors.
    - Each character MUST stay recognizable scene-to-scene (same hair, outfit, palette).
    - Adapt only pose / expression to fit the scene.${stickmanCount > 0 ? `
    - This scene also includes ${stickmanCount} extra figure(s) drawn as classic stickman (small, minimalist).` : doodles.length === 2 ? `
    - If a third figure is needed, draw it as a classic stickman.` : ''}`;
};

/**
 * Generate Doodle Image (With Retry, supports Gemini or Coachio GPT Image 2)
 */
export const generateDoodleImage = async (
  visualPrompt: string,
  textToRender: string,
  aspectRatio: '16:9' | '9:16',
  language: Language,
  opts: ImageProviderOpts = {}
): Promise<string | undefined> => {
  const refs = opts.characterRefs ?? [];
  const doodleRefs = refs.filter(r => !r.isStickman);

  const fullPrompt = `
    Create a clean, funny, minimalist hand-drawn doodle illustration in the style of
    Vietnamese / Better-Than-Yesterday-style explainer channels.

    SCENE: ${visualPrompt}.
    TEXT: Write "${textToRender}" clearly in the image. Font: hand-written marker, bold black.
    The text is in ${language}.

    ${buildCharacterStyleBlock(refs)}

    BACKGROUND: solid OFF-WHITE / BEIGE (#FDF6E3). Flat color, no texture.
    LINES: smooth black outlines. No pencil grain, no rough sketching.

    COMPOSITION:
    - Center the character${doodleRefs.length > 1 ? 's' : ''}.
    - Keep it simple and uncluttered.
    - High contrast.
    - Format: ${aspectRatio === '9:16' ? 'Vertical Portrait (9:16)' : 'Horizontal Landscape (16:9)'}.
  `;

  // Coachio path (either gpt_image_2 or nano-banana-2)
  if (opts.provider === 'coachio_gpt_image_2' || opts.provider === 'coachio_nano_banana_2') {
    let imagesUrl: string[] | undefined;
    if (doodleRefs.length > 0 && opts.coachioApiKey) {
      try {
        const urls = await Promise.all(
          doodleRefs
            .filter(r => r.blob)
            .map((r, i) => coachioUpload(opts.coachioApiKey!, r.blob!, `character-${i + 1}.png`))
        );
        imagesUrl = urls;
      } catch (e) {
        console.warn('Coachio character upload failed, generating without refs:', e);
      }
    }
    const modelIdentifier = opts.provider === 'coachio_nano_banana_2' ? 'nano-banana-2' : 'gpt_image_2';
    return generateImageWithCoachio({
      apiKey: opts.coachioApiKey || '',
      prompt: fullPrompt,
      aspectRatio,
      imagesUrl,
      modelIdentifier,
    });
  }

  // Gemini path — attach all doodle reference images inline
  const ai = getAI();
  const inlineParts = doodleRefs
    .filter(r => r.inline)
    .map(r => ({ inlineData: { mimeType: r.inline!.mimeType, data: r.inline!.data } }));
  const contents = inlineParts.length > 0
    ? [{ role: 'user', parts: [...inlineParts, { text: fullPrompt }] }]
    : fullPrompt;

  return withRetry(async () => {
    const response = await ai.models.generateContent({
      model: "gemini-3-pro-image-preview",
      contents: contents as any,
      config: {
        imageConfig: {
            aspectRatio: aspectRatio,
            imageSize: "1K"
        }
      }
    });

    if (response.candidates && response.candidates[0].content.parts) {
      for (const part of response.candidates[0].content.parts) {
        if (part.inlineData && part.inlineData.data) {
          return `data:image/png;base64,${part.inlineData.data}`;
        }
      }
    }
    return undefined;
  });
};

/**
 * Generate Thumbnail Image — High-CTR YouTube style for stick-figure doodle channels.
 * Matches the visual language of channels like "Better Than Yesterday" /
 * Vietnamese doodle channels: bold handwritten title, power-words highlighted in
 * red or yellow, dramatic stickman expression, optional comparison split or red arrow.
 */
export const generateThumbnailImage = async (
  title: string,
  visualMetaphor: string = "",
  aspectRatio: '16:9' | '9:16',
  opts: ImageProviderOpts = {}
): Promise<string | undefined> => {
    const refs = opts.characterRefs ?? [];
    const doodleRefs = refs.filter(r => !r.isStickman);
    const orientationGuide = aspectRatio === '9:16'
      ? `VERTICAL PORTRAIT (9:16) — for Shorts/TikTok. Stack the title text on TOP (2-3 lines), the character${doodleRefs.length > 1 ? 's' : ''} in the lower 2/3.`
      : `HORIZONTAL LANDSCAPE (16:9) — for YouTube. Place the title text on the LEFT half (2-3 lines), the character${doodleRefs.length > 1 ? 's' : ''} on the RIGHT half. Or split top/bottom.`;

    const characterDirective = doodleRefs.length === 0
      ? `STICK FIGURE:
      - Classic stickman: perfect circle head, simple black stick limbs.
      - HIGHLY DRAMATIC expression — shocked / amazed / mind-blown / excited.
      - Clear pose that visually echoes the concept: ${visualMetaphor || title}.
      - Optional supporting prop (book, light bulb, dollar sign, trophy, brain icon, phone, clock).`
      : doodleRefs.length === 1
      ? `CHARACTER (must match the attached reference image):
      - Same character: ${doodleRefs[0].styleHint}.
      - Personality: ${doodleRefs[0].personalityHint}.
      - HIGHLY DRAMATIC expression — shocked / amazed / excited / surprised.
      - Same hairstyle, outfit, and color palette as the reference.
      - Pose echoes the concept: ${visualMetaphor || title}.`
      : `CHARACTERS (must match the attached reference images, in order):
${doodleRefs.map((r, i) => `      - Character ${i + 1} ("${r.label}"): ${r.styleHint}. Personality: ${r.personalityHint}.`).join('\n')}
      - All ${doodleRefs.length} characters appear together in the thumbnail.
      - All have HIGHLY DRAMATIC expressions reacting to the topic.
      - Same hairstyle, outfit, and color palette as their respective references.${refs.some(r => r.isStickman) ? `
      - Plus a small classic stickman in the background as supporting figure.` : ''}`;

    const prompt = `
      Create a HIGH-CTR YOUTUBE THUMBNAIL in the visual style of Vietnamese
      doodle channels ("Better Than Yesterday", "Tri Thức Vui Vẻ") — hand-drawn
      illustration with bold handwritten typography.

      TITLE TEXT (must appear large and legible in the image):
      "${title}"
      - Font: BOLD HAND-WRITTEN / MARKER style. Mostly black.
      - Highlight 1-2 POWER WORDS in BRIGHT RED or YELLOW HIGHLIGHTER (use a
        yellow rectangular highlighter behind a key word, OR color a power word red).
      - Title takes ~40-50% of the canvas. Multi-line, tight leading.

      ${characterDirective}

      ATTENTION-GRAB ELEMENTS (add 1-2, not all):
      - Bold RED hand-drawn arrow pointing at the character or key word.
      - Or split the canvas into a "before vs after" / "wrong vs right" comparison
        with a red ✗ on one side and green ✓ on the other.
      - Or a small percentage / number badge ("90%", "3 BƯỚC") in red or yellow.

      STYLE RULES:
      1. Background: solid OFF-WHITE / BEIGE (#FDF6E3). Flat color, no texture.
      2. Lines: clean, smooth, consistent BLACK strokes. No pencil grain.
      3. Accent palette: black + beige + accent RED + accent YELLOW${doodleRefs.length > 0 ? ' + the reference characters\' own colors' : ''}.
      4. High contrast, instantly readable on a phone screen.
      5. NO real photographs. NO 3D rendering. Pure 2D doodle.

      LAYOUT: ${orientationGuide}

      The title text must be in the same language as written above (do NOT translate).
    `;

    // Coachio path (either gpt_image_2 or nano-banana-2)
    if (opts.provider === 'coachio_gpt_image_2' || opts.provider === 'coachio_nano_banana_2') {
      let imagesUrl: string[] | undefined;
      if (doodleRefs.length > 0 && opts.coachioApiKey) {
        try {
          const urls = await Promise.all(
            doodleRefs
              .filter(r => r.blob)
              .map((r, i) => coachioUpload(opts.coachioApiKey!, r.blob!, `character-${i + 1}.png`))
          );
          imagesUrl = urls;
        } catch (e) {
          console.warn('Coachio character upload failed, generating without refs:', e);
        }
      }
      const modelIdentifier = opts.provider === 'coachio_nano_banana_2' ? 'nano-banana-2' : 'gpt_image_2';
      return generateImageWithCoachio({
        apiKey: opts.coachioApiKey || '',
        prompt,
        aspectRatio,
        imagesUrl,
        modelIdentifier,
      });
    }

    // Gemini path — attach all reference images inline
    const ai = getAI();
    const inlineParts = doodleRefs
      .filter(r => r.inline)
      .map(r => ({ inlineData: { mimeType: r.inline!.mimeType, data: r.inline!.data } }));
    const contents = inlineParts.length > 0
      ? [{ role: 'user', parts: [...inlineParts, { text: prompt }] }]
      : prompt;

    return withRetry(async () => {
      const response = await ai.models.generateContent({
        model: "gemini-3-pro-image-preview",
        contents: contents as any,
        config: {
          imageConfig: {
              aspectRatio: aspectRatio,
              imageSize: "1K"
          }
        }
      });

      if (response.candidates && response.candidates[0].content.parts) {
        for (const part of response.candidates[0].content.parts) {
          if (part.inlineData && part.inlineData.data) {
            return `data:image/png;base64,${part.inlineData.data}`;
          }
        }
      }
      return undefined;
    });
  };

interface RewriteOptions {
  /** Soft floor — natural-sounding target lower bound. */
  minWords?: number;
  /** Hard cap on output word count. */
  maxWords?: number;
  /** Approximate spoken duration in seconds — used to give the AI a feel for pacing. */
  targetSeconds?: number;
  /** Scene context — keeps the rewritten VO tied to what's on screen and to neighbours. */
  context?: {
    visualPrompt?: string;
    keywords?: string;
    prevVoiceover?: string;
    nextVoiceover?: string;
  };
}

const countWords = (s: string): number => {
  if (!s) return 0;
  // For Japanese (CJK), word boundaries are ambiguous — count phonetic chunks
  // by treating runs of CJK chars as ~1 word per 2 chars. For others, split on whitespace.
  const trimmed = s.trim();
  if (!trimmed) return 0;
  if (/[぀-ヿ一-鿿]/.test(trimmed)) {
    // CJK-heavy: ~2 chars per "word"
    return Math.max(1, Math.round(trimmed.length / 2));
  }
  return trimmed.split(/\s+/).length;
};

const stripWrappingQuotes = (s: string): string =>
  s.trim().replace(/^[`"']+|[`"']+$/g, '').trim();

/**
 * Rewrite a script fragment longer/shorter, clamped to a per-scene word/time
 * budget and aligned with the on-screen visual + neighbouring scenes.
 *
 * Forces the model to actually CHANGE the text (rephrase when at budget),
 * so the user always sees a result after clicking "Dài" / "Ngắn".
 */
export const rewriteScript = async (
  currentScript: string,
  mode: 'longer' | 'shorter',
  language: Language,
  options: RewriteOptions = {}
): Promise<string> => {
  const config = LANGUAGE_CONFIG[language];
  const { minWords, maxWords, targetSeconds, context } = options;

  const currentWords = countWords(currentScript);
  const lo = minWords ?? Math.max(2, Math.floor(currentWords * 0.6));
  const hi = maxWords ?? Math.max(lo + 3, currentWords + 3);

  // Target word count within the [lo..hi] band:
  //  - "longer": aim closer to hi, with at least +1 word over current (capped by hi).
  //  - "shorter": aim closer to lo (capped by floor).
  let targetWords: number;
  let atCap = false;
  if (mode === 'longer') {
    const wanted = Math.max(currentWords + 1, Math.round(currentWords * 1.35));
    targetWords = Math.min(hi, wanted);
    atCap = targetWords <= currentWords;
  } else {
    const wanted = Math.max(lo, Math.round(currentWords * 0.7));
    targetWords = Math.max(lo, wanted);
  }

  const direction = mode === 'longer'
    ? (atCap
        ? `KEEP the word count near ${currentWords} but REPHRASE with richer vocabulary, more vivid imagery, or stronger emotion`
        : `EXPAND with vivid detail to roughly ${targetWords} words (within ${lo}–${hi})`)
    : `TIGHTEN to roughly ${targetWords} words (within ${lo}–${hi}) by cutting filler — keep only the punch`;

  const budgetBlock = (minWords || maxWords) ? `
    BUDGET (must respect):
    - Word range for this scene: ${lo}–${hi} words${targetSeconds ? ` (~${targetSeconds.toFixed(1)}s spoken at natural pace)` : ''}.
    - Current input is ${currentWords} words.
    - Target output: ~${targetWords} words (stay in range).
    - This fragment is one scene of a fast-paced explainer video.` : '';

  const contextBlock = context ? `
    SCENE CONTEXT (the rewrite MUST stay relevant to this):
    ${context.visualPrompt ? `- What appears on screen: ${context.visualPrompt}` : ''}
    ${context.keywords ? `- Text overlay shown on the image: "${context.keywords}"` : ''}
    ${context.prevVoiceover ? `- Previous scene's voiceover: "${context.prevVoiceover}"` : ''}
    ${context.nextVoiceover ? `- Next scene's voiceover: "${context.nextVoiceover}"` : ''}` : '';

  const prompt = `
    You are a viral-video voiceover editor for the ${language} market.
    Rewrite this single-scene voiceover fragment: ${direction}.
${budgetBlock}
${contextBlock}

    MANDATORY:
    1. Output MUST be DIFFERENT from the input. Returning the input verbatim is a failure.
    2. Stay on-topic with the scene context above — don't drift to unrelated ideas.
    3. Flow naturally with the previous / next voiceover if given (no abrupt topic jump).
    4. Keep the core meaning and the tone: ${config.scriptRules}
    5. Output ONLY the rewritten ${language} text. No quotes, no labels, no explanation.

    Original:
    ${currentScript}
  `;

  const coachioKey = getActiveCoachioKey();

  const callOnce = async (extraInstruction = ''): Promise<string> => {
    const fullPrompt = extraInstruction ? `${prompt}\n\n${extraInstruction}` : prompt;
    if (coachioKey) {
      const raw = await coachioChat(coachioKey, fullPrompt, { temperature: 0.8 });
      return stripWrappingQuotes(raw);
    }
    const ai = getAI();
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: fullPrompt,
    });
    return stripWrappingQuotes(response.text || '');
  };

  try {
    let result = await callOnce();
    // If the model returned the input unchanged (happens with strict prompts),
    // retry once with an explicit "must reword" suffix.
    if (result && result === stripWrappingQuotes(currentScript)) {
      const retry = await callOnce(
        `CRITICAL: Previous attempt returned the input unchanged. Use different words this time — synonyms, different sentence structure, or different focus.`
      );
      if (retry && retry !== stripWrappingQuotes(currentScript)) result = retry;
    }
    return result || currentScript;
  } catch (error) {
    console.error("Rewrite error", error);
    return currentScript;
  }
};

/**
 * WAV Header Helper
 */
const createWavHeader = (dataLength: number, sampleRate: number = 24000) => {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const buffer = new ArrayBuffer(44);
  const view = new DataView(buffer);

  view.setUint32(0, 0x52494646, false); // "RIFF"
  view.setUint32(4, 36 + dataLength, true); // ChunkSize
  view.setUint32(8, 0x57415645, false); // "WAVE"
  view.setUint32(12, 0x666d7420, false); // "fmt "
  view.setUint32(16, 16, true); // Subchunk1Size
  view.setUint16(20, 1, true); // AudioFormat
  view.setUint16(22, numChannels, true); // NumChannels
  view.setUint32(24, sampleRate, true); // SampleRate
  view.setUint32(28, byteRate, true); // ByteRate
  view.setUint16(32, blockAlign, true); // BlockAlign
  view.setUint16(34, bitsPerSample, true); // BitsPerSample
  view.setUint32(36, 0x64617461, false); // "data"
  view.setUint32(40, dataLength, true); // Subchunk2Size

  return buffer;
};

/** Speaker gender selection for Gemini TTS. */
export type TtsGender = 'female' | 'male';

/**
 * Map (language, gender) → Gemini prebuilt voice name. Picks voices that
 * read each language naturally:
 *
 *   Kore   — female, warm + clear (great for VN/JA narration)
 *   Aoede  — female, brighter + younger feel (English-leaning)
 *   Puck   — male,   energetic, used by Better-Than-Yesterday-style EN channels
 *   Charon — male,   deeper / authoritative (good fit for VN/JA stoic tone)
 *
 * If Gemini drops one of these names in a future release the call falls
 * back to 'Kore' so we never hard-fail TTS.
 */
const GEMINI_VOICE_BY_LANG_GENDER: Record<Language, Record<TtsGender, string>> = {
  Vietnamese: { female: 'Kore',  male: 'Charon' },
  Japanese:   { female: 'Kore',  male: 'Charon' },
  English:    { female: 'Aoede', male: 'Puck' },
};

/**
 * Generate Speech using Gemini TTS.
 *
 *  - language: drives the default voice mapping
 *  - styleInstruction: optional natural-language style hint prepended to the
 *    prompt (e.g. "Read calmly with long pauses")
 *  - gender: 'female' (default) or 'male' — picks from
 *    GEMINI_VOICE_BY_LANG_GENDER above
 */
export const generateSpeech = async (
  text: string,
  language: Language,
  styleInstruction?: string,
  gender: TtsGender = 'female',
): Promise<Blob | null> => {
  if (!getActiveGeminiKey()) {
    throw new Error("Cần Gemini API key để tạo voiceover bằng Gemini TTS.");
  }
  const ai = getAI();
  const voiceName =
    GEMINI_VOICE_BY_LANG_GENDER[language]?.[gender] ||
    LANGUAGE_CONFIG[language].voiceName;

  // Gemini TTS picks up natural-language style hints when they sit above the
  // text to read. Empty / whitespace-only styles are skipped so the default
  // voice character isn't shifted.
  const style = styleInstruction?.trim();
  const ttsText = style ? `${style}\n\n${text}` : text;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: ttsText }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName },
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    
    if (!base64Audio) {
      throw new Error("No audio data returned");
    }

    const binaryString = window.atob(base64Audio);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    const wavHeader = createWavHeader(bytes.length, 24000);
    return new Blob([wavHeader, bytes], { type: 'audio/wav' });

  } catch (error) {
    console.error("TTS Error:", error);
    return null;
  }
};