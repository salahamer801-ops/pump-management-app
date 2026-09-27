import { PNG } from "pngjs";
import { mkdirSync, writeFileSync } from "node:fs";

function createIcon(size) {
  const png = new PNG({ width: size, height: size });
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.42;

  // Drop shape parameters (relative to center)
  const circleR = r * 0.62;
  const circleCy = cy - r * 0.22;
  const apexY = cy + r * 0.95;
  const baseY = cy + r * 0.05;
  const baseHalf = r * 0.72;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (size * y + x) << 2;

      // Rounded-square background
      const corner = size * 0.18;
      const inBg =
        x >= 0 && y >= 0 &&
        (x < corner ? (y < corner ? dist(x, y, corner, corner) < corner : y > size - corner ? dist(x, y, corner, size - corner) < corner : true) :
         x > size - corner ? (y < corner ? dist(x, y, size - corner, corner) < corner : y > size - corner ? dist(x, y, size - corner, size - corner) < corner : true) :
         true);

      let bg = inBg;
      // gradient from top (emerald-500 #10b981) to bottom (emerald-700 #047857)
      const t = y / size;
      const g = [16, 185, 129, 4, 120, 87];
      const col = g.map((a, i) => a + (g[i + 3] - a) * t);
      const rr = Math.round(col[0]);
      const gg = Math.round(col[1]);
      const bb = Math.round(col[2]);

      // White droplet
      const inCircle = dist(x, y, cx, circleCy) <= circleR;
      const inTri = x >= cx - baseHalf && x <= cx + baseHalf && y >= baseY && y <= apexY &&
        Math.abs(x - cx) <= baseHalf * (1 - (y - baseY) / (apexY - baseY));
      const inDrop = inCircle || inTri;

      if (bg) {
        if (inDrop) {
          png.data[idx] = 255;
          png.data[idx + 1] = 255;
          png.data[idx + 2] = 255;
          png.data[idx + 3] = 255;
        } else {
          png.data[idx] = rr;
          png.data[idx + 1] = gg;
          png.data[idx + 2] = bb;
          png.data[idx + 3] = 255;
        }
      } else {
        png.data[idx] = 0;
        png.data[idx + 1] = 0;
        png.data[idx + 2] = 0;
        png.data[idx + 3] = 0;
      }
    }
  }
  return PNG.sync.write(png);
}

function dist(x1, y1, x2, y2) {
  const dx = x1 - x2;
  const dy = y1 - y2;
  return Math.sqrt(dx * dx + dy * dy);
}

mkdirSync("public/icons", { recursive: true });
writeFileSync("public/icons/icon-192.png", createIcon(192));
writeFileSync("public/icons/icon-512.png", createIcon(512));
writeFileSync("public/icons/icon-512-maskable.png", createIcon(512));
console.log("icons generated");
