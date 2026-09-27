import {
  useEffect,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { X } from "lucide-react";

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

/* ------------------------------- Button ------------------------------- */

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "outline";

export function Button({
  variant = "primary",
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-bold transition active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none select-none";
  const variants: Record<ButtonVariant, string> = {
    primary:
      "bg-gradient-to-l from-emerald-600 to-emerald-500 text-white shadow-md shadow-emerald-600/20 hover:from-emerald-700 hover:to-emerald-600",
    secondary:
      "bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100",
    outline:
      "bg-white text-gray-700 border border-gray-200 hover:border-emerald-300 hover:text-emerald-700",
    ghost: "bg-transparent text-gray-600 hover:bg-gray-100",
    danger: "bg-red-50 text-red-600 border border-red-200 hover:bg-red-100",
  };
  return (
    <button className={cx(base, variants[variant], className)} {...props}>
      {children}
    </button>
  );
}

/* -------------------------------- Card -------------------------------- */

export function Card({
  children,
  className,
  ...rest
}: { children: ReactNode; className?: string } & HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cx(
        "rounded-3xl bg-white border border-gray-100 shadow-sm shadow-gray-100/60 dark:bg-slate-800 dark:border-slate-700 dark:shadow-none",
        className
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

/* ------------------------------ Form field ---------------------------- */

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-bold text-gray-700 dark:text-slate-200">
        {label}
      </span>
      {children}
      {hint ? <span className="mt-1 block text-xs text-gray-400 dark:text-slate-400">{hint}</span> : null}
    </label>
  );
}

const inputBase =
  "w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-emerald-400 focus:bg-white focus:ring-4 focus:ring-emerald-100 dark:border-slate-600 dark:bg-slate-700 dark:text-white dark:placeholder:text-slate-400 dark:focus:bg-slate-700 dark:focus:ring-emerald-900/40";

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={cx(inputBase, props.className)} />;
}

/**
 * حقل رقمي:
 * - الصفر يعني «لا قيمة» فلا يُعرض داخل المربع (يظهر كتلميح باهت) حتى يكتب المستخدم قيمته مباشرة.
 * - عند الضغط على المربع يُحدَّد ما فيه، فتُستبدل القيمة بالكتابة بدل حذفها يدويًا.
 */
export function NumberInput({
  placeholder,
  value,
  onFocus,
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  const hasValue = value !== undefined && value !== null && value !== "";
  const numeric = Number(value);
  const showEmpty = hasValue && (numeric === 0 || Number.isNaN(numeric));
  return (
    <input
      type="number"
      inputMode="decimal"
      dir="ltr"
      placeholder={placeholder ?? (hasValue ? "0" : undefined)}
      {...props}
      value={showEmpty ? "" : value}
      onFocus={(e) => {
        e.currentTarget.select();
        onFocus?.(e);
      }}
      className={cx(inputBase, "text-left", props.className)}
    />
  );
}

export function TimeInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type="time"
      dir="ltr"
      {...props}
      className={cx(inputBase, "text-left", props.className)}
    />
  );
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} className={cx(inputBase, "appearance-none", props.className)} />
  );
}

export function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea rows={3} {...props} className={cx(inputBase, props.className)} />;
}

/* ------------------------------- Status pill -------------------------- */

export type PillTone = "green" | "amber" | "red" | "gray" | "blue";

const pillTones: Record<PillTone, string> = {
  green: "bg-emerald-50 text-emerald-700 border-emerald-200",
  amber: "bg-amber-50 text-amber-700 border-amber-200",
  red: "bg-red-50 text-red-600 border-red-200",
  gray: "bg-gray-50 text-gray-500 border-gray-200",
  blue: "bg-sky-50 text-sky-700 border-sky-200",
};

export function Pill({
  tone = "gray",
  children,
  className,
}: {
  tone?: PillTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-bold",
        pillTones[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

/* -------------------------------- Modal ------------------------------- */

export function Modal({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative z-10 max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl animate-fade-up dark:bg-slate-800">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-extrabold text-gray-900 dark:text-white">{title}</h3>
          <button
            onClick={onClose}
            className="rounded-full p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            aria-label="إغلاق"
          >
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/* ----------------------------- Empty state ---------------------------- */

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-gray-200 bg-white/70 px-6 py-12 text-center dark:border-slate-700 dark:bg-slate-800/60">
      <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-300">
        {icon}
      </div>
      <p className="text-base font-extrabold text-gray-800 dark:text-white">{title}</p>
      {description ? (
        <p className="mt-1 max-w-xs text-sm text-gray-500 dark:text-slate-400">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

/* ------------------------------ Stat card ----------------------------- */

export function StatCard({
  label,
  value,
  tone = "green",
  hint,
  icon,
}: {
  label: string;
  value: ReactNode;
  tone?: PillTone;
  hint?: string;
  icon?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-400 dark:text-slate-400">
        {icon ? <span className="text-emerald-500">{icon}</span> : null}
        {label}
      </div>
      <div
        className={cx(
          "mt-1 text-lg font-extrabold",
          tone === "green" && "text-emerald-700 dark:text-emerald-400",
          tone === "amber" && "text-amber-600 dark:text-amber-400",
          tone === "red" && "text-red-600 dark:text-red-400",
          tone === "gray" && "text-gray-800 dark:text-white",
          tone === "blue" && "text-sky-700 dark:text-sky-400"
        )}
      >
        {value}
      </div>
      {hint ? <div className="mt-0.5 text-xs text-gray-400 dark:text-slate-400">{hint}</div> : null}
    </div>
  );
}
