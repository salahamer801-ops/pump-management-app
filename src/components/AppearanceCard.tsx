/**
 * بطاقة «المظهر والكتابة» — خيارات المستخدم للألوان وحجم الخط:
 *   ١) الوضع: فاتح · داكن · حسب الجهاز (يتبع وضع الجوال تلقائيًا بلا تضارب)
 *   ٢) لون خلفية التطبيق: خمس عائلات ألوان متناسقة، شفافة قليلًا فتتمازج الطبقات
 *   ٣) لون الكتابة وقوّتها: تلقائي · قوي · قوي جدًا · أسود · أزرق · أبيض
 *   ٤) حجم الكتابة: صغير · عادي · كبير · أكبر
 *   ٥) لون التمييز (الأزرار والعناصر الفعّالة): كحلي · أخضر مزرق · بنفسجي · برتقالي
 *
 * المكوّن يعرض الاختيارات فقط ويبلّغ عنها؛ التطبيق على المستند يتم في
 * `domain/appearance.ts` عبر سمات data-* ورموز CSS في index.css.
 */
import { useState } from "react";
import { AlertTriangle, Contrast, Droplet, Moon, Palette, Smartphone, Sun, Type } from "lucide-react";
import { Card, cx } from "./ui";
import {
  APPEARANCE_LABELS as L,
  BACKGROUND_SWATCH,
  resolveDark,
  textStyleHint,
  type Appearance,
} from "../domain/appearance";

export type AppearanceValue = Appearance;

/** لون كل اختيار تمييز كما يظهر في المربّع الصغير (تعريف الاختيار نفسه) */
const ACCENT_SWATCH: Record<Appearance["accent"], string> = {
  brand: "#032a4c",
  teal: "#0f5f57",
  violet: "#6d28d9",
  amber: "#b45309",
};

const THEME_ICON: Record<Appearance["theme"], React.ReactNode> = {
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
  /* ملاحظة مؤقتة تُعرض بعد ضبط الوضع تلقائيًا لتناسب لون الكتابة */
  const [note, setNote] = useState("");
  const hint = textStyleHint({ textStyle: value.textStyle, theme: value.theme });

  const pickTextStyle = (style: Appearance["textStyle"]) => {
    const patch: Partial<AppearanceValue> = { textStyle: style };
    const dark = resolveDark(value.theme);
    if (style === "white" && !dark) {
      patch.theme = "dark";
      setNote(t("اخترنا الوضع الداكن تلقائيًا لتظهر الكتابة البيضاء بوضوح.", "Dark mode enabled for white text."));
    } else if (style === "black" && dark) {
      patch.theme = "light";
      setNote(t("اخترنا الوضع الفاتح تلقائيًا لتظهر الكتابة السوداء بوضوح.", "Light mode enabled for black text."));
    } else {
      setNote("");
    }
    onChange(patch);
  };

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
          "اختر لون الخلفية ولون الكتابة وحجم الخط كما يناسب جهازك — التغيير يظهر فورًا في كل الشاشات، وإن كانت كتابة أجهزتك باهتة فاختر «قوي» أو «قوي جدًا».",
          "Pick background, text colour and size to suit your device."
        )}
      </p>

      <Row testid="appearance-theme" icon={<Sun size={14} />} label={t("الوضع", "Theme")}>
        {(["light", "dark", "system"] as const).map((mode) => (
          <Chip
            key={mode}
            active={value.theme === mode}
            onClick={() => {
              setNote("");
              onChange({ theme: mode });
            }}
            testid={`appearance-theme-${mode}`}
          >
            {THEME_ICON[mode]}
            {t(L.theme[mode], mode)}
          </Chip>
        ))}
      </Row>

      <Row
        testid="appearance-background"
        icon={<Droplet size={14} />}
        label={t("لون خلفية التطبيق", "App background")}
        hint={t("درجات متناسقة مع شفافية خفيفة", "Matching tones, slightly transparent")}
      >
        {(["navy", "sky", "green", "violet", "sand"] as const).map((tone) => (
          <Chip
            key={tone}
            active={value.background === tone}
            onClick={() => onChange({ background: tone })}
            testid={`appearance-bg-${tone}`}
          >
            <span
              aria-hidden="true"
              className="h-3 w-3 shrink-0 rounded-full ring-1 ring-black/10"
              style={{ backgroundColor: BACKGROUND_SWATCH[tone] }}
            />
            {t(L.background[tone], tone)}
          </Chip>
        ))}
      </Row>

      <Row
        testid="appearance-text"
        icon={<Contrast size={14} />}
        label={t("لون الكتابة وقوّتها", "Text colour and strength")}
        hint={t("قوي/قوي جدًا = أوضح للشاشات الباهتة", "strong = clearer on dull screens")}
      >
        {(["auto", "strong", "max", "black", "blue", "white"] as const).map((style) => (
          <Chip
            key={style}
            active={value.textStyle === style}
            onClick={() => pickTextStyle(style)}
            testid={`appearance-text-${style}`}
          >
            {t(L.textStyle[style], style)}
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

      {note ? (
        <p
          className="flex items-start gap-2 rounded-2xl bg-brand-50 px-3 py-2 text-[11px] leading-relaxed text-brand-800 dark:bg-brand-900/30 dark:text-brand-100"
          data-testid="appearance-note"
        >
          {note}
        </p>
      ) : null}

      {hint ? (
        <div
          className="space-y-2 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-900 dark:border-amber-700/60 dark:bg-amber-900/25 dark:text-amber-100"
          data-testid="appearance-hint"
        >
          <span className="flex items-start gap-2">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" />
            {hint.message}
          </span>
          <button
            type="button"
            onClick={() => {
              setNote("");
              onChange({ theme: hint.suggestedTheme });
            }}
            data-testid="appearance-fix"
            className="rounded-xl border border-amber-400 bg-white px-2.5 py-1 font-bold text-amber-800 transition hover:bg-amber-100 dark:border-amber-600 dark:bg-amber-900/40 dark:text-amber-100"
          >
            {hint.fixLabel}
          </button>
        </div>
      ) : null}

      {/* معاينة فورية بنفس رموز الألوان المستخدمة في التطبيق */}
      <div
        className="rounded-2xl border border-gray-200 px-3 py-3 dark:border-slate-600"
        data-testid="appearance-preview"
      >
        <div className="text-[10px] font-bold text-gray-400 dark:text-slate-400">
          {t("معاينة", "Preview")}
        </div>
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
  hint,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  testid: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div data-testid={testid}>
      <div className="mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-bold text-gray-500 dark:text-slate-300">
        <span className="flex items-center gap-1.5">
          {icon}
          {label}
        </span>
        {hint ? <span className="font-normal text-gray-400 dark:text-slate-400">— {hint}</span> : null}
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
