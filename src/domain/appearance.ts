/**
 * المظهر والكتابة — نقطة واحدة تُطبّق اختيارات المستخدم على المستند كله.
 *
 * لا تُكتب أي ألوان هنا ولا في المكوّنات: تُضبط سمات `data-*` على عنصر الجذر،
 * ورموز CSS في `index.css` تتكفّل بالباقي فيتغيّر التطبيق كله معًا.
 *
 *   data-theme  = light | dark | system   → يضيف/يزيل الصنف `dark`
 *   data-text   = normal | strong | max   → قوة الكتابة (درجات الرمادي الباهتة)
 *   data-accent = brand | teal | violet | amber → لون التمييز
 *   data-font   = sm | md | lg | xl       → حجم الكتابة العام
 *
 * وضع «حسب الجهاز» يبقى متابعًا لتغيّر وضع الجهاز لحظيًا (بلا إعادة تشغيل).
 */
import type { AccentColor, FontSize, TextStrength, Theme } from "./types";

export interface Appearance {
  theme: Theme;
  textStrength: TextStrength;
  accent: AccentColor;
  fontSize: FontSize;
}

/** الافتراضي: فاتح، كتابة عادية، لون الهوية، حجم متوسط */
export const APPEARANCE_DEFAULTS: Appearance = {
  theme: "light",
  textStrength: "normal",
  accent: "brand",
  fontSize: "md",
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
  el.dataset.text = appearance.textStrength;
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

/** تسميات عربية للاستخدام في الواجهة والرسائل */
export const APPEARANCE_LABELS = {
  theme: { light: "فاتح", dark: "داكن", system: "حسب الجهاز" } as Record<Theme, string>,
  textStrength: { normal: "عادي", strong: "قوي", max: "قوي جدًا" } as Record<TextStrength, string>,
  accent: { brand: "كحلي", teal: "أخضر مزرق", violet: "بنفسجي", amber: "برتقالي" } as Record<
    AccentColor,
    string
  >,
  fontSize: { sm: "صغير", md: "عادي", lg: "كبير", xl: "أكبر" } as Record<FontSize, string>,
};
