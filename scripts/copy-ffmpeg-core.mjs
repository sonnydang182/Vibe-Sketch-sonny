// Copies the ffmpeg-core ESM files from node_modules into public/ so Vite
// serves them from the same origin.
//
// IMPORTANT: must be ESM, not UMD. @ffmpeg/ffmpeg v0.12+ spawns the worker
// with `type: 'module'`, which means `importScripts` throws and the wrapper
// falls through to `await import(coreURL)`. Importing UMD content via
// dynamic import() fails silently — the worker never reports back and
// load() hangs until our 60s timeout. ESM core has `export default
// createFFmpegCore`, which is exactly what the wrapper expects.
//
// Runs on postinstall + can be run manually with `node scripts/copy-ffmpeg-core.mjs`.

import { mkdirSync, copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

// ---------- Core (ESM dist) ----------
const coreSrc = resolve(root, 'node_modules/@ffmpeg/core/dist/esm');
const coreDst = resolve(root, 'public/ffmpeg-core');

if (!existsSync(coreSrc)) {
  console.warn('[copy-ffmpeg-core] @ffmpeg/core not installed yet — skipping.');
  process.exit(0);
}
mkdirSync(coreDst, { recursive: true });
for (const file of ['ffmpeg-core.js', 'ffmpeg-core.wasm']) {
  copyFileSync(resolve(coreSrc, file), resolve(coreDst, file));
  console.log(`[copy-ffmpeg-core] ${file} → public/ffmpeg-core/`);
}

// ---------- Wrapper worker (worker.js + const.js + errors.js) ----------
// Hosting the wrapper's worker ourselves bypasses two Vite quirks:
//   1. `new URL('./worker.js', import.meta.url)` inside a node_modules dep
//      resolves to a path Vite serves as index.html (text/html), so the
//      module worker dies before it ever runs.
//   2. Even with `?worker&url`, Vite's transform rewrites the worker's
//      dynamic `import(coreURL)` to `import(coreURL + '?import')`, and
//      our public/ static file at that querystring returns the SPA HTML
//      fallback. So `import()` blows up with "Failed to fetch dynamically
//      imported module".
//
// By copying the raw worker source into public/, Vite leaves it alone:
// the worker runs with its original `import(_coreURL)` and fetches the
// untransformed `/ffmpeg-core/ffmpeg-core.js` directly.
const wrapperSrc = resolve(root, 'node_modules/@ffmpeg/ffmpeg/dist/esm');
const wrapperDst = resolve(root, 'public/ffmpeg-wrapper');
if (existsSync(wrapperSrc)) {
  mkdirSync(wrapperDst, { recursive: true });
  for (const file of ['worker.js', 'const.js', 'errors.js']) {
    const from = resolve(wrapperSrc, file);
    if (existsSync(from)) {
      copyFileSync(from, resolve(wrapperDst, file));
      console.log(`[copy-ffmpeg-core] ${file} → public/ffmpeg-wrapper/`);
    }
  }

  // Strip TypeScript triple-slash refs from worker.js — the browser
  // won't break on them but they look noisy in DevTools.
  const workerPath = resolve(wrapperDst, 'worker.js');
  if (existsSync(workerPath)) {
    let body = readFileSync(workerPath, 'utf8');
    body = body.replace(/^\/\/\/ <reference[^\n]*\n/gm, '');
    writeFileSync(workerPath, body);
  }
}
