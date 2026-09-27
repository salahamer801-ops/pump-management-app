/**
 * يحدّد مربّع الشعار داخل الصورة: يتجاهل الهوامش والخلفية الموحّدة
 * (صور الأيقونات المعروضة عادةً تأتي على خلفية فاتحة بظل خفيف).
 * يقرأ صفًّا وعمودًا من منتصف الصورة ويبحث عن أول بكسل يختلف عن لون الخلفية.
 */
import { execFileSync } from "node:child_process";

const TOLERANCE = Number(process.env.BRAND_TOLERANCE ?? 60); // مجموع فرق القنوات الذي يُعدّ اختلافًا عن الخلفية

function readPixels(bin, file, geometry) {
  const out = execFileSync(bin, [file, "-crop", geometry, "+repage", "-depth", "8", "txt:-"], {
    maxBuffer: 64 * 1024 * 1024,
  }).toString();
  const pixels = [];
  for (const line of out.split("\n")) {
    const m = line.match(/^(\d+),(\d+):\s*\((\d+)[,.]?(\d*)[,.]?(\d*)/);
    if (!m) continue;
    pixels.push([Number(m[3]), Number(m[4] || 0), Number(m[5] || 0)]);
  }
  return pixels;
}

export function artworkBox(bin, file) {
  const [w, h] = execFileSync(bin, ["-format", "%w %h", file + "[0]", "info:"])
    .toString()
    .trim()
    .split(/\s+/)
    .map((v) => parseInt(v, 10));
  if (!w || !h) return null;

  const row = readPixels(bin, file, `${w}x1+0+${Math.floor(h / 2)}`);
  const col = readPixels(bin, file, `1x${h}+${Math.floor(w / 2)}+0`);
  if (row.length < w || col.length < h) return null;

  /* لون الخلفية من أول بكسل في المنتصف */
  const bg = row[0];
  const differs = (p) =>
    Math.abs(p[0] - bg[0]) + Math.abs(p[1] - bg[1]) + Math.abs(p[2] - bg[2]) > TOLERANCE;

  const first = (arr) => arr.findIndex(differs);
  const last = (arr) => {
    for (let i = arr.length - 1; i >= 0; i--) if (differs(arr[i])) return i;
    return -1;
  };

  const left = first(row);
  const right = last(row);
  const top = first(col);
  const bottom = last(col);
  if (left < 0 || top < 0 || right <= left) return null;

  /* العرض أفقيًّا هو الأدقّ: حواف الصورة واضحة يمينًا ويسارًا،
     أما أعلى الشعار فقد يكون سماءً باهتة تشبه الخلفية. لذا نأخذ المربّع
     من العرض ونوسّطه رأسيًّا في الصورة (الشعارات المعروضة تكون في الوسط). */
  const side = Math.min(right - left + 1, w, h) - 4;
  const x = Math.max(0, Math.min(w - side, left + 2));
  const y = Math.max(0, Math.min(h - side, Math.round((h - side) / 2)));
  return { x, y, side };
}
