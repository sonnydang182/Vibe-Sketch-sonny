const COACHIO_BASE = "https://api.coachio.ai/api/v1";

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
