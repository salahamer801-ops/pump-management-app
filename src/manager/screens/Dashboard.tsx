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
import type { AppState, DialaDay, DayEntry } from "../../domain/types";
import type { ManagerTab } from "../ManagerApp";
import {
  activeShareholders,
  comparePerson,
  currentDialaDay,
  dayEntries,
  daySummary,
  dialaDayLabel,
  debtors,
  nextDialaDay,
  openIssues,
  personName,
  pumpFinancials,
  pumpWindow,
  scheduleRows,
  shareholderOfPerson,
  totalUnits,
} from "../../domain/rules";
import { formatDuration, hijriDate, isoToDisplay, isoToShort, toHours, todayISO } from "../../domain/util";
import { formatMoney, formatNumber } from "../../format";
import { Button, Card, EmptyState, Pill, StatCard, cx } from "../../components/ui";

/* --------------------------- إجراءات سريعة --------------------------- */

type QuickTone = "emerald" | "amber" | "sky" | "violet" | "rose";

const TONE_TILE: Record<QuickTone, string> = {
  emerald: "border-emerald-100 bg-emerald-50/70 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-900/20 dark:text-emerald-300",
  amber: "border-amber-100 bg-amber-50/70 text-amber-700 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-300",
  sky: "border-sky-100 bg-sky-50/70 text-sky-700 dark:border-sky-900/40 dark:bg-sky-900/20 dark:text-sky-300",
  violet: "border-violet-100 bg-violet-50/70 text-violet-700 dark:border-violet-900/40 dark:bg-violet-900/20 dark:text-violet-300",
  rose: "border-rose-100 bg-rose-50/70 text-rose-700 dark:border-rose-900/40 dark:bg-rose-900/20 dark:text-rose-300",
};

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
      turns: buildTurns(state, current, pump.id),
    };
  }, [state, pump]);

  const currentSummary = stats.current ? daySummary(state, stats.current, pump) : null;
  const window = pumpWindow(pump);
  const pumpRunning = !!stats.current && stats.current.status !== "closed";

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
    { id: "use", label: "تسجيل السقي", icon: <Timer size={22} />, tone: "emerald", run: openActualDay },
    { id: "fuel", label: "تسجيل وقود", icon: <Fuel size={22} />, tone: "amber", run: () => onGoTab("finance") },
    { id: "payment", label: "تسجيل دفعة", icon: <CreditCard size={22} />, tone: "sky", run: () => onGoTab("finance") },
    { id: "handover", label: "تسليم دور", icon: <RefreshCcw size={22} />, tone: "violet", run: () => onGoTab("diala") },
    { id: "expense", label: "دفع خارج", icon: <Plus size={22} />, tone: "rose", run: () => onGoTab("finance") },
  ];

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <div className="bg-gradient-to-l from-emerald-600 to-emerald-500 p-5 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-bold">
              <Gauge size={16} /> {pump.name}
            </div>
            <Pill tone="green" className="border-white/30 bg-white/20 text-white">
              {window.start} → {window.end} · {toHours(window.capacityMin)} س
            </Pill>
          </div>
          <div className="mt-3 text-xs text-emerald-50">{isoToDisplay(stats.today)}</div>
          <div className="text-xs text-emerald-100">{hijriDate(stats.today)}</div>

          {stats.current ? (
            <div className="mt-4">
              <div className="text-xs text-emerald-50">اليوم الحالي</div>
              <div className="flex items-end justify-between">
                <div className="text-2xl font-black">
                  {dialaDayLabel(state, stats.current)}
                  {currentSummary ? ` · ${currentSummary.persons} شخص` : ""}
                </div>
                <div className="text-left text-xs">
                  <div>{isoToShort(stats.current.date)}</div>
                  <div className="text-base font-extrabold">
                    {formatDuration(currentSummary?.plannedMin || 0)} / {toHours(window.capacityMin)} س
                  </div>
                </div>
              </div>
              <div className="mt-3 flex gap-2">
                <Button
                  className="flex-1 bg-white/15 text-white"
                  variant="ghost"
                  onClick={() => onOpenDay(stats.current!.id)}
                >
                  <CalendarClock size={16} /> فتح اليوم الفعلي
                </Button>
                <Button
                  className="flex-1 bg-white text-emerald-700"
                  variant="ghost"
                  onClick={() => onGoTab("diala")}
                >
                  <CalendarPlus size={16} /> ديالة جديدة
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-4">
              <p className="text-sm text-emerald-50">لا يوجد يوم فعلي مسجّل بعد.</p>
              <Button className="mt-3 bg-white text-emerald-700" variant="ghost" onClick={() => onGoTab("diala")}>
                <CalendarPlus size={16} /> إضافة ديالة
              </Button>
            </div>
          )}
        </div>
      </Card>

      {/* إجراءات سريعة */}
      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-extrabold text-gray-800 dark:text-white">إجراءات سريعة</h2>
          <button className="text-xs font-bold text-emerald-600" onClick={() => onGoTab("reports")}>
            عرض الكل
          </button>
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {quickActions.map((a) => (
            <button
              key={a.id}
              onClick={a.run}
              aria-label={a.label}
              className={cx(
                "flex min-w-[80px] flex-1 flex-col items-center gap-2 rounded-2xl border px-2 py-3 transition active:scale-[0.97]",
                TONE_TILE[a.tone]
              )}
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white shadow-sm dark:bg-slate-800">
                {a.icon}
              </span>
              <span className="text-[11px] font-bold">{a.label}</span>
            </button>
          ))}
        </div>
      </Card>

      {/* أدوار اليوم */}
      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-extrabold text-gray-800 dark:text-white">
              أدوار اليوم — {pump.name}
            </h2>
            {stats.current ? (
              <div className="text-[11px] text-gray-400">
                {dialaDayLabel(state, stats.current)} · {isoToShort(stats.current.date)}
                {currentSummary ? ` · ${currentSummary.persons} شخص` : ""}
              </div>
            ) : (
              <div className="text-[11px] text-gray-400">لا يوجد يوم فعلي مسجّل</div>
            )}
          </div>
          <button
            className="text-xs font-bold text-emerald-600"
            onClick={openActualDay}
            aria-label="عرض كل الأدوار"
          >
            عرض الكل
          </button>
        </div>

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
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-extrabold text-gray-800 dark:text-white">المضخات</h2>
          <button className="text-xs font-bold text-emerald-600" onClick={() => onGoTab("settings")}>
            إدارة المضخات
          </button>
        </div>
        <button
          onClick={() => onGoTab("settings")}
          className="flex w-full items-center gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/50 p-3 text-right dark:border-emerald-900/40 dark:bg-emerald-900/20"
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
            <Gauge size={20} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center justify-end gap-2">
              <Pill tone={pumpRunning ? "green" : "gray"}>{pumpRunning ? "تعمل" : "بانتظار ديالة"}</Pill>
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
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-sky-50 text-sky-600 dark:bg-sky-900/30">
            <CalendarClock size={18} />
          </div>
          <div className="flex-1">
            <div className="text-xs font-bold text-gray-400">اليوم القادم</div>
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
          icon={<Timer size={14} />}
        />
        <StatCard
          label="ساعات تشغيل المضخة"
          value={formatDuration(stats.runMin)}
          hint={`استهلاك ${stats.financials.fuelLiters} لتر`}
          tone="blue"
          icon={<Droplets size={14} />}
        />
        <StatCard
          label="المساهمون الأساسيون"
          value={`${stats.shareholders}`}
          hint={`${formatNumber(stats.units)} ${pump.shareUnit}`}
          icon={<Users size={14} />}
          tone="gray"
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
        <div className="mb-3 flex items-center gap-2">
          <Coins size={16} className="text-emerald-600" />
          <h2 className="text-sm font-extrabold text-gray-800 dark:text-white">ملخص الحسابات</h2>
          <button className="mr-auto text-xs font-bold text-emerald-600" onClick={() => onGoTab("finance")}>
            التفاصيل
          </button>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-2xl bg-gray-50 px-2 py-3 dark:bg-slate-700">
            <div className="text-[10px] font-bold text-gray-400">إجمالي الاستحقاق</div>
            <div className="mt-1 text-sm font-extrabold text-gray-800 dark:text-white">
              {formatMoney(stats.financials.charging, pump.currency)}
            </div>
          </div>
          <div className="rounded-2xl bg-emerald-50 px-2 py-3 dark:bg-emerald-900/30">
            <div className="text-[10px] font-bold text-emerald-600">المسدَّد</div>
            <div className="mt-1 text-sm font-extrabold text-emerald-700 dark:text-emerald-300">
              {formatMoney(stats.financials.collected, pump.currency)}
            </div>
          </div>
          <div className="rounded-2xl bg-amber-50 px-2 py-3 dark:bg-amber-900/30">
            <div className="text-[10px] font-bold text-amber-600">المتبقي</div>
            <div className="mt-1 text-sm font-extrabold text-amber-700 dark:text-amber-300">
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
        <div className="mb-3 flex items-center gap-2">
          <Layers size={16} className="text-emerald-600" />
          <h2 className="text-sm font-extrabold text-gray-800 dark:text-white">الجدول الأساسي (مرجعي)</h2>
          <button className="mr-auto text-xs font-bold text-emerald-600" onClick={() => onGoTab("people")}>
            إدارة
          </button>
        </div>
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
                className="flex items-center gap-3 rounded-2xl bg-gray-50 px-3 py-2 dark:bg-slate-700"
              >
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white text-[11px] font-black text-emerald-700 dark:bg-slate-800">
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
        <div className="mb-3 flex items-center gap-2">
          <TrendingUp size={16} className="text-emerald-600" />
          <h2 className="text-sm font-extrabold text-gray-800 dark:text-white">آخر الأيام الفعلية</h2>
          <button className="mr-auto text-xs font-bold text-emerald-600" onClick={() => onGoTab("diala")}>
            الكل
          </button>
        </div>
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
                    className="flex w-full items-center gap-3 rounded-2xl border border-gray-100 px-3 py-3 text-right hover:border-emerald-200 dark:border-slate-700"
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

export interface TurnRow {
  entryId: string;
  name: string;
  units: number;
  hours: number;
  startTime: string;
  endTime: string;
  usedMin: number;
  plannedMin: number;
  remainingMin: number;
  shortageLiters: number;
  tone: "green" | "blue" | "gray";
  label: string;
}

function buildTurns(state: AppState, day: DialaDay | null, pumpId: string): TurnRow[] {
  if (!day) return [];
  const entries: DayEntry[] = dayEntries(state, day.id)
    .slice()
    .sort((a, b) => a.orderIndex - b.orderIndex);
  const dayUsages = state.usages.filter((u) => u.dayId === day.id && u.status === "active");
  const closed = day.status === "closed" || day.status === "completed";

  return entries.map((entry) => {
    const personId = entry.actualPersonId ?? entry.personId;
    const usage =
      dayUsages.find((u) => u.entryId === entry.id) ??
      dayUsages.find((u) => !u.entryId && u.personId === personId) ??
      null;
    const shareholder = shareholderOfPerson(state, pumpId, entry.personId);
    const usedMin = usage?.minutes ?? 0;
    const plannedMin = entry.plannedMin || 0;
    const remainingMin = Math.max(0, plannedMin - usedMin);
    const shortageLiters = usage
      ? Math.max(0, usage.dieselShortageLiters || 0)
      : dayUsages
          .filter((u) => u.personId === personId)
          .reduce((s, u) => s + Math.max(0, u.dieselShortageLiters || 0), 0);
    const pill = usage
      ? remainingMin > 0
        ? { tone: "green" as const, label: "جارٍ الآن" }
        : { tone: "green" as const, label: "تم الدور" }
      : closed
        ? { tone: "gray" as const, label: "لم يُسجَّل" }
        : { tone: "blue" as const, label: "اليوم" };

    return {
      entryId: entry.id,
      name: personName(state, personId),
      units: shareholder?.units ?? 1,
      hours: toHours(plannedMin),
      startTime: entry.startTime,
      endTime: entry.endTime,
      usedMin,
      plannedMin,
      remainingMin,
      shortageLiters,
      tone: pill.tone,
      label: pill.label,
    };
  });
}

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
        <span dir="ltr" className="text-gray-400">
          {turn.startTime} – {turn.endTime}
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

export function DayStatusPill({ status }: { status: string }) {
  const map: Record<string, { tone: "green" | "amber" | "blue" | "gray" | "red"; label: string }> = {
    scheduled: { tone: "gray", label: "مجدول" },
    draft: { tone: "amber", label: "مسودة" },
    in_progress: { tone: "blue", label: "جارٍ التنفيذ" },
    completed: { tone: "green", label: "مكتمل" },
    closed: { tone: "green", label: "مغلق" },
    revised: { tone: "amber", label: "معدّل" },
  };
  const item = map[status] ?? { tone: "gray" as const, label: status };
  return <Pill tone={item.tone}>{item.label}</Pill>;
}

export function dayOwnerLabel(state: AppState, entryId: string): string {
  const entry = state.entries.find((e) => e.id === entryId);
  if (!entry) return "—";
  return personName(state, entry.actualPersonId ?? entry.personId);
}
