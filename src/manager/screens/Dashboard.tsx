import { useMemo } from "react";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  CalendarCheck,
  CalendarClock,
  CalendarPlus,
  ChevronLeft,
  Coins,
  CreditCard,
  Droplets,
  Fuel,
  Gauge,
  Layers,
  Plus,
  RefreshCcw,
  Timer,
  TrendingUp,
  Users,
  Wrench,
} from "lucide-react";
import { useApp } from "../../store";
import type { ManagerTab } from "../ManagerApp";
import {
  activeShareholders,
  comparePerson,
  currentDialaDay,
  dayEntries,
  dayNumberInRound,
  dayOrdinal,
  daySummary,
  dialaDayLabel,
  debtors,
  nextDialaDay,
  openIssues,
  personName,
  pumpFinancials,
  pumpWindow,
  dayTurnRows,
  type DayTurnRow,
  roundOfDay,
  scheduleRows,
  totalUnits,
} from "../../domain/rules";
import {formatDuration, formatTimeRange, hijriDate, isoToDisplay, isoToShort, todayISO, toHours} from "../../domain/util";
import { formatMoney, formatNumber } from "../../format";
import { Button, Card, EmptyState, Pill, StatCard, cx } from "../../components/ui";
import { DayStatusPill } from "../../components/StatusPills";

/* --------------------------- إجراءات سريعة --------------------------- */

type QuickTone = "cyan" | "amber" | "emerald" | "violet" | "rose";

/** لوحة الأقسام: لكل قسم لون، فلا تسيطر درجة واحدة على الشاشة */
type AccentTone =
  | "sky"
  | "teal"
  | "cyan"
  | "amber"
  | "violet"
  | "indigo"
  | "orange"
  | "emerald"
  | "rose";

const ACCENT: Record<AccentTone, { chip: string; link: string }> = {
  sky: {
    chip: "bg-sky-100 text-sky-600 dark:bg-sky-900/40 dark:text-sky-300",
    link: "text-sky-600 dark:text-sky-400",
  },
  teal: {
    chip: "bg-teal-100 text-teal-600 dark:bg-teal-900/40 dark:text-teal-300",
    link: "text-teal-600 dark:text-teal-400",
  },
  cyan: {
    chip: "bg-cyan-100 text-cyan-600 dark:bg-cyan-900/40 dark:text-cyan-300",
    link: "text-cyan-600 dark:text-cyan-400",
  },
  amber: {
    chip: "bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-300",
    link: "text-amber-600 dark:text-amber-400",
  },
  violet: {
    chip: "bg-violet-100 text-violet-600 dark:bg-violet-900/40 dark:text-violet-300",
    link: "text-violet-600 dark:text-violet-400",
  },
  indigo: {
    chip: "bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-300",
    link: "text-indigo-600 dark:text-indigo-400",
  },
  orange: {
    chip: "bg-orange-100 text-orange-600 dark:bg-orange-900/40 dark:text-orange-300",
    link: "text-orange-600 dark:text-orange-400",
  },
  emerald: {
    chip: "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-300",
    link: "text-sky-600 dark:text-sky-400",
  },
  rose: {
    chip: "bg-rose-100 text-rose-600 dark:bg-rose-900/40 dark:text-rose-300",
    link: "text-rose-600 dark:text-rose-400",
  },
};

const QUICK_TILE: Record<QuickTone, { tile: string; chip: string }> = {
  cyan: {
    tile: "border-cyan-100 bg-cyan-50/60 hover:border-cyan-200 dark:border-cyan-900/40 dark:bg-cyan-900/15",
    chip: "bg-gradient-to-br from-cyan-500 to-sky-600 text-white shadow-sm shadow-cyan-500/30",
  },
  amber: {
    tile: "border-amber-100 bg-amber-50/60 hover:border-amber-200 dark:border-amber-900/40 dark:bg-amber-900/15",
    chip: "bg-gradient-to-br from-amber-400 to-orange-500 text-white shadow-sm shadow-amber-500/30",
  },
  emerald: {
    tile: "border-emerald-100 bg-emerald-50/60 hover:border-emerald-200 dark:border-emerald-900/40 dark:bg-emerald-900/15",
    chip: "bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-sm shadow-emerald-500/30",
  },
  violet: {
    tile: "border-violet-100 bg-violet-50/60 hover:border-violet-200 dark:border-violet-900/40 dark:bg-violet-900/15",
    chip: "bg-gradient-to-br from-violet-500 to-indigo-600 text-white shadow-sm shadow-violet-500/30",
  },
  rose: {
    tile: "border-rose-100 bg-rose-50/60 hover:border-rose-200 dark:border-rose-900/40 dark:bg-rose-900/15",
    chip: "bg-gradient-to-br from-rose-500 to-pink-600 text-white shadow-sm shadow-rose-500/30",
  },
};

/** رأس قسم: أيقونة بلون القسم + عنوان + زر انتقال بنفس اللون */
function SectionHeader({
  tone,
  icon,
  title,
  sub,
  action,
  actionLabel,
}: {
  tone: AccentTone;
  icon: ReactNode;
  title: string;
  sub?: string;
  action?: () => void;
  actionLabel?: string;
}) {
  return (
    <div className="mb-3 flex items-start justify-between gap-2">
      <div className="flex min-w-0 items-start gap-2">
        <span
          className={cx("flex h-8 w-8 shrink-0 items-center justify-center rounded-xl", ACCENT[tone].chip)}
        >
          {icon}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-extrabold text-gray-800 dark:text-white">
            {title}
          </span>
          {sub ? <span className="block truncate text-[11px] text-gray-400">{sub}</span> : null}
        </span>
      </div>
      {action && actionLabel ? (
        <button className={cx("shrink-0 pt-1.5 text-xs font-bold", ACCENT[tone].link)} onClick={action}>
          {actionLabel}
        </button>
      ) : null}
    </div>
  );
}

/** ألوان دوائر الأشخاص في بطاقات الأدوار */
const AVATAR_TONES = [
  "bg-emerald-600",
  "bg-blue-600",
  "bg-violet-600",
  "bg-amber-500",
  "bg-rose-500",
  "bg-teal-600",
  "bg-indigo-600",
];

function minutesShort(min: number): string {
  const m = Math.round(min || 0);
  if (m <= 0) return "0 دق.";
  if (m < 60) return `${m} دق.`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r === 0 ? `${h} س` : `${h} س ${r} دق.`;
}

export default function Dashboard({
  onOpenDay,
  onGoTab,
}: {
  onOpenDay: (dayId: string | null) => void;
  onGoTab: (tab: ManagerTab) => void;
}) {
  const { state } = useApp();
  const pump = state.pump!;

  const stats = useMemo(() => {
    const today = todayISO();
    const current = currentDialaDay(state);
    const next = nextDialaDay(state);
    const days = state.days.filter((d) => !d.archived);
    const allUsages = state.usages.filter((u) => u.status === "active");
    const usageMin = allUsages.reduce((s, u) => s + u.minutes, 0);
    const runMin = state.fuelRecords
      .filter((f) => !f.archived)
      .reduce((s, f) => s + f.hoursRun * 60, 0);
    const stoppageMin = state.stoppages
      .filter((s) => !s.archived)
      .reduce((s, st) => s + st.minutes, 0);
    const differences = state.persons
      .filter((p) => !p.archived)
      .reduce((s, p) => s + comparePerson(state, p.id).differences, 0);
    const issues = days.flatMap((d) => openIssues(state, d, pump).map((i) => ({ day: d, issue: i })));
    return {
      today,
      current,
      next,
      days,
      usageMin,
      runMin,
      stoppageMin,
      differences,
      issues,
      debts: debtors(state),
      financials: pumpFinancials(state),
      schedule: scheduleRows(state, pump),
      units: totalUnits(state, pump.id),
      shareholders: activeShareholders(state, pump.id).length,
      turns: dayTurnRows(state, current, pump.id),
      currentNumber: current ? dayNumberInRound(state, current) : 0,
      currentRound: current ? roundOfDay(state, current)?.number ?? current.dialaNumber : 0,
    };
  }, [state, pump]);

  const currentSummary = stats.current ? daySummary(state, stats.current, pump) : null;
  /* نافذة اليوم الحالي إن وُجد (قد تختلف ساعاته عن ساعات المضخة) */
  const window = pumpWindow(pump, stats.current);
  const pumpRunning = !!stats.current && stats.current.status !== "closed";
  /** نسبة ساعات اليوم المخطّطة من ساعات التشغيل الكاملة — لشريط التقدّم في بطاقة يوم الديالة */
  const dayProgress =
    currentSummary && window.capacityMin > 0
      ? Math.max(0, Math.min(100, Math.round(((currentSummary.plannedMin || 0) / window.capacityMin) * 100)))
      : 0;

  const alerts: { text: string; tone: "red" | "amber" | "blue"; day?: string }[] = [];
  if (stats.issues.length > 0) {
    alerts.push({
      text: `${stats.issues.length} تعارض/تحذير في الأيام الفعلية بحاجة إلى مراجعة.`,
      tone: "amber",
      day: stats.issues[0].day.date,
    });
  }
  if (stats.debts.length > 0) {
    alerts.push({
      text: `${stats.debts.length} شخص عليهم مبالغ غير مسددة — إجمالي ${formatMoney(
        stats.debts.reduce((s, d) => s + d.balance, 0),
        pump.currency
      )}.`,
      tone: "red",
    });
  }
  if (stats.differences > 0) {
    alerts.push({
      text: `${stats.differences} حالة اختلاف بين السجل الرسمي والسجل الشخصي للمستخدمين.`,
      tone: "blue",
    });
  }
  if (state.stoppages.filter((s) => !s.archived).length > 0) {
    alerts.push({
      text: `إجمالي ساعات التوقف: ${formatDuration(stats.stoppageMin)}.`,
      tone: "amber",
    });
  }

  const openActualDay = () => {
    if (stats.current) onOpenDay(stats.current.id);
    else onGoTab("day");
  };

  const quickActions: { id: string; label: string; icon: ReactNode; tone: QuickTone; run: () => void }[] = [
    { id: "use", label: "تسجيل السقي", icon: <Timer size={22} />, tone: "cyan", run: openActualDay },
    { id: "fuel", label: "تسجيل وقود", icon: <Fuel size={22} />, tone: "amber", run: () => onGoTab("finance") },
    { id: "payment", label: "تسجيل دفعة", icon: <CreditCard size={22} />, tone: "emerald", run: () => onGoTab("finance") },
    { id: "handover", label: "تسليم دور", icon: <RefreshCcw size={22} />, tone: "violet", run: () => onGoTab("diala") },
    { id: "expense", label: "دفع خارج", icon: <Plus size={22} />, tone: "rose", run: () => onGoTab("finance") },
  ];

  return (
    <div className="space-y-3">
      {/* البطاقة التعريفية: هوية المضخة والتاريخ — منظّمة في سطور واضحة */}
      <Card className="@container overflow-hidden" data-testid="pump-identity-card">
        <div className="relative overflow-hidden bg-gradient-to-l from-brand-800 via-brand-700 to-brand-500 px-4 py-4 text-white sm:px-5">
          <span className="pointer-events-none absolute -left-12 -top-14 h-40 w-40 rounded-full bg-sky-400/25 blur-2xl" />
          <span className="pointer-events-none absolute -right-10 -bottom-16 h-36 w-36 rounded-full bg-violet-400/20 blur-2xl" />
          <span className="pointer-events-none absolute left-1/3 -top-10 h-24 w-24 rounded-full bg-cyan-300/15 blur-2xl" />
          <div className="relative flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-400/40 to-cyan-300/20 text-cyan-50 ring-1 ring-white/25 backdrop-blur">
              <Gauge size={20} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[clamp(1rem,4.6cqw,1.35rem)] font-black leading-tight">
                {pump.name}
              </div>
              <div className="mt-0.5 truncate text-[clamp(0.62rem,2.6cqw,0.78rem)] text-sky-100/80">
                {[pump.wells, pump.farm].filter(Boolean).join(" · ") || "موقع غير مسجّل"}
              </div>
            </div>
            <Pill
              tone={pumpRunning ? "green" : "gray"}
              className="shrink-0 border-white/30 bg-white/20 text-white"
            >
              {pumpRunning ? "قيد التشغيل" : "بانتظار ديالة"}
            </Pill>
          </div>

          {/* ثلاث حقائق ثابتة عن المضخة — خانات متساوية بدل سطر مزدحم */}
          <div className="relative mt-3 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-2xl bg-white/10 px-2 py-2 ring-1 ring-white/10">
              <div className="flex items-center justify-center gap-1 text-[clamp(0.55rem,2.2cqw,0.68rem)] font-bold text-sky-200">
                <Timer size={11} /> وقت التشغيل
              </div>
              <div className="mt-0.5 text-[clamp(0.68rem,2.9cqw,0.85rem)] font-extrabold">
                {formatTimeRange(window.start, window.end)}
              </div>
            </div>
            <div className="rounded-2xl bg-white/10 px-2 py-2 ring-1 ring-white/10">
              <div className="flex items-center justify-center gap-1 text-[clamp(0.55rem,2.2cqw,0.68rem)] font-bold text-amber-200">
                <Gauge size={11} /> ساعات اليوم
              </div>
              <div className="mt-0.5 text-[clamp(0.68rem,2.9cqw,0.85rem)] font-extrabold">
                {toHours(window.capacityMin)} ساعة
              </div>
            </div>
            <div className="rounded-2xl bg-white/10 px-2 py-2 ring-1 ring-white/10">
              <div className="flex items-center justify-center gap-1 text-[clamp(0.55rem,2.2cqw,0.68rem)] font-bold text-violet-200">
                <Users size={11} /> المساهمون
              </div>
              <div className="mt-0.5 text-[clamp(0.68rem,2.9cqw,0.85rem)] font-extrabold">
                {stats.shareholders}
              </div>
            </div>
          </div>

          <div className="relative mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[clamp(0.6rem,2.4cqw,0.72rem)] font-bold text-sky-50/90">
            <CalendarCheck size={13} className="shrink-0 text-cyan-200" />
            <span>{isoToDisplay(stats.today)}</span>
            <span className="text-white/40">•</span>
            <span className="font-normal text-sky-100/70">{hijriDate(stats.today)}</span>
          </div>
        </div>
      </Card>

      {/* يوم الديالة — بطاقة صغيرة مستقلة */}
      <Card className="@container space-y-2 p-3" data-testid="dashboard-diala-day">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-[clamp(0.62rem,2.6cqw,0.75rem)] font-extrabold text-gray-400">
            <span className="h-1.5 w-1.5 rounded-full bg-violet-500" />
            يوم الديالة
          </span>
          {stats.current ? (
            <span className="text-[clamp(0.6rem,2.4cqw,0.72rem)] font-bold text-gray-400">
              {isoToShort(stats.current.date)}
            </span>
          ) : null}
        </div>

        {stats.current ? (
          <div className="flex items-center gap-3">
            <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-600 text-white shadow-sm shadow-violet-600/25">
              <span className="text-[9px] font-bold text-violet-100/90">اليوم</span>
              <span className="text-[clamp(0.78rem,4cqw,1.05rem)] font-black leading-none">
                {dayOrdinal(stats.currentNumber)}
              </span>
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-[clamp(0.78rem,3.6cqw,1rem)] font-extrabold text-gray-800 dark:text-white">
                  ديالة {stats.currentRound}
                </span>
                {currentSummary ? <Pill tone="violet">{currentSummary.persons} أشخاص</Pill> : null}
              </div>
              <div className="mt-0.5 truncate text-[clamp(0.62rem,2.6cqw,0.78rem)] text-gray-400">
                {formatDuration(currentSummary?.plannedMin || 0)} من {toHours(window.capacityMin)} ساعة
                تشغيل
              </div>
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-slate-700">
                <div
                  className="h-full rounded-full bg-gradient-to-l from-violet-500 to-indigo-500 transition-all"
                  style={{ width: `${dayProgress}%` }}
                />
              </div>
            </div>

            <button
              onClick={() => onOpenDay(stats.current!.id)}
              className="flex shrink-0 items-center gap-1 rounded-2xl border border-indigo-100 bg-indigo-50 px-3 py-2 text-[11px] font-bold text-indigo-700 transition hover:bg-indigo-100 dark:border-indigo-900/40 dark:bg-indigo-900/25 dark:text-indigo-300"
            >
              <CalendarClock size={14} /> فتح
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-violet-50 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300">
              <CalendarPlus size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-[clamp(0.78rem,3.6cqw,1rem)] font-extrabold text-gray-800 dark:text-white">
                لا يوجد يوم فعلي
              </div>
              <div className="mt-0.5 text-[clamp(0.62rem,2.6cqw,0.78rem)] text-gray-400">
                أضف ديالة لتبدأ تسجيل الأيام
              </div>
            </div>
            <button
              onClick={() => onGoTab("diala")}
              className="flex shrink-0 items-center gap-1 rounded-2xl border border-violet-100 bg-violet-50 px-3 py-2 text-[11px] font-bold text-violet-700 transition hover:bg-violet-100 dark:border-violet-900/40 dark:bg-violet-900/25 dark:text-violet-300"
            >
              <Layers size={14} /> إضافة ديالة
            </button>
          </div>
        )}
      </Card>

      {/* إجراءات سريعة */}
      <Card className="p-4">
        <SectionHeader
          tone="indigo"
          icon={<Plus size={16} />}
          title="إجراءات سريعة"
          action={() => onGoTab("reports")}
          actionLabel="عرض الكل"
        />
        <div className="flex gap-2 overflow-x-auto pb-1">
          {quickActions.map((a) => (
            <button
              key={a.id}
              onClick={a.run}
              aria-label={a.label}
              className={cx(
                "flex min-w-[80px] flex-1 flex-col items-center gap-2 rounded-2xl border px-2 py-3 transition active:scale-[0.97]",
                QUICK_TILE[a.tone].tile
              )}
            >
              <span
                className={cx(
                  "flex h-10 w-10 items-center justify-center rounded-xl",
                  QUICK_TILE[a.tone].chip
                )}
              >
                {a.icon}
              </span>
              <span className="text-[11px] font-bold text-gray-600 dark:text-slate-200">{a.label}</span>
            </button>
          ))}
        </div>
      </Card>

      {/* أدوار اليوم */}
      <Card className="p-4">
        <SectionHeader
          tone="sky"
          icon={<CalendarCheck size={16} />}
          title={`أدوار اليوم — ${pump.name}`}
          sub={
            stats.current
              ? `${dialaDayLabel(state, stats.current)} · ${isoToShort(stats.current.date)}${
                  currentSummary ? ` · ${currentSummary.persons} شخص` : ""
                }`
              : "لا يوجد يوم فعلي مسجّل"
          }
          action={openActualDay}
          actionLabel="عرض الكل"
        />

        {!stats.current || stats.turns.length === 0 ? (
          <EmptyState
            icon={<CalendarCheck size={24} />}
            title={stats.current ? "لا توجد أدوار في هذا اليوم" : "لا يوجد يوم فعلي بعد"}
            description={
              stats.current
                ? "افتح اليوم الفعلي وأضف الأدوار — يُبنى الدور من الجدول الأساسي ثم تعدّله بحرية."
                : "أضف ديالة لتُسمّى أيامها اليوم الأول والثاني… ثم ابدأ بتسجيل الأدوار."
            }
            action={
              <Button variant="secondary" onClick={() => onGoTab("diala")}>
                <Layers size={16} /> إضافة ديالة
              </Button>
            }
          />
        ) : (
          <div className="space-y-2.5">
            {stats.turns.slice(0, 5).map((t, i) => (
              <TurnCard key={t.entryId} turn={t} index={i} onOpen={openActualDay} />
            ))}
            {stats.turns.length > 5 ? (
              <button
                onClick={openActualDay}
                className="w-full rounded-2xl bg-gray-50 py-2 text-[11px] font-bold text-gray-500 dark:bg-slate-700 dark:text-slate-300"
              >
                + {stats.turns.length - 5} دور آخر — عرض الكل
              </button>
            ) : null}
          </div>
        )}
      </Card>

      {/* المضخات */}
      <Card className="p-4">
        <SectionHeader
          tone="teal"
          icon={<Gauge size={16} />}
          title="المضخات"
          action={() => onGoTab("settings")}
          actionLabel="إدارة المضخات"
        />
        <button
          onClick={() => onGoTab("settings")}
          className="flex w-full items-center gap-3 rounded-2xl border border-teal-100 bg-teal-50/60 p-3 text-right transition hover:border-teal-200 dark:border-teal-900/40 dark:bg-teal-900/20"
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-500 to-cyan-600 text-white shadow-sm shadow-teal-500/25">
            <Gauge size={20} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center justify-end gap-2">
              <Pill tone={pumpRunning ? "teal" : "gray"}>{pumpRunning ? "تعمل" : "بانتظار ديالة"}</Pill>
              <span className="text-sm font-extrabold text-gray-800 dark:text-white">{pump.name}</span>
            </span>
            <span className="mt-0.5 block truncate text-[11px] text-gray-400">
              {[pump.wells, pump.farm].filter(Boolean).join(" · ") || "موقع غير مسجّل"} · {stats.shareholders}{" "}
              مساهم · {formatNumber(stats.units)} {pump.shareUnit}
            </span>
          </span>
          <ChevronLeft size={16} className="text-gray-300" />
        </button>
      </Card>

      {stats.next ? (
        <Card className="flex items-center gap-3 p-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-500 to-sky-600 text-white shadow-sm shadow-cyan-500/25">
            <CalendarClock size={18} />
          </div>
          <div className="flex-1">
            <div className="flex items-center gap-1.5 text-xs font-bold text-gray-400">
              <span className="h-1.5 w-1.5 rounded-full bg-cyan-500" /> اليوم القادم
            </div>
            <div className="text-sm font-extrabold text-gray-800 dark:text-white">
              {dialaDayLabel(state, stats.next)} — {isoToShort(stats.next.date)}
            </div>
          </div>
          <button
            onClick={() => onOpenDay(stats.next!.id)}
            className="rounded-xl bg-sky-50 px-3 py-2 text-xs font-bold text-sky-700 dark:bg-sky-900/30 dark:text-sky-300"
          >
            فتح
          </button>
        </Card>
      ) : null}

      {alerts.length > 0 ? (
        <div className="space-y-2">
          {alerts.map((a, i) => (
            <div
              key={i}
              className={
                "flex items-center gap-2 rounded-2xl border px-3 py-3 text-xs font-bold " +
                (a.tone === "red"
                  ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300"
                  : a.tone === "amber"
                    ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-300"
                    : "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/40 dark:bg-sky-900/20 dark:text-sky-300")
              }
            >
              <AlertTriangle size={14} className="shrink-0" />
              <span className="flex-1">{a.text}</span>
              {a.day ? (
                <button
                  className="rounded-xl bg-white/70 px-2 py-1 text-[10px] dark:bg-slate-800"
                  onClick={() => onGoTab("reports")}
                >
                  مراجعة
                </button>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label="ساعات الاستخدام المسجلة"
          value={formatDuration(stats.usageMin)}
          hint={`${state.usages.filter((u) => u.status === "active").length} عملية استخدام`}
          tone="blue"
          icon={<Timer size={14} />}
        />
        <StatCard
          label="ساعات تشغيل المضخة"
          value={formatDuration(stats.runMin)}
          hint={`استهلاك ${stats.financials.fuelLiters} لتر`}
          tone="teal"
          icon={<Droplets size={14} />}
        />
        <StatCard
          label="المساهمون الأساسيون"
          value={`${stats.shareholders}`}
          hint={`${formatNumber(stats.units)} ${pump.shareUnit}`}
          icon={<Users size={14} />}
          tone="violet"
        />
        <StatCard
          label="ساعات التوقف"
          value={formatDuration(stats.stoppageMin)}
          hint={`${state.stoppages.filter((s) => !s.archived).length} توقف مسجّل`}
          tone="amber"
          icon={<Wrench size={14} />}
        />
      </div>

      <Card className="p-4">
        <SectionHeader
          tone="amber"
          icon={<Coins size={16} />}
          title="ملخص الحسابات"
          action={() => onGoTab("finance")}
          actionLabel="التفاصيل"
        />
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-2xl bg-sky-50 px-2 py-3 dark:bg-sky-900/25">
            <div className="text-[10px] font-bold text-sky-600 dark:text-sky-300">إجمالي الاستحقاق</div>
            <div className="mt-1 text-sm font-extrabold text-sky-800 dark:text-sky-200">
              {formatMoney(stats.financials.charging, pump.currency)}
            </div>
          </div>
          <div className="rounded-2xl bg-emerald-50 px-2 py-3 dark:bg-emerald-900/25">
            <div className="text-[10px] font-bold text-sky-600 dark:text-sky-300">المسدَّد</div>
            <div className="mt-1 text-sm font-extrabold text-emerald-700 dark:text-emerald-300">
              {formatMoney(stats.financials.collected, pump.currency)}
            </div>
          </div>
          <div className="rounded-2xl bg-rose-50 px-2 py-3 dark:bg-rose-900/25">
            <div className="text-[10px] font-bold text-rose-600 dark:text-rose-300">المتبقي</div>
            <div className="mt-1 text-sm font-extrabold text-rose-700 dark:text-rose-300">
              {formatMoney(stats.financials.outstanding, pump.currency)}
            </div>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[10px] font-bold text-gray-400">
          <div>رواسة مستحقة: {formatMoney(stats.financials.operatorDue, pump.currency)}</div>
          <div>مدفوع للرواس: {formatMoney(stats.financials.operatorPaid, pump.currency)}</div>
          <div>نقص ديزل: {stats.financials.fuelShortage} لتر</div>
        </div>
      </Card>

      <Card className="p-4">
        <SectionHeader
          tone="violet"
          icon={<Layers size={16} />}
          title="الجدول الأساسي (مرجعي)"
          action={() => onGoTab("people")}
          actionLabel="إدارة"
        />
        {stats.schedule.length === 0 ? (
          <EmptyState
            icon={<Users size={24} />}
            title="لا يوجد مساهمون أساسيون"
            description="سجّل المساهم الأساسي أولًا، ثم أنشئ اليوم الفعلي."
            action={
              <Button variant="secondary" onClick={() => onGoTab("people")}>
                تسجيل مساهمين
              </Button>
            }
          />
        ) : (
          <div className="space-y-2">
            {stats.schedule.slice(0, 6).map((row) => (
              <div
                key={row.shareholder.id}
                className="flex items-center gap-3 rounded-2xl bg-violet-50/60 px-3 py-2 dark:bg-slate-700"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 text-[11px] font-black text-white">
                  {row.order + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-bold text-gray-800 dark:text-white">
                    {personName(state, row.shareholder.personId)}
                  </div>
                  {(row.holderId ?? "") !== row.shareholder.personId ? (
                    <div className="text-[10px] text-amber-600">صاحب الحق الحالي: {row.holderName}</div>
                  ) : null}
                </div>
                <div className="text-[11px] font-bold text-gray-500 dark:text-slate-300">
                  {formatNumber(row.units)} {pump.shareUnit} · {formatDuration(row.derivedHoursMin)}
                </div>
              </div>
            ))}
            {stats.schedule.length > 6 ? (
              <p className="text-center text-[11px] text-gray-400">
                + {stats.schedule.length - 6} مساهمين آخرين
              </p>
            ) : null}
          </div>
        )}
      </Card>

      <Card className="p-4">
        <SectionHeader
          tone="orange"
          icon={<TrendingUp size={16} />}
          title="آخر الأيام الفعلية"
          action={() => onGoTab("diala")}
          actionLabel="الكل"
        />
        {stats.days.length === 0 ? (
          <p className="py-4 text-center text-xs text-gray-400">لا توجد أيام مسجّلة.</p>
        ) : (
          <div className="space-y-2">
            {stats.days
              .slice()
              .sort((a, b) => (a.date < b.date ? 1 : -1))
              .slice(0, 5)
              .map((day) => {
                const s = daySummary(state, day, pump);
                const holders = dayEntries(state, day.id)
                  .slice(0, 3)
                  .map((e) => personName(state, e.personId))
                  .join(" · ");
                return (
                  <button
                    key={day.id}
                    onClick={() => onOpenDay(day.id)}
                    className="flex w-full items-center gap-3 rounded-2xl border border-gray-100 px-3 py-3 text-right transition hover:border-orange-200 hover:bg-orange-50/40 dark:border-slate-700 dark:hover:border-orange-900/40"
                  >
                    <div className="flex-1">
                      <div className="text-xs font-extrabold text-gray-800 dark:text-white">
                        {dialaDayLabel(state, day)} — {isoToShort(day.date)}
                      </div>
                      <div className="truncate text-[11px] text-gray-400">{holders || "—"}</div>
                    </div>
                    <div className="text-left">
                      <div className="text-[11px] font-bold text-gray-500 dark:text-slate-300">
                        {s.persons} شخص · {formatDuration(s.plannedMin)}
                      </div>
                      <DayStatusPill status={day.status} />
                    </div>
                  </button>
                );
              })}
          </div>
        )}
      </Card>
    </div>
  );
}

/* ------------------------ بطاقة دور (المستخدم) ------------------------ */

/** صفوف الأدوار تُحسب في طبقة القواعد — هذا اسم مختصر للاستخدام في العرض */
export type TurnRow = DayTurnRow;

function TurnCard({ turn, index, onOpen }: { turn: TurnRow; index: number; onOpen: () => void }) {
  const pct = turn.plannedMin > 0 ? Math.min(100, Math.round((turn.usedMin / turn.plannedMin) * 100)) : 0;
  const active = turn.usedMin > 0 && turn.remainingMin > 0;
  const letter = turn.name.trim().charAt(0) || "؟";

  return (
    <button
      onClick={onOpen}
      aria-label={`دور ${turn.name} — ${turn.label}`}
      className={cx(
        "w-full rounded-2xl border p-3 text-right transition",
        active
          ? "border-emerald-400 bg-emerald-50/40 shadow-sm dark:bg-emerald-900/10"
          : "border-gray-100 hover:border-emerald-200 dark:border-slate-700"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={cx(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-black text-white",
              AVATAR_TONES[index % AVATAR_TONES.length]
            )}
          >
            {letter}
          </span>
          <span className="truncate text-sm font-extrabold text-gray-800 dark:text-white">{turn.name}</span>
        </div>
        <Pill tone={turn.tone}>{turn.label}</Pill>
      </div>

      <div className="mt-2 flex items-center justify-between text-[11px] font-bold text-gray-500 dark:text-slate-300">
        <span>
          {turn.units} سهم · {turn.hours} س
        </span>
        <span className="text-gray-400">
          {formatTimeRange(turn.startTime, turn.endTime)}
        </span>
      </div>

      <div className="mt-2 flex items-center justify-between text-[10px] font-bold text-gray-400">
        <span>مستخدم {minutesShort(turn.usedMin)}</span>
        <span>متبقّي {minutesShort(turn.remainingMin)}</span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-slate-700">
        <div className="h-1.5 rounded-full bg-emerald-600" style={{ width: `${pct}%` }} />
      </div>

      {turn.shortageLiters > 0 ? (
        <div className="mt-2 flex items-center justify-end gap-1 text-[11px] font-bold text-amber-600">
          <span>نقص وقود: {turn.shortageLiters} لتر</span>
          <AlertTriangle size={12} />
        </div>
      ) : null}
    </button>
  );
}
