/**
 * المظهر والكتابة — نقطة واحدة تُطبّق اختيارات المستخدم على المستند كله.
 *
 * لا تُكتب أي ألوان داخل المكوّنات: تُضبط سمات `data-*` على عنصر الجذر،
 * ورموز CSS في `index.css` تتكفّل بالباقي فيتغيّر التطبيق كله معًا.
 *
 *   data-theme  = light | dark | system        → يضيف/يزيل الصنف `dark`
 *   data-text   = auto | strong | max | black | blue | white → لون الكتابة وقوّتها
 *   data-bg     = navy | sky | green | violet | sand         → لون خلفية التطبيق
 *   data-accent = brand | teal | violet | amber              → لون التمييز
 *   data-font   = sm | md | lg | xl                          → حجم الكتابة
 *
 * وضع «حسب الجهاز» يبقى متابعًا لتغيّر وضع الجهاز لحظيًا (بلا إعادة تشغيل).
 */
import type { AccentColor, BackgroundTone, FontSize, TextStyle, Theme } from "./types";

export interface Appearance {
  theme: Theme;
  textStyle: TextStyle;
  background: BackgroundTone;
  accent: AccentColor;
  fontSize: FontSize;
}

const TEXT_STYLES: readonly TextStyle[] = ["auto", "strong", "max", "black", "blue", "white"];
const BACKGROUNDS: readonly BackgroundTone[] = ["navy", "sky", "green", "violet", "sand"];

/** الافتراضي: فاتح، كتابة كما صُمّم التطبيق، خلفية كحلية، لون الهوية، حجم متوسط */
export const APPEARANCE_DEFAULTS: Appearance = {
  theme: "light",
  textStyle: "auto",
  background: "navy",
  accent: "brand",
  fontSize: "md",
};

/** لون كل اختيار خلفية كما يظهر في المربّع الصغير بالواجهة */
export const BACKGROUND_SWATCH: Record<BackgroundTone, string> = {
  navy: "#0d4270",
  sky: "#2a9bd8",
  green: "#1f9d76",
  violet: "#7a5af0",
  sand: "#c9b183",
};

/** تسميات عربية للاستخدام في الواجهة والرسائل */
export const APPEARANCE_LABELS = {
  theme: { light: "فاتح", dark: "داكن", system: "حسب الجهاز" } as Record<Theme, string>,
  textStyle: {
    auto: "تلقائي",
    strong: "قوي",
    max: "قوي جدًا",
    black: "أسود",
    blue: "أزرق",
    white: "أبيض",
  } as Record<TextStyle, string>,
  background: {
    navy: "أزرق كحلي",
    sky: "سماوي فاتح",
    green: "أخضر هادئ",
    violet: "بنفسجي ناعم",
    sand: "رملي دافئ",
  } as Record<BackgroundTone, string>,
  accent: { brand: "كحلي", teal: "أخضر مزرق", violet: "بنفسجي", amber: "برتقالي" } as Record<
    AccentColor,
    string
  >,
  fontSize: { sm: "صغير", md: "عادي", lg: "كبير", xl: "أكبر" } as Record<FontSize, string>,
};

const DARK_QUERY = "(prefers-color-scheme: dark)";

/** هل الجهاز في الوضع الليلي الآن؟ */
export function systemPrefersDark(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia(DARK_QUERY).matches;
}

/** هل نعرض الوضع الداكن فعلًا؟ (مع احتساب خيار «حسب الجهاز») */
export function resolveDark(theme: Theme): boolean {
  return theme === "dark" || (theme === "system" && systemPrefersDark());
}

/** يطبّق الاختيارات على عنصر الجذر — فتتغيّر الواجهة كلها عبر رموز CSS */
export function applyAppearance(appearance: Appearance, root?: HTMLElement): void {
  if (typeof document === "undefined") return;
  const el = root ?? document.documentElement;
  el.classList.toggle("dark", resolveDark(appearance.theme));
  el.dataset.theme = appearance.theme;
  el.dataset.text = appearance.textStyle;
  el.dataset.bg = appearance.background;
  el.dataset.accent = appearance.accent;
  el.dataset.font = appearance.fontSize;
}

/** مراقبة تغيّر وضع الجهاز — يُستدعى فقط حين يكون الاختيار «حسب الجهاز» */
export function watchSystemTheme(onChange: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  const query = window.matchMedia(DARK_QUERY);
  const handler = () => onChange();
  query.addEventListener("change", handler);
  return () => query.removeEventListener("change", handler);
}

/**
 * تنبيه لطيف عند تركيبة غير واضحة (كتابة بيضاء في الوضع الفاتح مثلًا)
 * مع اقتراح الوضع المناسب — والمستخدم يقرّر بزر واحد.
 */
export function textStyleHint(appearance: {
  textStyle: TextStyle;
  theme: Theme;
}): { message: string; fixLabel: string; suggestedTheme: Theme } | null {
  const dark = resolveDark(appearance.theme);
  if (appearance.textStyle === "white" && !dark) {
    return {
      message: "الكتابة البيضاء تحتاج خلفية غامقة: بدّل الوضع إلى الداكن أو اختر أسود/أزرق.",
      fixLabel: "بدّل إلى الوضع الداكن",
      suggestedTheme: "dark",
    };
  }
  if (appearance.textStyle === "black" && dark) {
    return {
      message: "الكتابة السوداء تحتاج خلفية فاتحة: بدّل الوضع إلى الفاتح أو اختر أبيض/أزرق.",
      fixLabel: "بدّل إلى الوضع الفاتح",
      suggestedTheme: "light",
    };
  }
  return null;
}

/* ------------------------- ترحيل الإعدادات القديمة ------------------------- */

/** يحوّل القيمة القديمة (قوة الكتابة) إلى الحقل الجديد بلا فقدان اختيار المستخدم */
export function normalizeTextStyle(raw: {
  textStyle?: unknown;
  textStrength?: unknown;
}): TextStyle {
  const style = raw.textStyle;
  if (typeof style === "string" && (TEXT_STYLES as readonly string[]).includes(style)) {
    return style as TextStyle;
  }
  if (raw.textStrength === "strong") return "strong";
  if (raw.textStrength === "max") return "max";
  return "auto";
}

/** لون الخلفية: أي قيمة غير معروفة تعود إلى الخلفية الكحلية الافتراضية */
export function normalizeBackground(raw: unknown): BackgroundTone {
  return typeof raw === "string" && (BACKGROUNDS as readonly string[]).includes(raw)
    ? (raw as BackgroundTone)
    : "navy";
}
