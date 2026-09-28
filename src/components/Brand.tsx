import { cx } from "./ui";

/**
 * شعار التطبيق — ملف واحد فقط: `public/brand/app-icon.webp`.
 * استبدال هذا الملف يغيّر أيقونة التطبيق (PWA) وشاشة الدخول وكل شعارات الواجهة.
 * ولون إطار الشعار المائي (`#0b6e8f`) يُنشأ في `scripts/gen-icons.mjs`
 * ويظهر حول الأيقونة وعلى شاشة البدء والدخول.
 */
export const BRAND_IMAGE = "/brand/app-icon.webp";
export const BRAND_NAME = "مشروع تنظيم المضخات";
export const BRAND_TAGLINE = "الديالات · الأدوار · الحصص · الحسابات";

/**
 * شعار مربّع بحجم محدَّد — يُستخدم في رؤوس الشاشات وبطاقات الترحيب.
 * يُعرض على شكل مربّع بزوايا دائرية فقط (بلا إطار ملوّن) حتى يظهر الشعار كما هو.
 */
export function BrandLogo({
  size = 40,
  className,
  decorativeBg = false,
  rounded = "rounded-2xl",
}: {
  size?: number;
  className?: string;
  /** يضع الشعار على خلفية بيضاء (للرؤوس الملوّنة) */
  decorativeBg?: boolean;
  rounded?: string;
}) {
  return (
    <span
      className={cx(
        "inline-flex shrink-0 items-center justify-center overflow-hidden",
        rounded,
        decorativeBg
          ? "bg-white p-1 shadow-sm ring-2 ring-cyan-300/70 ring-offset-1 ring-offset-white"
          : "shadow-md shadow-slate-900/20 ring-2 ring-cyan-300/70 ring-offset-1 ring-offset-slate-950/40",
        className
      )}
      style={{ width: size, height: size }}
    >
      <img
        src={BRAND_IMAGE}
        alt={BRAND_NAME}
        width={size}
        height={size}
        data-testid="brand-logo"
        className="h-full w-full object-contain"
        draggable={false}
      />
    </span>
  );
}

/** شعار كبير لشاشة الدخول — يملأ المساحة المخصّصة له */
export function BrandHero({ className }: { className?: string }) {
  return (
    <img
      src={BRAND_IMAGE}
      alt={BRAND_NAME}
      data-testid="brand-hero"
      className={cx(
        "h-40 w-40 rounded-[2rem] border-4 border-cyan-300/80 bg-[#0b6e8f] p-1 object-contain shadow-2xl shadow-cyan-950/60 ring-4 ring-cyan-300/15 ring-offset-2 ring-offset-[#04101f] sm:h-48 sm:w-48 lg:h-56 lg:w-56",
        className
      )}
      draggable={false}
    />
  );
}

/**
 * شاشة البدء: تظهر ممتلئة الشاشة أثناء التحقق من الجلسة عند تشغيل التطبيق.
 */
export function BrandSplash({ message = "جارٍ التحقق…" }: { message?: string }) {
  return (
    <div
      className="relative flex min-h-dvh w-full flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-sky-700 via-blue-900 to-slate-950 px-6 text-center text-white"
      data-testid="brand-splash"
    >
      <span className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-white/10 blur-2xl" />
      <span className="pointer-events-none absolute -bottom-20 -left-10 h-72 w-72 rounded-full bg-sky-400/20 blur-3xl" />
      <div className="rounded-[2.25rem] border-4 border-cyan-300/80 bg-[#0b6e8f] p-1 shadow-2xl shadow-cyan-950/60 ring-4 ring-cyan-300/15 ring-offset-2 ring-offset-[#04101f]">
        <img
          src={BRAND_IMAGE}
          alt={BRAND_NAME}
          className="h-28 w-28 animate-pulse rounded-[1.9rem] object-contain sm:h-32 sm:w-32"
          draggable={false}
        />
      </div>
      <h1 className="mt-6 text-2xl font-black sm:text-3xl">{BRAND_NAME}</h1>
      <p className="mt-2 text-sm font-bold text-sky-50/80">{BRAND_TAGLINE}</p>
      <p className="mt-8 text-xs font-bold text-white/70">{message}</p>
    </div>
  );
}
