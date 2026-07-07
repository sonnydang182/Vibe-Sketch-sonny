// VieNeu Studio — local Vietnamese TTS server (no API key required).
// Default URL: http://127.0.0.1:8001
//
// The server exposes:
//   GET  /api/health  → { status: { loaded: true/false, ... } }
//   GET  /api/voices  → { voices: [{ id, label }, ...] }
//   POST /api/tts     → WAV binary (Content-Type: audio/wav)
//   POST /api/conversation, GET /api/stream, POST /api/clone — not wired
//
// This module is deliberately thin — no persistent client state. Callers pass
// baseUrl explicitly so switching Settings takes effect immediately.

export const DEFAULT_LOCAL_TTS_URL = "http://127.0.0.1:8001";

/**
 * Same-origin path served by the Vite dev-server proxy (see vite.config.ts).
 * When the user's configured URL points at localhost / 127.0.0.1, we rewrite
 * the fetch through this proxy path — same-origin from the browser's POV, so
 * no CORS preflight, no need for the VieNeu server to send
 * Access-Control-Allow-Origin.
 */
const PROXY_PREFIX = "/local-tts";

export interface LocalTtsVoice {
  id: string;
  label: string;
}

export interface LocalTtsHealth {
  loaded: boolean;
  raw: unknown;
}

/**
 * Normalise the URL, then rewrite localhost origins to the Vite proxy path
 * so the browser calls same-origin. Non-localhost URLs are left alone —
 * user is on the hook for CORS in that case.
 */
const normalise = (url: string): string => {
  const raw = (url || DEFAULT_LOCAL_TTS_URL).replace(/\/+$/, "");
  // Only rewrite in a browser context (dev server) — during SSR / tests we
  // don't have a `window`.
  if (typeof window === "undefined") return raw;
  try {
    const parsed = new URL(raw);
    const isLocalhost = parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost";
    const sameOrigin = parsed.origin === window.location.origin;
    // If it's already same-origin, leave it alone. If it's localhost but a
    // different port than the dev server, route via the proxy.
    if (isLocalhost && !sameOrigin) return PROXY_PREFIX;
  } catch {
    /* not a valid URL — treat as an already-relative path (e.g. "/local-tts") */
  }
  return raw;
};

/**
 * Parse an error payload from the server. VieNeu returns
 * `{ "detail": "..." }` on non-200. We surface that string.
 */
const parseError = async (res: Response): Promise<string> => {
  try {
    const data = await res.json();
    if (data && typeof data.detail === "string") return data.detail;
    return `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
};

/**
 * Wrap fetch() with a friendlier error message. Browsers throw a bare
 * `TypeError: Failed to fetch` for both "server down" and "CORS blocked",
 * so we add the most likely cause based on the URL shape.
 */
const fetchWithHint = async (url: string, init?: RequestInit): Promise<Response> => {
  try {
    return await fetch(url, init);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Cross-origin call without proxy → surface CORS hint.
    const isProxy = url.startsWith(PROXY_PREFIX);
    if (!isProxy && /^https?:\/\//.test(url)) {
      throw new Error(
        `${msg}. Nếu bạn set URL = http://127.0.0.1:8001 và server không mở CORS, ` +
        `hãy để nguyên URL này — request sẽ tự đi qua Vite proxy (đã cấu hình). ` +
        `Nếu vẫn lỗi: kiểm tra server VieNeu đang chạy (curl ${url}/api/health).`,
      );
    }
    throw new Error(`${msg}. Kiểm tra server VieNeu chạy chưa + Vite proxy target đúng chưa.`);
  }
};

/**
 * Check whether the local TTS server is reachable and the model is loaded.
 * Returns loaded=false if reachable but not ready, throws on network error
 * (server not running / wrong URL / CORS).
 */
export const checkLocalTtsHealth = async (baseUrl: string): Promise<LocalTtsHealth> => {
  const res = await fetchWithHint(`${normalise(baseUrl)}/api/health`);
  if (!res.ok) throw new Error(`Health check failed: ${await parseError(res)}`);
  const data = await res.json();
  const loaded = Boolean(data?.status?.loaded);
  return { loaded, raw: data };
};

/**
 * List the voices exposed by /api/voices. Returns an empty array if the
 * server has no voices configured — callers should treat that as an error
 * upstream (nothing to pick).
 */
export const listLocalTtsVoices = async (baseUrl: string): Promise<LocalTtsVoice[]> => {
  const res = await fetchWithHint(`${normalise(baseUrl)}/api/voices`);
  if (!res.ok) throw new Error(`Voices fetch failed: ${await parseError(res)}`);
  const data = await res.json();
  const voices = Array.isArray(data?.voices) ? data.voices : [];
  return voices
    .filter((v: unknown): v is LocalTtsVoice =>
      Boolean(v && typeof (v as any).id === "string" && typeof (v as any).label === "string"),
    )
    .map((v: LocalTtsVoice) => ({ id: v.id, label: v.label }));
};

export interface LocalTtsRequest {
  /** Vietnamese text (with diacritics for natural pronunciation). */
  text: string;
  /** Voice id from /api/voices. Empty = server default. */
  voice?: string;
  /** Emotion tag, e.g. "natural", "happy", "sad". Defaults to "natural". */
  emotion?: string;
  /** Sampling temperature 0.1-1.5. Higher = more variance. Defaults to 0.8. */
  temperature?: number;
  /** top_k sampling. Defaults to 25. */
  top_k?: number;
}

/**
 * Call POST /api/tts and return the WAV audio as a Blob. Throws with the
 * server's `detail` message on non-200.
 */
export const generateLocalTts = async (
  baseUrl: string,
  req: LocalTtsRequest,
): Promise<Blob> => {
  if (!req.text?.trim()) throw new Error("Local TTS: empty text");
  const body: Record<string, unknown> = {
    text: req.text,
    emotion: req.emotion || "natural",
    temperature: req.temperature ?? 0.8,
    top_k: req.top_k ?? 25,
  };
  if (req.voice) body.voice = req.voice;

  const res = await fetchWithHint(`${normalise(baseUrl)}/api/tts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Local TTS failed: ${await parseError(res)}`);

  const blob = await res.blob();
  // Server returns audio/wav; some deployments omit the header — force type
  // so the <audio> element treats it correctly downstream.
  return blob.type ? blob : new Blob([blob], { type: "audio/wav" });
};
