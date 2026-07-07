import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    // Local TTS (VieNeu Studio) target. Override via env VITE_LOCAL_TTS_TARGET
    // when the server runs on a different port or host.
    const localTtsTarget = env.VITE_LOCAL_TTS_TARGET || 'http://127.0.0.1:8001';
    return {
      server: {
        port: 5173,
        host: '0.0.0.0',
        // ffmpeg.wasm needs SharedArrayBuffer → requires cross-origin isolation.
        // Same headers must be sent in production hosting too.
        headers: {
          'Cross-Origin-Opener-Policy': 'same-origin',
          'Cross-Origin-Embedder-Policy': 'credentialless',
        },
        // Proxy Local TTS requests to VieNeu Studio so the browser sees
        // same-origin (no CORS preflight). Anything under /local-tts/* gets
        // rewritten to <target>/api/* (path prefix stripped).
        proxy: {
          '/local-tts': {
            target: localTtsTarget,
            changeOrigin: true,
            // /local-tts/api/health  →  <target>/api/health
            rewrite: (p: string) => p.replace(/^\/local-tts/, ''),
          },
        },
      },
      preview: {
        headers: {
          'Cross-Origin-Opener-Policy': 'same-origin',
          'Cross-Origin-Embedder-Policy': 'credentialless',
        },
      },
      plugins: [react()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
