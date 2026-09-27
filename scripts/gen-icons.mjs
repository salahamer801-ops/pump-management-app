/**
 * شعار التطبيق وأيقوناته.
 *
 * المصدر: `brand/app-icon-source.png` (الشعار الرسمي بالحجم الكامل — لا يُنشر مع الموقع).
 * المشتقّات (تُنشر):
 *   public/brand/app-icon.webp        شعار الواجهة: شاشة البدء + الدخول + رؤوس الشاشات + الإعدادات
 *   public/icons/icon-192.png         أيقونة التطبيق (PWA)
 *   public/icons/icon-512.png         أيقونة التطبيق (PWA)
 *   public/icons/apple-touch-icon.png أيقونة آيفون
 *   public/icons/icon-512-maskable.png أيقونة أندرويد (الشعار داخل المنطقة الآمنة)
 *
 * عند تغيير الشعار: ضع الصورة الجديدة مكان `brand/app-icon-source.png` ثم:
 *     node scripts/gen-icons.mjs --from-brand
 * (يحتاج ImageMagick — يُستخدم عند إعداد الشعار فقط، لا في كل بناء).
 * الأيقونات الموجودة تبقى كما هي في البناء العادي فلا تُستبدل بغيرها.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { PNG } from "pngjs";
import { artworkBox } from "./artwork-box.mjs";

const SOURCE = "brand/app-icon-source.png";
const BRAND_OUT = "public/brand/app-icon.webp";
const ICONS = [
  "public/icons/icon-192.png",
  "public/icons/icon-512.png",
  "public/icons/apple-touch-icon.png",
  "public/icons/icon-512-maskable.png",
];
/** لون هوية التطبيق المستخرج من الشعار (الأزرق الكحلي) */
const BRAND_COLOR = "#032a4c";
/** نصف قطر زوايا الشعار في المصدر (نسبة من الضلع) — يُستخدم لقناع الزوايا */
const CORNER_RADIUS = 0.25;
const fromBrand = process.argv.includes("--from-brand");

function imageMagick() {
  for (const bin of ["magick", "convert"]) {
    try {
      execFileSync(bin, ["-version"], { stdio: "ignore" });
      return bin;
    } catch {
      /* جرّب الأمر التالي */
    }
  }
  return null;
}

function iconsFromBrand(bin) {
  if (!existsSync(SOURCE)) {
    console.error(`لا يوجد ملف شعار: ${SOURCE}`);
    process.exit(1);
  }
  mkdirSync("public/icons", { recursive: true });
  mkdirSync("public/brand", { recursive: true });
  const art = artworkBox(bin, SOURCE);
  if (!art) {
    console.error(`تعذّر تحديد مربّع الشعار داخل ${SOURCE}`);
    process.exit(1);
  }
  const box = `${art.side}x${art.side}+${art.x}+${art.y}`;
  const run = (...args) => execFileSync(bin, args, { stdio: "inherit" });
  const tmp = (name) => `${process.env.TMPDIR ?? "/tmp"}/${name}`;

  /**
   * يضع الشعار داخل مربّع بزوايا دائرية على خلفية هوية التطبيق،
   * فلا تظهر الزوايا البيضاء في أيقونة الجهاز.
   */
  const rounded = (out, size) => {
    const art = tmp(`brand-art-${size}.png`);
    run(SOURCE, "-crop", box, "+repage", "-resize", `${size}x${size}`, "-strip", art);
    const radius = Math.round(size * CORNER_RADIUS);
    run("-size", `${size}x${size}`, "xc:black", "-fill", "white", "-draw",
      `roundrectangle 0,0,${size - 1},${size - 1},${radius},${radius}`, tmp(`brand-mask-${size}.png`));
    run(art, "-alpha", "set", tmp(`brand-mask-${size}.png`), "-compose", "CopyOpacity", "-composite",
      "-compose", "Over", "-background", BRAND_COLOR, "-flatten", "-depth", "8", "-strip", out);
  };

  /* شعار الواجهة (شاشة البدء والدخول والرؤوس والإعدادات) */
  rounded(tmp("brand-ui.png"), 512);
  run(tmp("brand-ui.png"), "-quality", "88", BRAND_OUT);

  /* أيقونات التطبيق */
  for (const [out, size] of [
    ["public/icons/icon-512.png", 512],
    ["public/icons/icon-192.png", 192],
    ["public/icons/apple-touch-icon.png", 180],
  ]) rounded(out, size);

  /* أيقونة أندرويد التكيّفية: الشعار داخل المنطقة الآمنة (74%) على خلفية الهوية */
  run(SOURCE, "-crop", box, "+repage", "-resize", "380x380", "-strip", tmp("brand-art-maskable.png"));
  run("-size", "380x380", "xc:black", "-fill", "white", "-draw",
    "roundrectangle 0,0,379,379,95,95", tmp("brand-mask-maskable.png"));
  run(tmp("brand-art-maskable.png"), "-alpha", "set", tmp("brand-mask-maskable.png"),
    "-compose", "CopyOpacity", "-composite", "-strip", tmp("brand-maskable.png"));
  run("-size", "512x512", `xc:${BRAND_COLOR}`, tmp("brand-maskable.png"), "-gravity", "center",
    "-composite", "-depth", "8", "-strip", "public/icons/icon-512-maskable.png");

  console.log("الشعار وأيقونات التطبيق: تم");
}

/** أيقونة قطرة خضراء احتياطية (إن غاب الشعار وImageMagick) */
function proceduralIcon(size) {
  const png = new PNG({ width: size, height: size });
  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.42;
  const circleR = r * 0.62;
  const circleCy = cy - r * 0.22;
  const apexY = cy + r * 0.95;
  const baseY = cy + r * 0.05;
  const baseHalf = r * 0.72;
  const dist = (x1, y1, x2, y2) => Math.hypot(x1 - x2, y1 - y2);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (size * y + x) << 2;
      const corner = size * 0.18;
      const inBg =
        x < corner
          ? y < corner
            ? dist(x, y, corner, corner) < corner
            : y > size - corner
              ? dist(x, y, corner, size - corner) < corner
              : true
          : x > size - corner
            ? y < corner
              ? dist(x, y, size - corner, corner) < corner
              : y > size - corner
                ? dist(x, y, size - corner, size - corner) < corner
                : true
            : true;
      const t = y / size;
      const inDrop =
        dist(x, y, cx, circleCy) <= circleR ||
        (x >= cx - baseHalf &&
          x <= cx + baseHalf &&
          y >= baseY &&
          y <= apexY &&
          Math.abs(x - cx) <= baseHalf * (1 - (y - baseY) / (apexY - baseY)));
      if (inBg) {
        const white = inDrop;
        /* تدرّج أزرق من الأعلى (فاتح) إلى الأسفل (كحلي) */
        png.data[idx] = white ? 255 : Math.round(6 + (3 - 6) * t);
        png.data[idx + 1] = white ? 255 : Math.round(58 + (42 - 58) * t);
        png.data[idx + 2] = white ? 255 : Math.round(108 + (76 - 108) * t);
        png.data[idx + 3] = 255;
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

mkdirSync("public/icons", { recursive: true });
mkdirSync("public/brand", { recursive: true });

const bin = imageMagick();

if (fromBrand && bin) {
  iconsFromBrand(bin);
} else if (ICONS.every((file) => existsSync(file)) && existsSync(BRAND_OUT)) {
  console.log("شعار التطبيق وأيقوناته موجودة — لا تغيير");
} else if (bin && existsSync(SOURCE)) {
  iconsFromBrand(bin);
} else {
  writeFileSync("public/icons/icon-192.png", proceduralIcon(192));
  writeFileSync("public/icons/icon-512.png", proceduralIcon(512));
  writeFileSync("public/icons/apple-touch-icon.png", proceduralIcon(180));
  writeFileSync("public/icons/icon-512-maskable.png", proceduralIcon(512));
  console.log("أيقونات احتياطية: تم");
}
