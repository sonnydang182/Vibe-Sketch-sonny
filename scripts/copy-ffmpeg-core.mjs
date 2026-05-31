// Copies the ffmpeg-core UMD files from node_modules into public/ so Vite
// serves them from the same origin (required: the wrapper's worker uses
// importScripts which won't accept ESM, and direct deep imports are blocked
// by @ffmpeg/core's exports map).
//
// Runs on postinstall + can be run manually with `node scripts/copy-ffmpeg-core.mjs`.

import { mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const src = resolve(root, 'node_modules/@ffmpeg/core/dist/umd');
const dst = resolve(root, 'public/ffmpeg-core');

if (!existsSync(src)) {
  console.warn('[copy-ffmpeg-core] @ffmpeg/core not installed yet — skipping.');
  process.exit(0);
}

mkdirSync(dst, { recursive: true });

for (const file of ['ffmpeg-core.js', 'ffmpeg-core.wasm']) {
  copyFileSync(resolve(src, file), resolve(dst, file));
  console.log(`[copy-ffmpeg-core] ${file} → public/ffmpeg-core/`);
}
