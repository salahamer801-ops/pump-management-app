/**
 * بطاقة «المظهر والكتابة» — خيارات المستخدم للألوان وحجم الخط:
 *   ١) الوضع: فاتح · داكن · حسب الجهاز (يتبع وضع الجوال تلقائيًا بلا تضارب ألوان)
 *   ٢) لون التمييز: كحلي (الهوية) · أخضر مزرق · بنفسجي · برتقالي
 *   ٣) قوة الكتابة: عادي · قوي · قوي جدًا (يعالج الكتابة الباهتة على الشاشات الليلية)
 *   ٤) حجم الكتابة: صغير · عادي · كبير · أكبر
 *
 * المكوّن يعرض الاختيارات فقط ويبلّغ عنها؛ التطبيق على المستند يتم في
 * `domain/appearance.ts` عبر سمات data-* ورموز CSS في index.css.
 */
import { Contrast, Droplet, Moon, Palette, Smartphone, Sun, Type } from "lucide-react";
import { Card, cx } from "./ui";
import { APPEARANCE_LABELS as L } from "../domain/appearance";
import type { AccentColor, FontSize, TextStrength, Theme } from "../domain/types";

export interface AppearanceValue {
  theme: Theme;
  textStrength: TextStrength;
  accent: AccentColor;
  fontSize: FontSize;
}

/** لون كل اختيار كما يظهر في المربّع الصغير (تعريف الاختيار نفسه) */
const ACCENT_SWATCH: Record<AccentColor, string> = {
  brand: "#032a4c",
  teal: "#0f5f57",
  violet: "#6d28d9",
  amber: "#b45309",
};

const THEME_ICON: Record<Theme, React.ReactNode> = {
  light: <Sun size={14} />,
  dark: <Moon size={14} />,
  system: <Smartphone size={14} />,
};

export function AppearanceCard({
  value,
  onChange,
  t = (ar: string) => ar,
  className = "",
}: {
  value: AppearanceValue;
  onChange: (patch: Partial<AppearanceValue>) => void;
  /** دالة الترجمة في تطبيق المساهم (افتراضيًا: عربي فقط) */
  t?: (ar: string, en: string) => string;
  className?: string;
}) {
  return (
    <Card className={`space-y-4 p-4 ${className}`} data-testid="appearance-card">
      <div className="flex items-center gap-2">
        <Palette size={16} className="text-brand-700 dark:text-brand-300" />
        <h2 className="text-sm font-extrabold text-gray-800 dark:text-white">
          {t("المظهر والكتابة", "Appearance and text")}
        </h2>
      </div>
      <p className="text-[11px] leading-relaxed text-gray-500 dark:text-slate-300">
        {t(
          "اضبط الألوان وحجم الكتابة كما يناسب جهازك — إن كانت كتابة التطبيق باهتة على شاشتك، اختر «قوي» أو «قوي جدًا»، وإن كان جوالك في الوضع الليلي واخترت «فاتح» فسيبقى التطبيق فاتحًا بلا تضارب.",
          "Adjust colours and text size to suit your device."
        )}
      </p>

      <Row testid="appearance-theme" icon={<Sun size={14} />} label={t("الوضع", "Theme")}>
        {(["light", "dark", "system"] as const).map((mode) => (
          <Chip
            key={mode}
            active={value.theme === mode}
            onClick={() => onChange({ theme: mode })}
            testid={`appearance-theme-${mode}`}
          >
            {THEME_ICON[mode]}
            {t(L.theme[mode], mode)}
          </Chip>
        ))}
      </Row>

      <Row testid="appearance-strength" icon={<Contrast size={14} />} label={t("قوة الكتابة", "Text strength")}>
        {(["normal", "strong", "max"] as const).map((strength) => (
          <Chip
            key={strength}
            active={value.textStrength === strength}
            onClick={() => onChange({ textStrength: strength })}
            testid={`appearance-text-${strength}`}
          >
            {t(L.textStrength[strength], strength)}
          </Chip>
        ))}
      </Row>

      <Row testid="appearance-accent" icon={<Droplet size={14} />} label={t("لون التمييز", "Accent colour")}>
        {(["brand", "teal", "violet", "amber"] as const).map((accent) => (
          <Chip
            key={accent}
            active={value.accent === accent}
            onClick={() => onChange({ accent })}
            testid={`appearance-accent-${accent}`}
          >
            <span
              aria-hidden="true"
              className="h-3 w-3 shrink-0 rounded-full ring-1 ring-black/10"
              style={{ backgroundColor: ACCENT_SWATCH[accent] }}
            />
            {t(L.accent[accent], accent)}
          </Chip>
        ))}
      </Row>

      <Row testid="appearance-font" icon={<Type size={14} />} label={t("حجم الكتابة", "Text size")}>
        {(["sm", "md", "lg", "xl"] as const).map((size) => (
          <Chip
            key={size}
            active={value.fontSize === size}
            onClick={() => onChange({ fontSize: size })}
            testid={`appearance-font-${size}`}
          >
            {t(L.fontSize[size], size)}
          </Chip>
        ))}
      </Row>

      {/* معاينة فورية بنفس رموز الألوان المستخدمة في التطبيق */}
      <div
        className="rounded-2xl border border-gray-200 px-3 py-3 dark:border-slate-600"
        data-testid="appearance-preview"
      >
        <div className="text-[10px] font-bold text-gray-400 dark:text-slate-400">{t("معاينة", "Preview")}</div>
        <div className="mt-1 text-sm font-extrabold text-gray-800 dark:text-white">
          {t("عنوان كما في التطبيق", "Sample heading")}
        </div>
        <p className="mt-1 text-[11px] leading-relaxed text-gray-500 dark:text-slate-300">
          {t(
            "جملة توضيحية بألوان الكتابة الحالية — هكذا يظهر الكلام الثانوي والملاحظات في الشاشات.",
            "Secondary text sample."
          )}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <span className="rounded-xl bg-brand-700 px-3 py-1.5 text-[11px] font-bold text-white">
            {t("زر رئيسي", "Primary")}
          </span>
          <span className="rounded-xl border border-gray-300 px-3 py-1.5 text-[11px] font-bold text-gray-500 dark:border-slate-600 dark:text-slate-300">
            {t("زر ثانوي", "Secondary")}
          </span>
        </div>
      </div>

      <p className="text-[10px] text-gray-400 dark:text-slate-400">
        {t(
          "التغيير يُحفظ على جهازك ومع حسابك، ويظهر فورًا في كل الشاشات.",
          "Your choice is saved and applied immediately."
        )}
      </p>
    </Card>
  );
}

function Row({
  label,
  icon,
  testid,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  testid: string;
  children: React.ReactNode;
}) {
  return (
    <div data-testid={testid}>
      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-bold text-gray-500 dark:text-slate-300">
        {icon}
        {label}
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

function Chip({
  active,
  onClick,
  testid,
  children,
}: {
  active: boolean;
  onClick: () => void;
  testid: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      data-testid={testid}
      className={cx(
        "flex items-center gap-1.5 rounded-2xl border px-3 py-2 text-xs font-bold transition",
        active
          ? "border-brand-500 bg-brand-50 text-brand-700 dark:border-brand-400 dark:bg-brand-900/40 dark:text-brand-100"
          : "border-gray-200 text-gray-500 dark:border-slate-600 dark:text-slate-300"
      )}
    >
      {children}
    </button>
  );
}
