const COACHIO_BASE = "https://api.coachio.ai/api/v1";

/** Default LLM model used for all chat completions. */
export const COACHIO_DEFAULT_MODEL = "google/gemini-3.1-flash-lite";

type CoachioAspectRatio =
  | "auto" | "1:1" | "5:4" | "9:16" | "21:9" | "16:9"
  | "4:3" | "3:2" | "4:5" | "3:4" | "2:3";

type CoachioResolution = "1k" | "2k" | "4k";

interface SubmitTaskOptions {
  apiKey: string;
  prompt: string;
  aspectRatio: CoachioAspectRatio;
  resolution?: CoachioResolution;
  imagesUrl?: string[]; // Optional reference images (already uploaded)
}

interface SubmitTaskResponse {
  task_id: string;
  status: string;
  message?: string;
}

interface StatusResponse {
  task_id: string;
  status: "pending" | "processing" | "completed" | "failed" | string;
  result_urls?: string[];
  result?: { output_urls?: string[] };
  message?: string;
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/** Map app aspect ratio (16:9 / 9:16) to a Coachio aspect ratio. */
export const mapAspectRatio = (
  appRatio: "16:9" | "9:16"
): CoachioAspectRatio => (appRatio === "9:16" ? "9:16" : "16:9");

/**
 * Upload a local image to Coachio. Returns a permanent CDN URL.
 */
export const uploadImage = async (
  apiKey: string,
  file: File | Blob,
  filename = "upload.png"
): Promise<string> => {
  const form = new FormData();
  form.append("file", file, filename);

  const res = await fetch(`${COACHIO_BASE}/upload/image`, {
    method: "POST",
    headers: { "X-API-Key": apiKey },
    body: form,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Coachio upload failed (${res.status}): ${text}`);
  }
  const data = await res.json();
  return data.url as string;
};

/** Submit an image generation task. Returns task_id. */
export const submitImageTask = async (
  opts: SubmitTaskOptions
): Promise<string> => {
  // aspect_ratio "auto" only supports resolution "1k"
  const aspect_ratio = opts.aspectRatio;
  const resolution: CoachioResolution =
    aspect_ratio === "auto" ? "1k" : opts.resolution || "1k";

  const body: Record<string, unknown> = {
    task_type: "image",
    prompt: opts.prompt,
    ai_model_config: {
      model_identifier: "gpt_image_2",
      generation_mode: "default",
      aspect_ratio,
      resolution,
    },
  };

  if (opts.imagesUrl && opts.imagesUrl.length > 0) {
    body.media_inputs = { images_url: opts.imagesUrl.slice(0, 5) };
  }

  const res = await fetch(`${COACHIO_BASE}/task/submit`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": opts.apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Coachio submit failed (${res.status}): ${text}`);
  }
  const data: SubmitTaskResponse = await res.json();
  if (!data.task_id) throw new Error("Coachio submit: missing task_id");
  return data.task_id;
};

/** Poll task status until completed/failed or timeout. */
export const pollTaskStatus = async (
  apiKey: string,
  taskId: string,
  { intervalMs = 2500, timeoutMs = 5 * 60 * 1000 } = {}
): Promise<string[]> => {
  const start = Date.now();
  let backoff = intervalMs;

  while (true) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("Coachio polling timed out");
    }

    const res = await fetch(`${COACHIO_BASE}/task/status/${taskId}`, {
      headers: { "X-API-Key": apiKey },
    });

    if (res.status === 429) {
      // exponential backoff on rate limits
      backoff = Math.min(backoff * 2, 15000);
      await sleep(backoff);
      continue;
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Coachio status failed (${res.status}): ${text}`);
    }

    const data: StatusResponse = await res.json();
    if (data.status === "completed") {
      const urls = data.result_urls || data.result?.output_urls || [];
      if (urls.length === 0) {
        throw new Error("Coachio completed without result_urls");
      }
      return urls;
    }
    if (data.status === "failed") {
      throw new Error(`Coachio task failed: ${data.message || "unknown"}`);
    }

    await sleep(intervalMs);
  }
};

/** Fetch a remote URL and return a base64 data URL (for local persistence). */
export const fetchAsDataUrl = async (url: string): Promise<string> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch result image: ${res.status}`);
  const blob = await res.blob();
  return await new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onloadend = () => resolve(fr.result as string);
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(blob);
  });
};

interface CoachioChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface CoachioChatOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  system?: string;
}

interface CoachioChatResponse {
  choices?: Array<{
    message?: { role?: string; content?: string };
    text?: string;
  }>;
}

/**
 * Call Coachio's OpenAI-compatible chat completions endpoint and return the
 * assistant's text reply. Non-streaming.
 */
export const coachioChat = async (
  apiKey: string,
  userPrompt: string,
  opts: CoachioChatOptions = {},
): Promise<string> => {
  if (!apiKey) throw new Error("Coachio API key is missing");

  const messages: CoachioChatMessage[] = [];
  if (opts.system) messages.push({ role: "system", content: opts.system });
  messages.push({ role: "user", content: userPrompt });

  const res = await fetch(`${COACHIO_BASE}/llm/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": apiKey,
    },
    body: JSON.stringify({
      model: opts.model || COACHIO_DEFAULT_MODEL,
      messages,
      stream: false,
      temperature: opts.temperature ?? 0.7,
      max_tokens: opts.maxTokens ?? 2512,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Coachio chat failed (${res.status}): ${text}`);
  }

  const data: CoachioChatResponse = await res.json();
  const content = data.choices?.[0]?.message?.content ?? data.choices?.[0]?.text;
  if (!content) throw new Error("Coachio chat: empty response");
  return content;
};

/**
 * Extract a JSON value from a chat reply that may be wrapped in ```json fences,
 * prefixed with prose, or otherwise noisy. Throws if no parsable JSON is found.
 */
const extractJSON = <T,>(raw: string): T => {
  const trimmed = raw.trim();
  // Strip ``` or ```json fences if present.
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  try {
    return JSON.parse(candidate) as T;
  } catch {
    // Last resort: find the first {...} or [...] block.
    const firstBrace = candidate.search(/[\[{]/);
    if (firstBrace >= 0) {
      const lastBrace = Math.max(candidate.lastIndexOf("}"), candidate.lastIndexOf("]"));
      if (lastBrace > firstBrace) {
        return JSON.parse(candidate.slice(firstBrace, lastBrace + 1)) as T;
      }
    }
    throw new Error(`Coachio chat: response is not valid JSON: ${raw.slice(0, 200)}`);
  }
};

/**
 * Chat completion that expects a JSON reply. Adds a system nudge so the model
 * returns only JSON, then parses defensively.
 */
export const coachioChatJSON = async <T>(
  apiKey: string,
  userPrompt: string,
  opts: CoachioChatOptions = {},
): Promise<T> => {
  const systemNudge =
    "You are a strict JSON generator. Output ONLY valid JSON matching the requested schema — no prose, no markdown fences, no commentary. Start your reply with '[' or '{' and end with the matching closing bracket.";
  const system = opts.system ? `${opts.system}\n\n${systemNudge}` : systemNudge;
  const raw = await coachioChat(apiKey, userPrompt, { ...opts, system });
  return extractJSON<T>(raw);
};

/**
 * High-level helper: submit, poll, and convert the first result to a data URL.
 */
export const generateImageWithCoachio = async (params: {
  apiKey: string;
  prompt: string;
  aspectRatio: "16:9" | "9:16";
  imagesUrl?: string[];
}): Promise<string> => {
  if (!params.apiKey) throw new Error("Coachio API key is missing");
  const taskId = await submitImageTask({
    apiKey: params.apiKey,
    prompt: params.prompt,
    aspectRatio: mapAspectRatio(params.aspectRatio),
    resolution: "1k",
    imagesUrl: params.imagesUrl,
  });
  const urls = await pollTaskStatus(params.apiKey, taskId);
  return await fetchAsDataUrl(urls[0]);
};

// ---------------------------------------------------------------------------
// Audio (text-to-speech) via Coachio + ElevenLabs
// ---------------------------------------------------------------------------

/** Built-in voice ids for the elevenlabs_text_to_speech_v2 model. */
export const COACHIO_VOICES = [
  { id: "UgBBYS2sOqTuMpoF3BR0", label: "Mark (EN)", language: "English" },
  { id: "kPzsL2i3teMYv0FxEYQ6", label: "Brittney (EN)", language: "English" },
] as const;

export type CoachioVoiceId = (typeof COACHIO_VOICES)[number]["id"];

interface SubmitAudioOptions {
  apiKey: string;
  text: string;
  voice: string;
  stability?: number;
  similarityBoost?: number;
  style?: number;
  speed?: number;
}

/** Submit a TTS task to Coachio. Returns task_id. */
export const submitAudioTask = async (
  opts: SubmitAudioOptions,
): Promise<string> => {
  const body = {
    task_type: "audio",
    prompt: opts.text,
    ai_model_config: {
      model_identifier: "elevenlabs_text_to_speech_v2",
      generation_mode: "standard",
      aspect_ratio: "16:9",
      tts_voice: opts.voice,
      tts_text: opts.text,
      similarity_boost: opts.similarityBoost ?? 0.75,
      tts_style: opts.style ?? 0,
      speed: opts.speed ?? 1,
      stability: opts.stability ?? 0.5,
    },
  };

  const res = await fetch(`${COACHIO_BASE}/task/submit`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-API-Key": opts.apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Coachio audio submit failed (${res.status}): ${text}`);
  }
  const data: SubmitTaskResponse = await res.json();
  if (!data.task_id) throw new Error("Coachio audio submit: missing task_id");
  return data.task_id;
};

/**
 * High-level helper: submit a TTS task, poll, fetch the result, and return a
 * Blob ready to drop into an <audio> element or zip up for export.
 */
export const generateAudioWithCoachio = async (params: {
  apiKey: string;
  text: string;
  voice: string;
  stability?: number;
  similarityBoost?: number;
  style?: number;
  speed?: number;
}): Promise<Blob> => {
  if (!params.apiKey) throw new Error("Coachio API key is missing");
  if (!params.text?.trim()) throw new Error("Coachio audio: empty text");

  const taskId = await submitAudioTask(params);
  const urls = await pollTaskStatus(params.apiKey, taskId);
  const res = await fetch(urls[0]);
  if (!res.ok) throw new Error(`Failed to fetch audio result: ${res.status}`);
  return await res.blob();
};
