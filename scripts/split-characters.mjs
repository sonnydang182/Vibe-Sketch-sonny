// Split assets/source/characters_grid.png into 20 individual character tiles.
// - 4 columns × 5 rows = 20 tiles
// - Each tile has a number label ("1. Tò mò"...) at the top — we crop it out
//   so it doesn't pollute the AI reference.
// - Output: assets/characters/01-curious.png ... 20-gentle.png
//   plus a small 256px square padded version for use as AI reference.

import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "assets/source/characters_grid.png");
const OUT_DIR = path.join(ROOT, "assets/characters");

const COLS = 4;
const ROWS = 5;
// Fraction of each tile (vertical) occupied by the "N. Label" header.
const HEADER_FRACTION = 0.38;
// Small inner padding so we don't catch the cell border line.
const INSET_FRACTION = 0.04;
// Small bottom padding to drop cell border.
const BOTTOM_FRACTION = 0.04;

const NAMES = [
  "01-curious",        // 1. Tò mò
  "02-hyperactive",    // 2. Tăng động
  "03-sleepy",         // 3. Buồn ngủ
  "04-confident",      // 4. Tự tin
  "05-anxious",        // 5. Lo âu
  "06-mischievous",    // 6. Tinh quái
  "07-introvert",      // 7. Hướng nội
  "08-inventor",       // 8. Nhà phát minh
  "09-athlete",        // 9. Vận động viên
  "10-dreamer",        // 10. Mộng mơ
  "11-strict-teacher", // 11. Giáo viên khó tính
  "12-gamer",          // 12. Game thủ
  "13-cheerful",       // 13. Cực vui vẻ
  "14-overthinker",    // 14. Overthinking
  "15-detective",      // 15. Thám tử
  "16-artist",         // 16. Nghệ sĩ
  "17-leader",         // 17. Lãnh đạo
  "18-bookworm",       // 18. Học bá
  "19-dramatic",       // 19. Kịch tính
  "20-gentle",         // 20. Dịu dàng
];

await mkdir(OUT_DIR, { recursive: true });

const meta = await sharp(SRC).metadata();
const W = meta.width;
const H = meta.height;
if (!W || !H) throw new Error("Could not read source image dimensions");

const tileW = W / COLS;
const tileH = H / ROWS;

console.log(`Source: ${W}×${H}, tile: ${tileW}×${tileH}`);

let i = 0;
for (let row = 0; row < ROWS; row++) {
  for (let col = 0; col < COLS; col++) {
    const left = Math.round(col * tileW);
    const top = Math.round(row * tileH);
    const w = Math.round(tileW);
    const h = Math.round(tileH);

    // Inset to skip cell border
    const inset = Math.round(Math.min(w, h) * INSET_FRACTION);
    // Header crop (skip the "N. Label" text)
    const headerCrop = Math.round(h * HEADER_FRACTION);

    const bottomCrop = Math.round(h * BOTTOM_FRACTION);
    const cropLeft = left + inset;
    const cropTop = top + headerCrop;
    const cropW = w - inset * 2;
    const cropH = h - headerCrop - bottomCrop;

    const baseName = NAMES[i];
    const fullPath = path.join(OUT_DIR, `${baseName}.png`);
    const refPath = path.join(OUT_DIR, `${baseName}@ref.png`);

    // Full character tile — kept high quality for UI display.
    await sharp(SRC)
      .extract({ left: cropLeft, top: cropTop, width: cropW, height: cropH })
      .png({ compressionLevel: 9 })
      .toFile(fullPath);

    // 512×512 reference: trim blank borders, then pad to square on beige bg.
    const extractedBuf = await sharp(SRC)
      .extract({ left: cropLeft, top: cropTop, width: cropW, height: cropH })
      .toBuffer();
    let trimmedBuf;
    try {
      trimmedBuf = await sharp(extractedBuf)
        .trim({ background: { r: 0xfd, g: 0xf6, b: 0xe3 }, threshold: 30 })
        .toBuffer();
    } catch {
      trimmedBuf = extractedBuf; // trim found nothing; use as-is
    }
    await sharp(trimmedBuf)
      .resize({
        width: 460,
        height: 460,
        fit: "contain",
        background: { r: 0xfd, g: 0xf6, b: 0xe3, alpha: 1 },
      })
      .extend({
        top: 26, bottom: 26, left: 26, right: 26,
        background: { r: 0xfd, g: 0xf6, b: 0xe3, alpha: 1 },
      })
      .png({ compressionLevel: 9 })
      .toFile(refPath);

    console.log(`  ${baseName}: tile @ ${cropLeft},${cropTop} ${cropW}×${cropH}`);
    i++;
  }
}

console.log(`\nWrote ${i} tiles to ${path.relative(ROOT, OUT_DIR)}/`);
