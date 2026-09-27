/** عناصر مشتركة صغيرة للوحة مسؤول النظام */
import type { ReactNode } from "react";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { Card, Pill, cx } from "../components/ui";

export function ScreenHead({
  icon,
  title,
  subtitle,
  onRefresh,
  actions,
}: {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  onRefresh?: () => void;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-700 text-white shadow-md shadow-emerald-600/20">
          {icon}
        </span>
        <div>
          <h1 className="text-xl font-black tracking-tight text-gray-900 dark:text-white">{title}</h1>
          {subtitle ? (
            <p className="mt-0.5 text-[11px] font-bold text-gray-400 dark:text-slate-400">{subtitle}</p>
          ) : null}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {actions}
        {onRefresh ? (
          <button
            type="button"
            onClick={onRefresh}
            aria-label="تحديث البيانات"
            data-testid="admin-refresh"
            className="flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-2 text-[11px] font-bold text-gray-600 transition hover:bg-gray-200 dark:bg-slate-700 dark:text-slate-200"
          >
            <RefreshCw size={13} /> تحديث
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function ErrorNote({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      data-testid="admin-error"
      className="flex items-start gap-2 rounded-2xl border border-red-100 bg-red-50 px-3 py-2.5 text-[11px] font-bold text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300"
    >
      <AlertTriangle size={14} className="mt-0.5 shrink-0" />
      <span>{message}</span>
    </div>
  );
}

export function Loading({ label = "جارٍ التحميل…" }: { label?: string }) {
  return (
    <Card className="flex items-center justify-center gap-2 p-8 text-sm font-bold text-gray-400">
      <Loader2 size={16} className="animate-spin" /> {label}
    </Card>
  );
}

export function StatTile({
  label,
  value,
  hint,
  tone = "gray",
  testId,
}: {
  label: string;
  value: string | number;
  hint?: string;
  tone?: "gray" | "green" | "blue" | "amber" | "red";
  testId?: string;
}) {
  const tones = {
    gray: "bg-gray-50 text-gray-800 dark:bg-slate-700 dark:text-slate-100",
    green: "bg-emerald-50 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200",
    blue: "bg-sky-50 text-sky-800 dark:bg-sky-900/30 dark:text-sky-200",
    amber: "bg-amber-50 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200",
    red: "bg-red-50 text-red-800 dark:bg-red-900/30 dark:text-red-200",
  } as const;
  return (
    <div className={cx("rounded-2xl px-4 py-3", tones[tone])} data-testid={testId}>
      <div className="text-[10px] font-bold opacity-70">{label}</div>
      <div className="mt-0.5 text-xl font-black leading-tight">{value}</div>
      {hint ? <div className="mt-0.5 text-[10px] opacity-70">{hint}</div> : null}
    </div>
  );
}

export function SectionCard({
  title,
  hint,
  children,
  actions,
}: {
  title: string;
  hint?: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-sm font-extrabold text-gray-800 dark:text-white">{title}</h2>
        {hint ? <Pill tone="gray">{hint}</Pill> : null}
        {actions ? <div className="mr-auto flex items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </Card>
  );
}

export function FieldRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 text-[11px]">
      <span className="text-gray-400 dark:text-slate-400">{label}</span>
      <span className="font-bold text-gray-700 dark:text-slate-200">{value}</span>
    </div>
  );
}
