import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  CalendarPlus,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Droplets,
  Fuel,
  HandCoins,
  Layers,
  Lock,
  LockOpen,
  Pencil,
  Phone,
  PlayCircle,
  Plus,
  RefreshCcw,
  ShieldCheck,
  Trash2,
  UserCheck,
  Users,
  Wrench,
} from "lucide-react";
import { useApp } from "../../store";
import type {
  ConflictKind,
  Currency,
  DayEntry,
  DayStatus,
  DialaRound,
  DieselSettlement,
  EntryRole,
  Person,
  RoyaltyPayMode,
  Stoppage,
  StoppageKind,
  UsageType,
} from "../../domain/types";
import {
  DIESEL_SETTLEMENT_OPTIONS,
  ROYALTY_MODE_OPTIONS,
  capacityBreakdown,
  computeUsageDraft,
  currentRight,
  dayByDate,
  dayEntries,
  dayIssues,
  dayOrdinal,
  daySettlementTotals,
  daySummary,
  dialaDayLabel,
  dialaDayTitle,
  dieselSettlementLabel,
  entryMinutes,
  findPerson,
  openIssues,
  overlapsFor,
  personName,
  pumpWindow,
  royaltyModeLabel,
  roundDates,
  roundForDate,
  roundOfDay,
  baseRosterRows,
  isBaseRosterPerson,
  shareholderOfPerson,
  shortageAmountOf,
  stoppageMinutesInRange,
  usageTypeLabel,
} from "../../domain/rules";
import {
  addDaysISO,
  durationMin,
  formatClock,
  formatDuration,
  isoToDisplay,
  isoToShort,
  isOvernight,
  minutesToTime,
  nowTime,
  timeToMinutes,
  toHours,
  todayISO,
  uid,
} from "../../domain/util";
import { formatMoney, formatNumber } from "../../format";
import {
  Button,
  Card,
  EmptyState,
  Field,
  Modal,
  NumberInput,
  Pill,
  Select,
  TextArea,
  TextInput,
  TimeInput,
  cx,
} from "../../components/ui";
import PersonPicker, { roleLabel } from "../../components/PersonPicker";
import ShareholdersPanel from "../components/ShareholdersPanel";
import DayBaseShiftCard from "../components/DayBaseShiftCard";
import { AddDialaButton } from "../components/AddDialaModal";
import { DayStatusPill } from "./Dashboard";

const STATUS_FLOW: { id: DayStatus; label: string }[] = [
  { id: "scheduled", label: "مجدول" },
  { id: "draft", label: "مسودة" },
  { id: "in_progress", label: "جارٍ التنفيذ" },
  { id: "completed", label: "مكتمل" },
  { id: "closed", label: "مغلق" },
];

export default function ActualDayScreen({
  dayId,
  onChangeDay,
}: {
  dayId: string | null;
  onChangeDay: (id: string | null) => void;
}) {
  const { state, actions } = useApp();
  const pump = state.pump!;
  const [date, setDate] = useState(() => {
    const d = dayId ? state.days.find((x) => x.id === dayId) : null;
    return d?.date ?? todayISO();
  });
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editEntry, setEditEntry] = useState<DayEntry | null>(null);
  const [usageEntry, setUsageEntry] = useState<DayEntry | null>(null);
  const [stoppageOpen, setStoppageOpen] = useState(false);
  const [ackIssue, setAckIssue] = useState<{ key: string; kind: ConflictKind; message: string } | null>(null);
  const [reopenOpen, setReopenOpen] = useState(false);
  const [actorName, setActorName] = useState("المسؤول");
  /** سبب التصحيح — مطلوب عند تعديل يوم مغلق (§21) */
  const [correctionReason, setCorrectionReason] = useState("");
  const [shortageFor, setShortageFor] = useState<string | null>(null);
  const [editPerson, setEditPerson] = useState<Person | null>(null);

  useEffect(() => {
    if (!dayId) return;
    const d = state.days.find((x) => x.id === dayId);
    if (d) setDate(d.date);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayId]);

  const day = useMemo(() => dayByDate(state, date), [state, date]);
  const entries = useMemo(() => (day ? dayEntries(state, day.id) : []), [state, day]);
  const window = pumpWindow(pump, day);
  const summary = day ? daySummary(state, day, pump) : null;
  const issues = day ? openIssues(state, day, pump) : [];
  const allIssues = day ? dayIssues(state, day, pump) : [];
  const stoppages = state.stoppages.filter((s) => (day ? s.dayId === day.id : false) && !s.archived);
  const settle = day ? daySettlementTotals(state, day.id) : null;
  /** تفصيل الساعات: الاستخدام الفعلي · ساعات المضخة · التوقفات · المتاح · التجاوز (§8) */
  const breakdown = useMemo(
    () => (day ? capacityBreakdown(state, day, pump) : null),
    [state, day, pump]
  );
  /** تصحيحات ما بعد الإغلاق — التاريخ محفوظ (§21) */
  const dayCorrections = useMemo(
    () => (day ? state.corrections.filter((c) => c.dayId === day.id) : []),
    [state.corrections, day]
  );
  const dayClosed = day?.status === "closed" || day?.status === "revised";

  // استخدامات مُسجَّلة بلا صف في الترتيب (حفاظًا على عدم وجود سجلات يتيمة)
  const orphanUsages = useMemo(() => {
    if (!day) return [];
    const linked = new Set(entries.map((e) => e.usageId).filter(Boolean) as string[]);
    return state.usages.filter(
      (u) => u.dayId === day.id && u.status === "active" && !linked.has(u.id)
    );
  }, [state.usages, entries, day]);

  const changeDate = (next: string) => {
    setDate(next);
    const target = dayByDate(state, next);
    onChangeDay(target?.id ?? null);
  };

  /** الديالة التي يقع فيها التاريخ المختار — لا يوجد يوم خارج الديالة */
  const dialaForDate = useMemo(() => roundForDate(state, date), [state, date]);
  /** أسطر كشف الدوام الأساسي لديالة هذا اليوم — للزر وللشارات */
  const baseRows = useMemo(
    () => baseRosterRows(state, day?.roundId ?? dialaForDate?.id ?? null),
    [state, day?.roundId, dialaForDate?.id]
  );
  const dialaDayIndex = dialaForDate
    ? roundDates(dialaForDate.startDate, dialaForDate.days).indexOf(date) + 1
    : 0;

  const createDay = (roundOverride?: DialaRound | null) => {
    const round = roundOverride ?? roundForDate(state, date);
    const id = uid("day");
    actions.createDay(
      {
        id,
        pumpId: pump.id,
        dialaNumber: round ? round.number : state.counters.diala,
        roundId: round?.id ?? null,
        date,
        status: "draft",
        workStart: pump.workStart,
        workEnd: pump.workEnd,
        capacityMin: durationMin(pump.workStart, pump.workEnd),
        plannedWorkStart: pump.workStart,
        plannedWorkEnd: pump.workEnd,
        plannedCapacityMin: durationMin(pump.workStart, pump.workEnd),
        notes: "",
        openedBy: actorName,
        closedBy: "",
        closedAt: "",
        reopenedBy: "",
        reopenedAt: "",
        reopenReason: "",
        revision: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        archived: false,
      },
      entries.length === 0,
      []
    );
    onChangeDay(id);
  };

  if (!day) {
    return (
      <div className="space-y-4">
        <DaySelector date={date} onChange={changeDate} />
        <DialaStrip date={date} onOpenDay={onChangeDay} />

        {dialaForDate ? (
          <EmptyState
            icon={<CalendarPlus size={26} />}
            title={`لا يوجد يوم مسجّل بتاريخ ${isoToDisplay(date)}`}
            description={`هذا التاريخ داخل ديالة ${dialaForDate.number} — وهو اليوم ${dayOrdinal(
              dialaDayIndex
            )} للديالة. يُنشأ اليوم بقائمة أساسيين فارغة تخصّه وحده، ثم تضيف من تريد لكل يوم على حدة.`}
            action={
              <Button onClick={() => createDay(dialaForDate)}>
                <CalendarPlus size={18} /> إنشاء اليوم {dayOrdinal(dialaDayIndex)} للديالة {dialaForDate.number}
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={<Layers size={26} />}
            title={`لا توجد ديالة تغطي ${isoToDisplay(date)}`}
            description="كل يوم فعلي ينتمي إلى ديالة. اضغط «إضافة ديالة» لتحديد عدد أيامها — فتُسمّى أيامها اليوم الأول، الثاني… حتى آخر يوم، ثم يعود الدوران بديالة تالية."
            action={
              <AddDialaButton
                startDate={date}
                label="إضافة ديالة تبدأ من هذا اليوم"
                onCreated={() => onChangeDay(null)}
              />
            }
          />
        )}
        <ShareholdersPanel dayId={null} actor={actorName} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <DaySelector date={date} onChange={changeDate} />
      <DialaStrip date={date} dayId={day.id} onOpenDay={onChangeDay} />

      <Card className="p-4">
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
            <ClipboardList size={18} />
          </div>
          <div className="flex-1">
            <div className="text-sm font-extrabold text-gray-900 dark:text-white">
              {dialaDayTitle(state, day)}
            </div>
            <div className="text-[11px] text-gray-400">
              {isoToDisplay(day.date)} · {dialaDayLabel(state, day)} ·{" "}
              {day.revision > 0 ? `أُعيد فتح اليوم ${day.revision} مرة` : "لم يُعد فتحه"}
            </div>
          </div>
          <DayStatusPill status={day.status} />
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <Field label="بداية التشغيل">
            <TimeInput
              value={day.workStart}
              onChange={(e) => actions.updateDay(day.id, { workStart: e.target.value })}
              aria-label="بداية تشغيل المضخة"
            />
          </Field>
          <Field label="نهاية التشغيل">
            <TimeInput
              value={day.workEnd}
              onChange={(e) => actions.updateDay(day.id, { workEnd: e.target.value })}
              aria-label="نهاية تشغيل المضخة"
            />
          </Field>
        </div>

        <div className="mt-3 grid grid-cols-4 gap-2 text-center">
          <MiniStat label="الأشخاص" value={`${summary?.persons ?? 0}`} />
          <MiniStat label="ساعات اليوم" value={formatDuration(summary?.plannedMin ?? 0)} />
          <MiniStat
            label={summary && summary.overMin > 0 ? "تجاوز" : "متبقٍ"}
            value={formatDuration(summary && summary.overMin > 0 ? summary.overMin : summary?.remainingMin ?? 0)}
            tone={summary && summary.overMin > 0 ? "red" : "green"}
          />
          <MiniStat
            label="تعارضات"
            value={`${issues.length}`}
            tone={issues.length > 0 ? "amber" : "green"}
          />
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {STATUS_FLOW.filter((s) => s.id !== "closed").map((s) => (
            <button
              key={s.id}
              onClick={() => actions.setDayStatus(day.id, s.id, actorName)}
              className={cx(
                "rounded-full border px-3 py-1 text-[11px] font-bold transition",
                day.status === s.id
                  ? "border-emerald-400 bg-emerald-50 text-emerald-700"
                  : "border-gray-200 text-gray-500 hover:border-emerald-200 dark:border-slate-600 dark:text-slate-300"
              )}
            >
              {s.label}
            </button>
          ))}
          {day.status === "closed" ? (
            <Button variant="secondary" className="px-3 py-1 text-[11px]" onClick={() => setReopenOpen(true)}>
              <LockOpen size={14} /> إعادة فتح اليوم
            </Button>
          ) : (
            <Button
              variant="outline"
              className="px-3 py-1 text-[11px]"
              onClick={() => actions.closeDay(day.id, actorName)}
            >
              <Lock size={14} /> إغلاق اليوم
            </Button>
          )}
        </div>
        {day.status === "closed" ? (
          <p className="mt-2 rounded-2xl bg-gray-50 px-3 py-2 text-[11px] text-gray-500 dark:bg-slate-700 dark:text-slate-300">
            أُغلق اليوم بواسطة {day.closedBy || "المسؤول"} — أي تعديل لاحق يحتاج إعادة فتح موثّقة.
          </p>
        ) : null}
      </Card>

      {/* تفصيل الساعات والتوقفات (§8) — لا يُحذف أي سجل، التجاوز يُعرض بسببه */}
      {breakdown ? (
        <Card className="p-4" data-testid="hours-breakdown">
          <div className="mb-2 flex items-center gap-2">
            <ClipboardList size={16} className="text-emerald-600" />
            <h2 className="text-sm font-extrabold text-gray-800 dark:text-white">تفصيل الساعات</h2>
            <Pill tone={breakdown.over ? "red" : "green"}>
              {breakdown.over ? `تجاوز ${formatDuration(breakdown.overMin)}` : "داخل الحد"}
            </Pill>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <MiniStat label="الاستخدام الفعلي" value={formatDuration(breakdown.usageTotalMin)} />
            <MiniStat label="ساعات المضخة" value={formatDuration(breakdown.capacityMin)} tone="gray" />
            <MiniStat label="التوقفات" value={formatDuration(breakdown.stoppageMin)} tone="amber" />
            <MiniStat label="المتاح فعلًا" value={formatDuration(breakdown.effectiveMin)} tone="gray" />
            <MiniStat
              label="التجاوز"
              value={formatDuration(breakdown.overMin)}
              tone={breakdown.over ? "red" : "green"}
            />
          </div>
          {breakdown.over ? (
            <p className="mt-2 rounded-2xl bg-red-50 px-3 py-2 text-[11px] leading-relaxed text-red-700 dark:bg-red-900/20 dark:text-red-300">
              إجمالي الساعات {toHours(breakdown.usageTotalMin)} · ساعات المضخة المتاحة{" "}
              {toHours(breakdown.effectiveMin)} · مقدار التجاوز {toHours(breakdown.overMin)}·
              {breakdown.overReasons.length
                ? ` سبب مسجَّل: ${breakdown.overReasons.join(" | ")}`
                : " لا يوجد سبب مسجَّل للتجاوز بعد — سجّله عند تعديل الاستخدام."}
            </p>
          ) : null}
          <p className="mt-2 text-[10px] text-gray-400">
            التوقفات تُخصم من ساعات التشغيل قبل حساب التجاوز. البيانات لا تُحذف أبدًا ولا تُعدَّل تلقائيًا.
          </p>
        </Card>
      ) : null}

      {/* التصحيحات بعد إغلاق اليوم (§21): تُسجَّل ولا تُمنع ولا تُفقد القيمة القديمة */}
      {dayClosed ? (
        <Card className="p-4" data-testid="day-corrections">
          <div className="mb-2 flex items-center gap-2">
            <Lock size={16} className="text-amber-600" />
            <h2 className="text-sm font-extrabold text-gray-800 dark:text-white">
              اليوم مغلق — التعديل تصحيح موثّق
            </h2>
          </div>
          <Field label="سبب التصحيح" hint="يُحفظ مع التعديل: من صحّح ومتى وماذا تغيّر وما كانت القيمة القديمة">
            <TextInput
              value={correctionReason}
              onChange={(e) => setCorrectionReason(e.target.value)}
              placeholder="مثال: خطأ في تسجيل ساعات خالد — التصحيح بموجب اتفاق الطرفين"
              aria-label="سبب تصحيح اليوم المغلق"
            />
          </Field>
          {dayCorrections.length > 0 ? (
            <div className="mt-3 space-y-1.5">
              <div className="text-[11px] font-extrabold text-gray-700 dark:text-slate-200">
                سجل التصحيحات ({dayCorrections.length})
              </div>
              {dayCorrections.slice(0, 8).map((c) => (
                <div
                  key={c.id}
                  className="rounded-2xl bg-gray-50 px-3 py-2 text-[10px] text-gray-500 dark:bg-slate-700 dark:text-slate-300"
                >
                  <span className="font-bold">{c.byUser}</span> · {formatClock(c.at)} · {c.entity} —{" "}
                  {c.field}: {c.oldValue} ← {c.newValue}
                  {c.reason ? ` · السبب: ${c.reason}` : ""}
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-[10px] text-gray-400">
              لا توجد تصحيحات على هذا اليوم بعد.
            </p>
          )}
        </Card>
      ) : null}

      {/* 1) المساهمون الأساسيون — سجل مرجعي ثابت لا يتغيّر بتغيّر اليوم */}
      <ShareholdersPanel dayId={day.id} actor={actorName} />

      {/* 2) الدوام الأساسي — كشف الديالة: أسماء المساهمين ونصيب كل واحد في هذا الدور */}
      <DayBaseShiftCard day={day} actor={actorName} />

      {issues.length > 0 ? (
        <Card className="space-y-2 p-4">
          <div className="flex items-center gap-2">
            <AlertTriangle size={16} className="text-amber-500" />
            <h2 className="text-sm font-extrabold text-gray-800 dark:text-white">
              تحقق قبل الحفظ ({issues.length})
            </h2>
          </div>
          {issues.map((issue) => (
            <div
              key={issue.key}
              className={cx(
                "rounded-2xl border px-3 py-2 text-[11px] leading-relaxed",
                issue.severity === "error"
                  ? "border-red-200 bg-red-50 text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300"
                  : "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-300"
              )}
            >
              <div className="flex items-start gap-2">
                <span className="flex-1 font-bold">{issue.message}</span>
                <button
                  onClick={() =>
                    setAckIssue({ key: issue.key, kind: issue.kind as ConflictKind, message: issue.message })
                  }
                  className="rounded-xl bg-white/80 px-2 py-1 text-[10px] font-bold dark:bg-slate-800"
                >
                  تجاوز بسبب
                </button>
              </div>
            </div>
          ))}
          <p className="text-[10px] text-gray-400">
            النظام لا يحذف أي سجل تلقائيًا — يعرض المشكلة ويطلب سبب التجاوز ويحفظه في سجل التدقيق.
          </p>
        </Card>
      ) : null}

      {/* 3) الدوام الفعلي: من أخذ ماءه أو قاسم أسهم هذا اليوم */}
      <Card className="p-4">
        <div className="mb-3 flex items-center gap-2">
          <Users size={16} className="text-emerald-600" />
          <h2 className="text-sm font-extrabold text-gray-800 dark:text-white">
            الدوام الفعلي — من أخذ ماءه أو قاسم أسهم هذا اليوم
          </h2>
          <span className="mr-auto text-[11px] text-gray-400">
            {entries.length} مستخدم · {formatDuration(summary?.plannedMin ?? 0)} من {toHours(window.capacityMin)} ساعة
          </span>
        </div>

        {settle ? <SettlementSummary totals={settle} currency={pump.currency} /> : null}

        {entries.length === 0 ? (
          <p className="py-4 text-center text-xs text-gray-400">
            لا يوجد أحد في الدوام الفعلي لهذا اليوم بعد — ابدأ من كشف الديالة أو أضف من أخذ ماءه فعلًا.
          </p>
        ) : (
          <div className="mt-3 space-y-2">
            {entries.map((entry, index) => (
              <EntryRow
                key={entry.id}
                index={index}
                entry={entry}
                fromBaseRoster={isBaseRosterPerson(state, day.roundId ?? null, entry.personId)}
                isFirst={index === 0}
                isLast={index === entries.length - 1}
                onEdit={() => setEditEntry(entry)}
                onUsage={() => setUsageEntry(entry)}
                onEditPerson={() => {
                  const p = findPerson(state, entry.personId);
                  if (p) setEditPerson(p);
                }}
                onShortage={(usageId) => setShortageFor(usageId)}
                actor={actorName}
                correctionReason={correctionReason}
              />
            ))}
          </div>
        )}

        {orphanUsages.length > 0 ? (
          <div className="mt-3 space-y-2 rounded-2xl border border-amber-200 bg-amber-50/60 p-3 dark:border-amber-900/40 dark:bg-amber-900/20">
            <div className="text-[11px] font-extrabold text-amber-800 dark:text-amber-300">
              استخدامات مسجّلة بدون صف في ترتيب اليوم ({orphanUsages.length}) — السجل محفوظ ولا يُحذف
            </div>
            {orphanUsages.map((u) => (
              <div key={u.id} className="rounded-xl bg-white px-3 py-2 text-[11px] dark:bg-slate-800">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-extrabold text-gray-800 dark:text-white">
                    {personName(state, u.personId)}
                  </span>
                  <Pill tone="gray">{u.startTime} → {u.endTime}</Pill>
                  <Pill tone="blue">{formatDuration(u.minutes)}</Pill>
                  <Pill tone={u.dieselSettlement === "paid" ? "green" : u.dieselSettlement === "shortage" ? "amber" : "red"}>
                    ديزل: {dieselSettlementLabel(u.dieselSettlement)}
                  </Pill>
                  <Pill tone={u.royaltyPayMode === "cash" ? "green" : "amber"}>
                    رواسة: {royaltyModeLabel(u.royaltyPayMode)}
                  </Pill>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  <SettlementChips
                    usage={u}
                    actor={actorName}
                    onShortage={() => setShortageFor(u.id)}
                  />
                </div>
              </div>
            ))}
          </div>
        ) : null}

        <div className="mt-3 flex flex-wrap gap-2">
          <Button className="flex-1" onClick={() => setPickerOpen(true)}>
            <Plus size={18} /> إضافة شخص للدوام الفعلي
          </Button>
          {baseRows.length > 0 ? (
            <Button
              variant="secondary"
              onClick={() => actions.applyBaseRosterToDay(day.id, { actor: actorName })}
              title="ملء الدوام الفعلي من كشف الديالة بنفس الترتيب والنصيب"
              data-testid="day-start-from-base"
            >
              <RefreshCcw size={16} /> ابدأ من كشف الديالة ({baseRows.length})
            </Button>
          ) : null}
        </div>
        <p className="mt-2 text-[10px] leading-relaxed text-gray-400">
          «الدوام الفعلي» يُعدَّل بحرية: من أخذ ماءه أو قاسم أسهم هذا اليوم — تقديم/تأخير نصيب، إضافة ضيف، بيع أو سلفة
          أو غيرها. التعديل لا يغيّر «كشف الدوام الأساسي» ولا أي يوم آخر، وكل خيار تسديد يُسجَّل كحركة مالية وسجل تدقيق.
        </p>
      </Card>

      <Card className="p-4">
        <div className="mb-3 flex items-center gap-2">
          <Wrench size={16} className="text-emerald-600" />
          <h2 className="text-sm font-extrabold text-gray-800 dark:text-white">التوقفات</h2>
          <button
            onClick={() => setStoppageOpen(true)}
            className="mr-auto rounded-xl bg-emerald-50 px-3 py-1.5 text-[11px] font-bold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
          >
            + تسجيل توقف
          </button>
        </div>
        {stoppages.length === 0 ? (
          <p className="text-xs text-gray-400">لا توجد توقفات مسجّلة لهذا اليوم.</p>
        ) : (
          <div className="space-y-2">
            {stoppages.map((s) => (
              <div
                key={s.id}
                className="flex items-center gap-2 rounded-2xl bg-amber-50 px-3 py-2 text-[11px] font-bold text-amber-800 dark:bg-amber-900/20 dark:text-amber-300"
              >
                <span className="flex-1">
                  {s.reason || stoppageLabel(s.kind)} · {s.startTime} → {s.endTime} ({formatDuration(s.minutes)})
                </span>
                <button
                  onClick={() =>
                    actions.archiveStoppage(s.id, true, {
                      reason: correctionReason || "أرشفة توقف (حذف ناعم)",
                      actor: actorName,
                    })
                  }
                  className="rounded-lg bg-white/70 p-1 text-amber-700 dark:bg-slate-800"
                  aria-label="أرشفة التوقف"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>

      {allIssues.length > issues.length ? (
        <p className="px-2 text-[10px] text-gray-400">
          يوجد {allIssues.length - issues.length} تحذير تم تجاوزه بسبب موثّق — يمكنك رؤية السبب في سجل التدقيق.
        </p>
      ) : null}

      <PersonPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        pumpId={pump.id}
        title="إضافة مستخدم إلى اليوم الفعلي"
        onSelect={(person, role) => {
          const last = entries[entries.length - 1];
          const startMin = last ? timeToMinutes(last.endTime) : timeToMinutes(day.workStart);
          const shareholder = shareholderOfPerson(state, pump.id, person.id);
          const fallbackMin = shareholder?.baseHoursMin || 60;
          const entry: DayEntry = {
            id: uid("en"),
            dayId: day.id,
            pumpId: pump.id,
            orderIndex: entries.length,
            personId: person.id,
            role: role as EntryRole,
            shareholderId: shareholder?.id ?? null,
            rightId: null,
            startTime: minutesToTime(startMin),
            endTime: minutesToTime(startMin + fallbackMin),
            plannedMin: fallbackMin,
            actualPersonId: null,
            usageId: null,
            status: "planned",
            postponeToDayId: null,
            reason: "",
            notes: "",
            createdAt: new Date().toISOString(),
            createdBy: "manager",
            archived: false,
          };
          actions.saveEntry(entry, true);
        }}
      />

      {editEntry ? (
        <EntryEditor
          entry={editEntry}
          onClose={() => setEditEntry(null)}
          pumpId={pump.id}
          correctionReason={correctionReason}
          actor={actorName}
        />
      ) : null}

      {usageEntry ? (
        <UsageModal
          entry={usageEntry}
          dayId={day.id}
          onClose={() => setUsageEntry(null)}
          actor={actorName}
          correctionReason={correctionReason}
        />
      ) : null}

      {shortageFor ? (
        <ShortageModal
          usageId={shortageFor}
          actor={actorName}
          onClose={() => setShortageFor(null)}
        />
      ) : null}

      {editPerson ? (
        <PersonQuickModal person={editPerson} onClose={() => setEditPerson(null)} />
      ) : null}

      {stoppageOpen ? (
        <StoppageModal
          dayId={day.id}
          date={day.date}
          onClose={() => setStoppageOpen(false)}
          correctionReason={correctionReason}
          actor={actorName}
        />
      ) : null}

      <Modal open={!!ackIssue} onClose={() => setAckIssue(null)} title="تجاوز التعارض بسبب موثّق">
        <AckForm
          message={ackIssue?.message ?? ""}
          onSubmit={(reason) => {
            if (!ackIssue) return;
            actions.ackConflict({
              id: uid("ack"),
              pumpId: pump.id,
              dayId: day.id,
              kind: ackIssue.kind,
              key: ackIssue.key,
              reason,
              byUser: actorName,
              at: new Date().toISOString(),
            });
            setAckIssue(null);
          }}
        />
      </Modal>

      <Modal open={reopenOpen} onClose={() => setReopenOpen(false)} title="إعادة فتح اليوم">
        <AckForm
          message="إعادة الفتح تُسجَّل باسمك مع التاريخ والوقت والسبب، وتظهر كل التعديلات اللاحقة في سجل التدقيق."
          onSubmit={(reason) => {
            actions.reopenDay(day.id, actorName, reason);
            setReopenOpen(false);
          }}
          label="سبب إعادة الفتح"
        />
      </Modal>

      <Card className="p-3">
        <Field label="اسمك في السجلات (المسؤول)">
          <TextInput value={actorName} onChange={(e) => setActorName(e.target.value)} />
        </Field>
      </Card>
    </div>
  );
}

/* ------------------------------ عناصر صغيرة ----------------------------- */

function MiniStat({
  label,
  value,
  tone = "green",
}: {
  label: string;
  value: string;
  tone?: "green" | "red" | "amber" | "gray";
}) {
  return (
    <div className="rounded-2xl bg-gray-50 px-2 py-2 dark:bg-slate-700">
      <div className="text-[10px] font-bold text-gray-400">{label}</div>
      <div
        className={cx(
          "mt-0.5 text-xs font-extrabold",
          tone === "green" && "text-emerald-700 dark:text-emerald-300",
          tone === "red" && "text-red-600 dark:text-red-400",
          tone === "amber" && "text-amber-600 dark:text-amber-400",
          tone === "gray" && "text-gray-700 dark:text-slate-200"
        )}
      >
        {value}
      </div>
    </div>
  );
}

function SettlementSummary({
  totals,
  currency,
}: {
  totals: ReturnType<typeof daySettlementTotals>;
  currency: Currency;
}) {
  return (
    <div className="grid grid-cols-2 gap-2" data-testid="day-settlement-summary">
      <div className="rounded-2xl bg-gray-50 p-3 dark:bg-slate-700">
        <div className="flex items-center gap-1.5 text-[11px] font-extrabold text-gray-700 dark:text-slate-200">
          <Fuel size={13} className="text-emerald-600" /> الديزل
        </div>
        <div className="mt-1.5 space-y-0.5 text-[11px]">
          <Row label="الاستحقاق" value={formatMoney(totals.dieselDue, currency)} />
          <Row label="مُسدَّد" value={formatMoney(totals.dieselPaid, currency)} tone="green" />
          <Row
            label={`نقص${totals.shortageLiters > 0 ? ` (${formatNumber(totals.shortageLiters)} لتر)` : ""}`}
            value={`${formatMoney(totals.shortageAmount, currency)} · ${totals.shortageCount}`}
            tone={totals.shortageAmount > 0 ? "amber" : "gray"}
          />
          <Row
            label={`غير مسدد · ${totals.unpaidCount}`}
            value={formatMoney(Math.max(0, totals.dieselOwed - totals.shortageAmount), currency)}
            tone={totals.unpaidCount > 0 ? "red" : "gray"}
          />
        </div>
      </div>
      <div className="rounded-2xl bg-gray-50 p-3 dark:bg-slate-700">
        <div className="flex items-center gap-1.5 text-[11px] font-extrabold text-gray-700 dark:text-slate-200">
          <HandCoins size={13} className="text-emerald-600" /> رسوم الرواسة
        </div>
        <div className="mt-1.5 space-y-0.5 text-[11px]">
          <Row label="المستحق" value={formatMoney(totals.royaltyDue, currency)} />
          <Row
            label={`نقد · ${totals.cashCount}`}
            value={formatMoney(totals.royaltyCash, currency)}
            tone="green"
          />
          <Row
            label={`أجل · ${totals.creditCount}`}
            value={formatMoney(totals.royaltyCredit, currency)}
            tone={totals.creditCount > 0 ? "amber" : "gray"}
          />
          <Row label="المستخدمون" value={`${totals.users}`} />
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  tone = "gray",
}: {
  label: string;
  value: string;
  tone?: "green" | "amber" | "red" | "gray";
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-gray-400">{label}</span>
      <span
        className={cx(
          "font-extrabold",
          tone === "green" && "text-emerald-700 dark:text-emerald-300",
          tone === "amber" && "text-amber-600 dark:text-amber-400",
          tone === "red" && "text-red-600 dark:text-red-400",
          tone === "gray" && "text-gray-700 dark:text-slate-200"
        )}
      >
        {value}
      </span>
    </div>
  );
}

function DaySelector({ date, onChange }: { date: string; onChange: (d: string) => void }) {
  return (
    <Card className="flex items-center gap-2 p-3">
      <button
        onClick={() => onChange(addDaysISO(date, -1))}
        className="rounded-xl bg-gray-100 p-2 text-gray-600 dark:bg-slate-700 dark:text-slate-200"
        aria-label="اليوم السابق"
      >
        <ChevronRight size={16} />
      </button>
      <div className="flex-1">
        <input
          type="date"
          value={date}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-center text-xs font-bold text-gray-700 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
          aria-label="تاريخ اليوم الفعلي"
        />
      </div>
      <button
        onClick={() => onChange(addDaysISO(date, 1))}
        className="rounded-xl bg-gray-100 p-2 text-gray-600 dark:bg-slate-700 dark:text-slate-200"
        aria-label="اليوم التالي"
      >
        <ChevronLeft size={16} />
      </button>
      <button
        onClick={() => onChange(todayISO())}
        className="rounded-xl bg-emerald-50 px-3 py-2 text-[11px] font-bold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
      >
        اليوم
      </button>
    </Card>
  );
}

/* ---------------------- الديالة: أم أيام المساهمة ---------------------- */

/**
 * شريط أيام الديالة: اليوم الأول، الثاني… حتى آخر يوم.
 * لا يوجد يوم فعلي خارج الديالة — الضغط على أي يوم يفتحه أو يُنشئه داخل ديالته.
 */
function DialaStrip({
  date,
  dayId,
  onOpenDay,
}: {
  date: string;
  dayId?: string | null;
  onOpenDay: (id: string | null) => void;
}) {
  const { state, actions } = useApp();
  const pump = state.pump!;
  const selected = dayId ? state.days.find((d) => d.id === dayId) ?? null : null;
  const round = selected ? roundOfDay(state, selected) : roundForDate(state, date);
  if (!round) return null;

  const dates = roundDates(round.startDate, round.days);
  const index = dates.indexOf(date);

  const openOrCreate = (target: string) => {
    const existing = state.days.find((d) => !d.archived && d.date === target);
    if (existing) {
      onOpenDay(existing.id);
      return;
    }
    const id = uid("day");
    actions.createDay(
      {
        id,
        pumpId: pump.id,
        dialaNumber: round.number,
        roundId: round.id,
        date: target,
        status: "draft",
        workStart: pump.workStart,
        workEnd: pump.workEnd,
        capacityMin: durationMin(pump.workStart, pump.workEnd),
        plannedWorkStart: pump.workStart,
        plannedWorkEnd: pump.workEnd,
        plannedCapacityMin: durationMin(pump.workStart, pump.workEnd),
        notes: "",
        openedBy: "manager",
        closedBy: "",
        closedAt: "",
        reopenedBy: "",
        reopenedAt: "",
        reopenReason: "",
        revision: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        archived: false,
      },
      true,
      []
    );
    onOpenDay(id);
  };

  return (
    <Card className="p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <Layers size={15} className="text-emerald-600" />
        <span className="text-xs font-extrabold text-gray-800 dark:text-white">ديالة {round.number}</span>
        <Pill tone="gray">{round.days} أيام</Pill>
        <Pill tone={round.locked ? "green" : "amber"}>
          {round.locked ? (
            <>
              <Lock size={10} /> محفوظة
            </>
          ) : (
            "غير محفوظة"
          )}
        </Pill>
        {index >= 0 ? <Pill tone="blue">اليوم {dayOrdinal(index + 1)} من الديالة</Pill> : null}
        <span className="mr-auto text-[10px] text-gray-400">
          {isoToShort(round.startDate)} ← {isoToShort(round.endDate)}
        </span>
      </div>

      <div className="mt-2 flex gap-1 overflow-x-auto pb-1">
        {dates.map((d, i) => {
          const day = state.days.find((x) => !x.archived && x.date === d) ?? null;
          const isActive = index === i;
          return (
            <button
              key={d}
              onClick={() => openOrCreate(d)}
              aria-label={`اليوم ${dayOrdinal(i + 1)} للديالة ${round.number}`}
              title={
                day
                  ? `اليوم ${dayOrdinal(i + 1)} للديالة ${round.number} — ${isoToDisplay(d)} (${statusLabelOf(day.status)})`
                  : `إنشاء اليوم ${dayOrdinal(i + 1)} للديالة ${round.number} — ${isoToDisplay(d)}`
              }
              className={cx(
                "min-w-[74px] shrink-0 rounded-xl border px-2 py-1.5 text-center text-[10px] font-bold transition",
                isActive
                  ? "border-emerald-400 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                  : day
                    ? dayChipTone(day.status)
                    : "border-dashed border-gray-200 text-gray-400 dark:border-slate-600 dark:text-slate-400"
              )}
            >
              <span className="block">اليوم {dayOrdinal(i + 1)}</span>
              <span className="block text-[9px] font-normal opacity-70">{isoToShort(d)}</span>
              <span className="block text-[9px] font-bold opacity-80">
                {day ? statusLabelOf(day.status) : "غير مُنشأ"}
              </span>
            </button>
          );
        })}
      </div>

      <p className="mt-1.5 text-[10px] leading-relaxed text-gray-400">
        أيام الديالة تُسمّى اليوم الأول، الثاني… حتى آخر يوم ({dayOrdinal(round.days)})، ثم يعود الدوران بديالة جديدة
        من اليوم الأول. لا يوجد يوم فعلي خارج الديالة.
        {round.locked
          ? " أيام الديالة محفوظة: لا تُحذف ولا تُؤرشف إلا بفك الحفظ بسبب موثّق."
          : ""}
      </p>

      {!round.locked ? (
        <button
          onClick={() => actions.lockRound(round.id, "manager")}
          aria-label={`حفظ أيام ديالة ${round.number}`}
          className="mt-2 w-full rounded-xl bg-emerald-600 px-3 py-2 text-[11px] font-bold text-white"
        >
          <ShieldCheck size={13} className="inline -mt-0.5" /> حفظ أيام الديالة حتى لا تُحذف بسهولة
        </button>
      ) : null}
    </Card>
  );
}

function statusLabelOf(status: string): string {
  const map: Record<string, string> = {
    scheduled: "مجدول",
    draft: "مسودة",
    in_progress: "جارٍ التنفيذ",
    completed: "مكتمل",
    closed: "مغلق",
    revised: "معدّل",
  };
  return map[status] ?? status;
}

function dayChipTone(status: string): string {
  const map: Record<string, string> = {
    scheduled: "border-gray-200 bg-gray-50 text-gray-500 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300",
    draft:
      "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-300",
    in_progress:
      "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/40 dark:bg-sky-900/20 dark:text-sky-300",
    completed:
      "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-900/20 dark:text-emerald-300",
    closed:
      "border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
    revised:
      "border-amber-300 bg-amber-100 text-amber-800 dark:border-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  };
  return map[status] ?? map.scheduled;
}

/* ----------------------- صف المستخدم + خيارات التسديد ------------------- */

function SettlementChips({
  usage,
  actor,
  onShortage,
  disabled,
  onNeedUsage,
}: {
  usage: {
    id: string;
    dieselSettlement: DieselSettlement;
    dieselShortageLiters: number;
    royaltyPayMode: RoyaltyPayMode;
  };
  actor: string;
  onShortage: () => void;
  disabled?: boolean;
  onNeedUsage?: () => void;
}) {
  const { actions } = useApp();
  const apply = (patch: { dieselSettlement?: DieselSettlement; royaltyPayMode?: RoyaltyPayMode }) => {
    actions.setUsageSettlement(usage.id, {
      dieselSettlement: patch.dieselSettlement ?? usage.dieselSettlement,
      dieselShortageLiters:
        patch.dieselSettlement && patch.dieselSettlement !== "shortage" ? 0 : usage.dieselShortageLiters,
      royaltyPayMode: patch.royaltyPayMode ?? usage.royaltyPayMode,
      settlementNote: "",
      reason: "تعديل من شاشة اليوم الفعلي",
      actor,
    });
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-1">
        <span className="text-[10px] font-bold text-gray-400">
          <Fuel size={11} className="inline -mt-0.5" /> الديزل
        </span>
        {DIESEL_SETTLEMENT_OPTIONS.map((o) => (
          <button
            key={o.id}
            title={o.action}
            disabled={disabled}
            onClick={() => {
              if (disabled) {
                onNeedUsage?.();
                return;
              }
              if (o.id === "shortage") onShortage();
              else apply({ dieselSettlement: o.id });
            }}
            className={cx(
              "rounded-xl border px-2 py-1 text-[10px] font-bold transition",
              usage.dieselSettlement === o.id
                ? o.id === "paid"
                  ? "border-emerald-400 bg-emerald-50 text-emerald-700"
                  : o.id === "shortage"
                    ? "border-amber-400 bg-amber-50 text-amber-700"
                    : "border-red-300 bg-red-50 text-red-600"
                : "border-gray-200 text-gray-500 hover:border-emerald-200 dark:border-slate-600 dark:text-slate-300"
            )}
            aria-label={`حالة الديزل: ${o.label}`}
          >
            {o.label}
            {o.id === "shortage" && usage.dieselSettlement === "shortage" && usage.dieselShortageLiters > 0
              ? ` (${formatNumber(usage.dieselShortageLiters)} ل)`
              : ""}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-1">
        <span className="text-[10px] font-bold text-gray-400">
          <HandCoins size={11} className="inline -mt-0.5" /> الرواسة
        </span>
        {ROYALTY_MODE_OPTIONS.map((o) => (
          <button
            key={o.id}
            title={o.action}
            disabled={disabled}
            onClick={() => {
              if (disabled) {
                onNeedUsage?.();
                return;
              }
              apply({ royaltyPayMode: o.id });
            }}
            className={cx(
              "rounded-xl border px-2 py-1 text-[10px] font-bold transition",
              usage.royaltyPayMode === o.id
                ? o.id === "cash"
                  ? "border-emerald-400 bg-emerald-50 text-emerald-700"
                  : "border-amber-400 bg-amber-50 text-amber-700"
                : "border-gray-200 text-gray-500 hover:border-emerald-200 dark:border-slate-600 dark:text-slate-300"
            )}
            aria-label={`سداد الرواسة: ${o.label}`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </>
  );
}

function EntryRow({
  index,
  entry,
  fromBaseRoster,
  isFirst,
  isLast,
  onEdit,
  onUsage,
  onEditPerson,
  onShortage,
  actor,
  correctionReason = "",
}: {
  index: number;
  entry: DayEntry;
  /** هل هذا الشخص من كشف الدوام الأساسي لديالة هذا اليوم */
  fromBaseRoster: boolean;
  isFirst: boolean;
  isLast: boolean;
  onEdit: () => void;
  onUsage: () => void;
  onEditPerson: () => void;
  onShortage: (usageId: string) => void;
  actor: string;
  correctionReason?: string;
}) {
  const { state, actions } = useApp();
  const pump = state.pump!;
  const person = findPerson(state, entry.personId);
  const actual = entry.actualPersonId ? findPerson(state, entry.actualPersonId) : null;
  const minutes = entryMinutes(entry);
  const overnight = entry.startTime && entry.endTime && isOvernight(entry.startTime, entry.endTime);
  const usage = entry.usageId ? state.usages.find((u) => u.id === entry.usageId) ?? null : null;
  const activeShift = usage && usage.status === "active" ? usage : null;

  const usageBalance = useMemo(() => {
    if (!activeShift) return 0;
    return state.transactions
      .filter((t) => t.usageId === activeShift.id && t.status === "posted")
      .reduce((s, t) => s + (t.direction === "debit" ? t.amount : -t.amount), 0);
  }, [state.transactions, activeShift]);

  return (
    <div
      className="rounded-2xl border border-gray-100 p-3 dark:border-slate-700"
      data-testid={`day-user-${entry.id}`}
    >
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-xs font-black text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
          {index + 1}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="truncate text-sm font-extrabold text-gray-900 dark:text-white">
              {person?.name ?? "—"}
            </span>
            <Pill tone={entry.role === "shareholder" ? "green" : entry.role === "tenant" ? "amber" : "gray"}>
              {roleLabel(entry.role)}
            </Pill>
            {fromBaseRoster ? (
              <Pill tone="blue">من كشف الديالة</Pill>
            ) : (
              <Pill tone="gray">{entry.role === "guest" ? "ضيف — لهذا اليوم فقط" : "لهذا اليوم فقط"}</Pill>
            )}
            {usage ? (
              <Pill tone="blue">
                <CheckCircle2 size={11} /> {usageTypeLabel(usage.usageType)}
              </Pill>
            ) : (
              <Pill tone="gray">لم يُسجَّل استخدام بعد</Pill>
            )}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-gray-400">
            <button
              onClick={onEditPerson}
              className="flex items-center gap-1 rounded-lg bg-gray-50 px-1.5 py-0.5 font-bold text-gray-500 dark:bg-slate-700 dark:text-slate-300"
              aria-label={`تعديل اسم ورقم ${person?.name ?? ""}`}
            >
              <Phone size={11} /> {person?.phone || "إضافة رقم"}
              <Pencil size={10} />
            </button>
            <span>
              {entry.startTime} → {entry.endTime} · {formatDuration(minutes)}
              {overnight ? " · يعبر منتصف الليل" : ""}
            </span>
          </div>
          {actual && actual.id !== entry.personId ? (
            <div className="mt-0.5 flex items-center gap-1 text-[11px] font-bold text-amber-600">
              <UserCheck size={11} /> المستخدم الفعلي: {actual.name}
            </div>
          ) : null}
        </div>
        <div className="flex shrink-0 flex-col gap-1">
          <div className="flex gap-1">
            <button
              onClick={() => actions.moveEntry(entry.id, -1)}
              disabled={isFirst}
              className="rounded-lg bg-gray-100 p-1.5 text-gray-600 disabled:opacity-30 dark:bg-slate-700 dark:text-slate-200"
              aria-label="تقديم المستخدم"
            >
              <ArrowUp size={13} />
            </button>
            <button
              onClick={() => actions.moveEntry(entry.id, 1)}
              disabled={isLast}
              className="rounded-lg bg-gray-100 p-1.5 text-gray-600 disabled:opacity-30 dark:bg-slate-700 dark:text-slate-200"
              aria-label="تأخير المستخدم"
            >
              <ArrowDown size={13} />
            </button>
          </div>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-start gap-x-3 gap-y-1.5 rounded-2xl bg-gray-50 px-2.5 py-2 dark:bg-slate-700/50">
        {activeShift ? (
          <SettlementChips
            usage={activeShift}
            actor={actor}
            onShortage={() => onShortage(activeShift.id)}
          />
        ) : (
          <button
            onClick={onUsage}
            className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300"
          >
            سجّل الاستخدام أولًا لتحديد تسديد الديزل والرواسة (مسدد / نقص / غير مسدد · نقد / أجل)
          </button>
        )}
        {activeShift ? (
          <span
            className={cx(
              "rounded-xl px-2 py-1 text-[10px] font-bold",
              usageBalance > 0
                ? "bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-300"
                : "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
            )}
          >
            {usageBalance > 0
              ? `يبقى عليه: ${formatMoney(usageBalance, pump.currency)}`
              : "مسدَّد بالكامل"}
          </span>
        ) : null}
      </div>

      {activeShift ? (
        <div className="mt-1.5 flex flex-wrap gap-x-2 gap-y-1 text-[10px] text-gray-400">
          <span>
            ديزل: {activeShift.fuelLiters} لتر × {activeShift.fuelPriceSnapshot} ={" "}
            {formatMoney(activeShift.fuelAmountDue, pump.currency)}
          </span>
          {activeShift.dieselSettlement === "shortage" ? (
            <span className="font-bold text-amber-600">
              نقص {formatNumber(activeShift.dieselShortageLiters)} لتر ={" "}
              {formatMoney(shortageAmountOf(activeShift), pump.currency)}
            </span>
          ) : null}
          <span>رواسة: {formatMoney(activeShift.royaltyAmountDue, pump.currency)}</span>
        </div>
      ) : null}

      <div className="mt-2 flex flex-wrap gap-1.5">
        <button
          onClick={onUsage}
          className="rounded-xl bg-emerald-600 px-3 py-1.5 text-[11px] font-bold text-white"
        >
          <PlayCircle size={13} className="inline -mt-0.5" /> {usage ? "تعديل الاستخدام" : "تسجيل الاستخدام الفعلي"}
        </button>
        <button
          onClick={onEdit}
          className="rounded-xl bg-gray-100 px-3 py-1.5 text-[11px] font-bold text-gray-600 dark:bg-slate-700 dark:text-slate-200"
        >
          <Pencil size={12} className="inline -mt-0.5" /> تعديل
        </button>
        <button
          onClick={() =>
            actions.removeEntry(entry.id, {
              reason: correctionReason || "إزالة من اليوم (حذف ناعم)",
              actor,
            })
          }
          className="rounded-xl bg-red-50 px-3 py-1.5 text-[11px] font-bold text-red-600 dark:bg-red-900/30 dark:text-red-300"
        >
          <Trash2 size={12} className="inline -mt-0.5" /> إزالة
        </button>
        {entry.actualPersonId && entry.actualPersonId !== entry.personId ? (
          <span className="rounded-xl bg-amber-50 px-3 py-1.5 text-[11px] font-bold text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
            حامل الحق مختلف عن المستخدم
          </span>
        ) : null}
      </div>
    </div>
  );
}

/* ------------------------- نوافذ التعديل والتسديد ---------------------- */

function ShortageModal({
  usageId,
  actor,
  onClose,
}: {
  usageId: string;
  actor: string;
  onClose: () => void;
}) {
  const { state, actions } = useApp();
  const pump = state.pump!;
  const usage = state.usages.find((u) => u.id === usageId);
  const [liters, setLiters] = useState(
    usage?.dieselShortageLiters || Math.max(0, Math.round((usage?.fuelLiters ?? 0) * 0.1 * 100) / 100)
  );
  const [reason, setReason] = useState("");

  if (!usage) return null;
  const amount = Math.round(liters * (usage.fuelPriceSnapshot || 0));
  const paidPart = Math.max(0, Math.round(usage.fuelAmountDue) - Math.min(amount, Math.round(usage.fuelAmountDue)));

  return (
    <Modal open onClose={onClose} title="تسجيل نقص الديزل">
      <div className="space-y-3">
        <p className="rounded-2xl bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
          {personName(state, usage.personId)} — الاستهلاك المحسوب {usage.fuelLiters} لتر بقيمة{" "}
          {formatMoney(usage.fuelAmountDue, pump.currency)}. عند اختيار «نقص» يُسجَّل النقص فقط دينًا عليه، ويُسجَّل
          الباقي كسداد.
        </p>
        <Field label="عدد لترات النقص">
          <NumberInput value={liters} onChange={(e) => setLiters(Number(e.target.value))} />
        </Field>
        <div className="grid grid-cols-2 gap-2 rounded-2xl bg-gray-50 p-3 text-[11px] dark:bg-slate-700">
          <Row label="قيمة النقص (دين)" value={formatMoney(Math.min(amount, usage.fuelAmountDue), pump.currency)} tone="amber" />
          <Row label="المسدد من الديزل" value={formatMoney(paidPart, pump.currency)} tone="green" />
          <Row label="سعر اللتر وقت العملية" value={`${usage.fuelPriceSnapshot}`} />
          <Row label="لتر/ساعة وقت العملية" value={`${usage.fuelPerHourSnapshot}`} />
        </div>
        <Field label="سبب / ملاحظة النقص">
          <TextInput
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="مثال: لم يكفِ الديزل لتغطية الساعات"
          />
        </Field>
        <Button
          className="w-full"
          onClick={() => {
            actions.setUsageSettlement(usage.id, {
              dieselSettlement: "shortage",
              dieselShortageLiters: liters,
              royaltyPayMode: usage.royaltyPayMode,
              settlementNote: reason,
              reason: reason || "تسجيل نقص الديزل",
              actor,
            });
            onClose();
          }}
        >
          <Fuel size={16} /> حفظ حالة النقص
        </Button>
      </div>
    </Modal>
  );
}

function PersonQuickModal({ person, onClose }: { person: Person; onClose: () => void }) {
  const { actions } = useApp();
  const [name, setName] = useState(person.name);
  const [phone, setPhone] = useState(person.phone);
  const [notes, setNotes] = useState(person.notes);

  return (
    <Modal open onClose={onClose} title="اسم المستخدم ورقمه">
      <div className="space-y-3">
        <Field label="الاسم">
          <TextInput value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </Field>
        <Field label="رقم الهاتف">
          <TextInput
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            dir="ltr"
            className="text-left"
            placeholder="7XXXXXXXX"
          />
        </Field>
        <Field label="ملاحظات">
          <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </Field>
        <Button
          className="w-full"
          disabled={!name.trim()}
          onClick={() => {
            actions.savePerson({ ...person, name: name.trim(), phone: phone.trim(), notes: notes.trim() }, false);
            onClose();
          }}
        >
          <ShieldCheck size={16} /> حفظ
        </Button>
      </div>
    </Modal>
  );
}

function EntryEditor({
  entry,
  onClose,
  pumpId,
  correctionReason = "",
  actor = "manager",
}: {
  entry: DayEntry;
  onClose: () => void;
  pumpId: string;
  correctionReason?: string;
  actor?: string;
}) {
  const { state, actions } = useApp();
  const [form, setForm] = useState<DayEntry>(entry);
  const [picking, setPicking] = useState<"person" | "actual" | null>(null);
  const minutes = durationMin(form.startTime, form.endTime);

  const set = <K extends keyof DayEntry>(key: K, value: DayEntry[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  return (
    <Modal open onClose={onClose} title="تعديل صف اليوم الفعلي">
      <div className="space-y-3">
        <Field label="الشخص صاحب الدور">
          <button
            onClick={() => setPicking("person")}
            className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-right text-sm font-bold text-gray-800 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
          >
            {personName(state, form.personId)}
          </button>
        </Field>

        <Field label="صفته">
          <Select value={form.role} onChange={(e) => set("role", e.target.value as EntryRole)}>
            <option value="shareholder">مساهم أساسي</option>
            <option value="right_holder">صاحب حق</option>
            <option value="tenant">مستأجر</option>
            <option value="guest">ضيف / ليس له سهم</option>
            <option value="other">أخرى</option>
          </Select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="البداية">
            <TimeInput
              value={form.startTime}
              onChange={(e) => {
                const start = e.target.value;
                setForm((f) => ({
                  ...f,
                  startTime: start,
                  endTime: minutesToTime(timeToMinutes(start) + (f.plannedMin || minutes || 60)),
                }));
              }}
            />
          </Field>
          <Field label="النهاية">
            <TimeInput
              value={form.endTime}
              onChange={(e) => {
                const end = e.target.value;
                setForm((f) => ({
                  ...f,
                  endTime: end,
                  plannedMin: durationMin(f.startTime, end),
                }));
              }}
            />
          </Field>
        </div>

        <div className="rounded-2xl bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
          المدة: {formatDuration(minutes)} {isOvernight(form.startTime, form.endTime) ? "(يعبر منتصف الليل)" : ""}
        </div>

        <Field label="المستخدم الفعلي (إن اختلف عن صاحب الدور)" hint="اتركه فارغًا إذا أخذ صاحب الدور الماء بنفسه">
          <button
            onClick={() => setPicking("actual")}
            className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-right text-sm font-bold text-gray-800 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
          >
            {form.actualPersonId ? personName(state, form.actualPersonId) : "نفس صاحب الدور"}
          </button>
        </Field>
        {form.actualPersonId ? (
          <button
            onClick={() => set("actualPersonId", null)}
            className="text-[11px] font-bold text-red-500"
          >
            إزالة المستخدم الفعلي
          </button>
        ) : null}

        <Field label="حالة الصف">
          <Select value={form.status} onChange={(e) => set("status", e.target.value as DayEntry["status"])}>
            <option value="planned">مخطط</option>
            <option value="done">تم</option>
            <option value="postponed">مؤجل</option>
            <option value="cancelled">ملغى</option>
          </Select>
        </Field>

        <Field label="سبب التأجيل / الإلغاء">
          <TextInput value={form.reason} onChange={(e) => set("reason", e.target.value)} placeholder="اختياري" />
        </Field>
        <Field label="ملاحظات">
          <TextArea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2} />
        </Field>

        <div className="flex gap-2">
          <Button variant="ghost" className="flex-1" onClick={onClose}>
            إلغاء
          </Button>
          <Button
            className="flex-1"
            onClick={() => {
              actions.saveEntry({ ...form, plannedMin: minutes }, false, {
                correctionReason:
                  correctionReason || (form.reason ? `سبب الصف: ${form.reason}` : ""),
                actor,
              });
              onClose();
            }}
          >
            <ShieldCheck size={16} /> حفظ التعديل
          </Button>
        </div>
      </div>

      {picking ? (
        <PersonPicker
          open
          onClose={() => setPicking(null)}
          pumpId={pumpId}
          title={picking === "person" ? "اختيار صاحب الدور" : "اختيار المستخدم الفعلي"}
          onSelect={(person) => {
            if (picking === "person") {
              const right = state.rights.find(
                (r) => r.holderPersonId === person.id && r.pumpId === pumpId && r.status === "active"
              );
              const shareholder = shareholderOfPerson(state, pumpId, person.id);
              setForm((f) => ({
                ...f,
                personId: person.id,
                shareholderId: shareholder?.id ?? f.shareholderId,
                rightId: right?.id ?? null,
                role: right ? (right.kind === "rent" ? "tenant" : "right_holder") : shareholder ? "shareholder" : "guest",
              }));
            } else {
              setForm((f) => ({ ...f, actualPersonId: person.id }));
            }
          }}
        />
      ) : null}
    </Modal>
  );
}

function UsageModal({
  entry,
  dayId,
  onClose,
  actor,
  correctionReason = "",
}: {
  entry: DayEntry;
  dayId: string;
  onClose: () => void;
  actor: string;
  correctionReason?: string;
}) {
  const { state, actions } = useApp();
  const pump = state.pump!;
  const day = state.days.find((d) => d.id === dayId)!;
  const existing = entry.usageId ? state.usages.find((u) => u.id === entry.usageId) : null;
  const [startTime, setStartTime] = useState(existing?.startTime ?? entry.startTime ?? nowTime());
  const [endTime, setEndTime] = useState(existing?.endTime ?? entry.endTime ?? minutesToTime(timeToMinutes(nowTime()) + 60));
  const [personId, setPersonId] = useState(existing?.personId ?? entry.actualPersonId ?? entry.personId);
  const [usageType, setUsageType] = useState<UsageType>(existing?.usageType ?? "share");
  const [dieselSettlement, setDieselSettlement] = useState<DieselSettlement>(
    existing?.dieselSettlement ?? "unpaid"
  );
  const [shortageLiters, setShortageLiters] = useState(existing?.dieselShortageLiters ?? 0);
  const [royaltyPayMode, setRoyaltyPayMode] = useState<RoyaltyPayMode>(existing?.royaltyPayMode ?? "credit");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [reason, setReason] = useState("");
  const [picking, setPicking] = useState(false);
  /** سعر الديزل الشخصي لهذه العملية (§9) — لا يُستخدم سعر المضخة لتكلفة المستخدم */
  const [personalFuelPrice, setPersonalFuelPrice] = useState(
    existing?.personalFuelPriceSnapshot ?? 0
  );
  /** تأكيد التجاوز/التداخل بعد عرضه (§7) */
  const [overlapAck, setOverlapAck] = useState(false);

  const window = pumpWindow(pump, day);
  const stoppageMin = stoppageMinutesInRange(
    state,
    day.id,
    startTime,
    endTime,
    timeToMinutes(window.start),
    window.capacityMin
  );
  const draft = computeUsageDraft(pump, day, startTime, endTime, { personalFuelPrice, stoppageMin });
  const shareholder = shareholderOfPerson(state, pump.id, personId);
  const right = shareholder ? currentRight(state, shareholder.id, day.date) : null;
  const overlaps = overlapsFor(state, day, pump, startTime, endTime, existing?.id ?? null);
  const breakdown = capacityBreakdown(state, day, pump, draft.minutes, existing?.id ?? null);
  const usedPrice = draft.personalFuelPriceSnapshot > 0 ? draft.personalFuelPriceSnapshot : draft.fuelPriceSnapshot;
  const shortageAmount = Math.min(
    Math.round(shortageLiters * (usedPrice || 0)),
    Math.round(draft.fuelAmountDue)
  );
  const dieselOwed =
    dieselSettlement === "paid" ? 0 : dieselSettlement === "shortage" ? shortageAmount : Math.round(draft.fuelAmountDue);

  return (
    <Modal open onClose={onClose} title={existing ? "تعديل الاستخدام الفعلي" : "تسجيل الاستخدام الفعلي"}>
      <div className="space-y-3">
        <Field label="المستخدم الفعلي (من أخذ الماء فعلًا)">
          <button
            onClick={() => setPicking(true)}
            className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-right text-sm font-bold text-gray-800 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
          >
            {personName(state, personId)}
            {findPerson(state, personId)?.phone ? ` — ${findPerson(state, personId)?.phone}` : ""}
          </button>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="البداية">
            <TimeInput value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </Field>
          <Field label="النهاية">
            <TimeInput value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </Field>
        </div>

        <Field
          label="سعر لتر الديزل عندك اليوم"
          hint="يُحسب بهذه العملية فقط: اللترات × سعرك = تكلفتك. اتركه 0 لاستخدام السعر المرجعي للمضخة"
        >
          <NumberInput
            value={personalFuelPrice}
            onChange={(e) => setPersonalFuelPrice(Number(e.target.value))}
            aria-label="سعر لتر الديزل الشخصي"
          />
        </Field>

        <div className="grid grid-cols-2 gap-2 rounded-2xl bg-gray-50 p-3 text-[11px] dark:bg-slate-700">
          <Row
            label="عدد الساعات المستخدمة"
            value={`${formatDuration(draft.minutes)}${draft.crossesMidnight ? " (يعبر منتصف الليل)" : ""}`}
          />
          <Row label="الاستهلاك (لتر/ساعة)" value={`${draft.fuelPerHourSnapshot}`} />
          <Row label="اللترات" value={`${draft.fuelLiters} لتر`} />
          <Row
            label={draft.personalFuelPriceSnapshot > 0 ? "سعرك الشخصي" : "سعر اللتر (مرجعي)"}
            value={`${usedPrice}`}
          />
          <Row label="تكلفة الديزل" value={formatMoney(draft.fuelAmountDue, pump.currency)} />
          <Row label="الرواسة" value={formatMoney(draft.royaltyAmountDue, pump.currency)} />
          <Row label="المسؤول عن التكلفة" value={findPerson(state, personId)?.name ?? "—"} />
          <Row label="توقف داخل الفترة" value={formatDuration(draft.stoppageMin)} />
          <div className="col-span-2 text-[10px] leading-relaxed text-gray-400">
            تُحفظ هذه القيم داخل العملية (Snapshot): اللترات = الساعات × استهلاك الساعة، والتكلفة = اللترات ×
            السعر. أي تغيير لاحق في سعر الديزل أو استهلاك المضخة لا يعيد حساب هذه العملية.
          </div>
        </div>

        {overlaps.length > 0 ? (
          <div
            className="space-y-2 rounded-2xl border border-amber-300 bg-amber-50 px-3 py-3 text-[11px] text-amber-900 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-200"
            data-testid="overlap-warning"
          >
            <div className="font-extrabold">
              <AlertTriangle size={13} className="inline -mt-0.5" /> تعارض في الأوقات ({overlaps.length}) — لم
              يُحذف أي سجل
            </div>
            {overlaps.map((o) => (
              <div key={o.usageId} className="rounded-xl bg-white/70 px-2.5 py-1.5 dark:bg-slate-800">
                {o.personName}: {o.startTime} → {o.endTime} — تداخل {formatDuration(o.minutes)}
              </div>
            ))}
            <label className="flex items-center justify-between gap-2 rounded-xl bg-white/70 px-2.5 py-2 dark:bg-slate-800">
              <span className="font-bold">أؤكد التسجيل مع وجود التعارض (يُحفظ السبب)</span>
              <input
                type="checkbox"
                checked={overlapAck}
                onChange={(e) => setOverlapAck(e.target.checked)}
                className="h-5 w-5 accent-amber-600"
                aria-label="تأكيد التعارض"
              />
            </label>
          </div>
        ) : null}

        {breakdown.over ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300">
            إجمالي الساعات بعد هذه العملية {toHours(breakdown.usageTotalMin)} · ساعات المضخة المتاحة{" "}
            {toHours(breakdown.effectiveMin)} ({toHours(breakdown.capacityMin)} تشغيل −{" "}
            {toHours(breakdown.stoppageMin)} توقف) · مقدار التجاوز {toHours(breakdown.overMin)} — يُحفظ السبب مع
            العملية ولا يُحذف أي سجل.
          </div>
        ) : null}

        <Field label="نوع الاستخدام">
          <Select value={usageType} onChange={(e) => setUsageType(e.target.value as UsageType)}>
            <option value="share">حصة أساسية</option>
            <option value="rental">تأجير</option>
            <option value="loan">إعارة / سلفة</option>
            <option value="purchase">شراء ساعات</option>
            <option value="extra">ساعات إضافية</option>
            <option value="guest">ضيف</option>
          </Select>
        </Field>

        {/* تسديد الديزل — كل خيار له فعل مالي مختلف */}
        <Field label="تسديد الديزل">
          <div className="grid grid-cols-3 gap-1.5">
            {DIESEL_SETTLEMENT_OPTIONS.map((o) => (
              <button
                key={o.id}
                onClick={() => setDieselSettlement(o.id)}
                title={o.action}
                className={cx(
                  "rounded-2xl border px-2 py-2 text-[11px] font-bold transition",
                  dieselSettlement === o.id
                    ? o.id === "paid"
                      ? "border-emerald-400 bg-emerald-50 text-emerald-700"
                      : o.id === "shortage"
                        ? "border-amber-400 bg-amber-50 text-amber-700"
                        : "border-red-300 bg-red-50 text-red-600"
                    : "border-gray-200 text-gray-500 dark:border-slate-600 dark:text-slate-300"
                )}
                aria-label={`تسديد الديزل: ${o.label}`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </Field>
        {dieselSettlement === "shortage" ? (
          <Field label="عدد لترات النقص" hint="يُسجَّل النقص دينًا عليه، والباقي سداد">
            <NumberInput value={shortageLiters} onChange={(e) => setShortageLiters(Number(e.target.value))} />
          </Field>
        ) : null}
        <p className="rounded-2xl bg-gray-50 px-3 py-2 text-[11px] text-gray-500 dark:bg-slate-700 dark:text-slate-300">
          {DIESEL_SETTLEMENT_OPTIONS.find((o) => o.id === dieselSettlement)?.action} · يبقى عليه من الديزل:{" "}
          <b>{formatMoney(dieselOwed, pump.currency)}</b>
        </p>

        {/* رسوم الرواسة — نقد أو أجل */}
        <Field label="رسوم الرواسة">
          <div className="grid grid-cols-2 gap-1.5">
            {ROYALTY_MODE_OPTIONS.map((o) => (
              <button
                key={o.id}
                onClick={() => setRoyaltyPayMode(o.id)}
                title={o.action}
                className={cx(
                  "rounded-2xl border px-2 py-2 text-[11px] font-bold transition",
                  royaltyPayMode === o.id
                    ? o.id === "cash"
                      ? "border-emerald-400 bg-emerald-50 text-emerald-700"
                      : "border-amber-400 bg-amber-50 text-amber-700"
                    : "border-gray-200 text-gray-500 dark:border-slate-600 dark:text-slate-300"
                )}
                aria-label={`سداد الرواسة: ${o.label}`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </Field>
        <p className="rounded-2xl bg-gray-50 px-3 py-2 text-[11px] text-gray-500 dark:bg-slate-700 dark:text-slate-300">
          {ROYALTY_MODE_OPTIONS.find((o) => o.id === royaltyPayMode)?.action} · {formatMoney(draft.royaltyAmountDue, pump.currency)}
        </p>

        <Field label="ملاحظات">
          <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </Field>

        {draft.minutes > 0 ? null : (
          <p className="rounded-2xl bg-red-50 px-3 py-2 text-[11px] font-bold text-red-600">
            تأكد من وقت البداية والنهاية — المدة الحالية صفر.
          </p>
        )}

        <Field label="سبب تجاوز ساعات التشغيل (إن وُجد تجاوز)">
          <TextInput value={reason} onChange={(e) => setReason(e.target.value)} placeholder="مثال: تأخر تشغيل المضخة" />
        </Field>

        <div className="flex gap-2">
          {existing ? (
            <Button
              variant="danger"
              onClick={() => {
                actions.voidUsage(existing.id, reason || "إلغاء من شاشة اليوم", actor);
                onClose();
              }}
            >
              <Trash2 size={16} /> إلغاء الاستخدام
            </Button>
          ) : null}
          <Button
            className="flex-1"
            onClick={() => {
              if (existing) actions.voidUsage(existing.id, "تعديل السجل", actor);
              actions.recordUsage({
                dayId,
                entryId: entry.id,
                personId,
                shareholderId: shareholder?.id ?? entry.shareholderId,
                rightHolderId: right?.holderPersonId ?? null,
                usageType,
                startTime,
                endTime,
                notes: notes || (overlaps.length > 0 ? `تعارض موقّع عليه — ${reason}` : notes),
                dieselSettlement,
                dieselShortageLiters: dieselSettlement === "shortage" ? shortageLiters : 0,
                royaltyPayMode,
                settlementNote: notes,
                overCapacityReason: reason,
                personalFuelPrice,
                confirmedOverlap: overlapAck,
                correctionReason,
                actor,
              });
              onClose();
            }}
            disabled={draft.minutes <= 0 || (overlaps.length > 0 && !overlapAck)}
          >
            <Droplets size={16} />{" "}
            {overlaps.length > 0 && !overlapAck
              ? "أكّد التعارض أولًا"
              : existing
                ? "حفظ كسجل جديد"
                : "تسجيل الاستخدام"}
          </Button>
        </div>
        <p className="text-[10px] text-gray-400">
          عند التعديل يُلغى السجل القديم وحركاته المالية تُلغى (لا تُحذف) ويُسجَّل سجل جديد — لا يُفقد التاريخ.
        </p>
      </div>

      {picking ? (
        <PersonPicker
          open
          onClose={() => setPicking(false)}
          pumpId={pump.id}
          title="من أخذ الماء فعليًا؟"
          onSelect={(person) => setPersonId(person.id)}
        />
      ) : null}
    </Modal>
  );
}

function StoppageModal({
  dayId,
  date,
  onClose,
  correctionReason = "",
  actor = "manager",
}: {
  dayId: string;
  date: string;
  onClose: () => void;
  correctionReason?: string;
  actor?: string;
}) {
  const { state, actions } = useApp();
  const pump = state.pump!;
  const [kind, setKind] = useState<StoppageKind>("breakdown");
  const [startTime, setStartTime] = useState("06:00");
  const [endTime, setEndTime] = useState("08:00");
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const minutes = durationMin(startTime, endTime);

  return (
    <Modal open onClose={onClose} title="تسجيل توقف">
      <div className="space-y-3">
        <Field label="نوع التوقف">
          <Select value={kind} onChange={(e) => setKind(e.target.value as StoppageKind)}>
            <option value="breakdown">عطل</option>
            <option value="rain">مطر</option>
            <option value="fuel_shortage">نقص الوقود</option>
            <option value="planned">مخطط</option>
            <option value="unplanned">غير مخطط</option>
            <option value="temporary">مؤقت</option>
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="من">
            <TimeInput value={startTime} onChange={(e) => setStartTime(e.target.value)} />
          </Field>
          <Field label="إلى">
            <TimeInput value={endTime} onChange={(e) => setEndTime(e.target.value)} />
          </Field>
        </div>
        <p className="rounded-2xl bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700">
          المدة: {formatDuration(minutes)}
        </p>
        <Field label="السبب">
          <TextInput value={reason} onChange={(e) => setReason(e.target.value)} placeholder="سبب التوقف" />
        </Field>
        <Field label="ملاحظات">
          <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </Field>
        <Button
          className="w-full"
          onClick={() => {
            const stoppage: Stoppage = {
              id: uid("st"),
              pumpId: pump.id,
              dayId,
              date,
              startTime,
              endTime,
              minutes,
              kind,
              reason: reason || stoppageLabel(kind),
              notes,
              createdAt: new Date().toISOString(),
              createdBy: "manager",
              archived: false,
            };
            actions.saveStoppage(stoppage, true, { correctionReason, actor });
            onClose();
          }}
          disabled={minutes <= 0}
        >
          حفظ التوقف
        </Button>
      </div>
    </Modal>
  );
}

function stoppageLabel(kind: StoppageKind): string {
  const map: Record<StoppageKind, string> = {
    breakdown: "عطل",
    rain: "مطر",
    fuel_shortage: "نقص الوقود",
    planned: "توقف مخطط",
    unplanned: "توقف غير مخطط",
    temporary: "توقف مؤقت",
  };
  return map[kind];
}

function AckForm({
  message,
  onSubmit,
  label = "سبب التجاوز",
}: {
  message: string;
  onSubmit: (reason: string) => void;
  label?: string;
}) {
  const [reason, setReason] = useState("");
  return (
    <div className="space-y-3">
      <p className="rounded-2xl bg-amber-50 px-3 py-3 text-xs leading-relaxed text-amber-800">{message}</p>
      <Field label={label}>
        <TextArea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} autoFocus />
      </Field>
      <Button className="w-full" onClick={() => onSubmit(reason)} disabled={!reason.trim()}>
        تأكيد وحفظ السبب
      </Button>
    </div>
  );
}
