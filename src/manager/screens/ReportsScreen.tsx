import { useMemo, useState } from "react";
import {
  BarChart3,
  CalendarDays,
  CloudOff,
  FileSpreadsheet,
  History,
  Printer,
  Scale,
  ShieldCheck,
  Timer,
  Wrench,
} from "lucide-react";
import { useApp } from "../../store";
import type {
  Conflict,
  ConflictStatus,
  Person,
  PersonalRecord,
  Settlement,
  Transaction,
} from "../../domain/types";
import {
  comparePerson,
  conflictStatusLabel,
  conflictTypeLabel,
  daySummary,
  dialaDayLabel,
  findPerson,
  matchStatusLabel,
  openConflicts,
  personName,
  pumpFinancials,
  scheduleRows,
  sortedDays,
} from "../../domain/rules";
import {
  durationMin,
  formatDuration,
  formatClock,
  isoToShort,
  monthKey,
  monthLabel,
  todayISO,
  uid,
} from "../../domain/util";
import { formatMoney, formatNumber } from "../../format";
import {
  Button,
  Card,
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
import PersonPicker from "../../components/PersonPicker";

type Tab = "reports" | "differences" | "audit";

export default function ReportsScreen() {
  const { state } = useApp();
  const [tab, setTab] = useState<Tab>("reports");
  const months = useMemo(() => {
    const set = new Set<string>([monthKey(todayISO())]);
    for (const u of state.usages) set.add(monthKey(u.date));
    for (const t of state.transactions) set.add(monthKey(t.date));
    for (const d of state.days) set.add(monthKey(d.date));
    return Array.from(set).sort().reverse();
  }, [state]);
  const [month, setMonth] = useState(months[0] ?? monthKey(todayISO()));

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {(
          [
            { id: "reports", label: "التقارير" },
            { id: "differences", label: "الفروقات" },
            { id: "audit", label: "سجل التدقيق" },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={cx(
              "flex-1 rounded-2xl border px-3 py-2 text-xs font-bold transition",
              tab === t.id
                ? "border-emerald-400 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30"
                : "border-gray-200 text-gray-500 dark:border-slate-600 dark:text-slate-300"
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "reports" ? (
        <>
          <Card className="flex items-center gap-2 p-3">
            <FileSpreadsheet size={16} className="text-emerald-600" />
            <Select value={month} onChange={(e) => setMonth(e.target.value)} className="flex-1">
              {months.map((m) => (
                <option key={m} value={m}>
                  {monthLabel(m)}
                </option>
              ))}
            </Select>
            <button
              onClick={() => window.print()}
              className="rounded-xl bg-gray-100 px-3 py-2 text-[11px] font-bold text-gray-600 dark:bg-slate-700 dark:text-slate-200"
            >
              <Printer size={13} className="inline -mt-0.5" /> طباعة
            </button>
          </Card>
          <MonthlyReport month={month} />
        </>
      ) : null}

      {tab === "differences" ? <DifferencesTab /> : null}
      {tab === "audit" ? <AuditTab /> : null}
    </div>
  );
}

function MonthlyReport({ month }: { month: string }) {
  const { state } = useApp();
  const pump = state.pump!;
  const data = useMemo(() => {
    const days = sortedDays(state).filter((d) => monthKey(d.date) === month);
    const usages = state.usages.filter((u) => u.status === "active" && monthKey(u.date) === month);
    const stoppages = state.stoppages.filter((s) => !s.archived && monthKey(s.date) === month);
    const fuels = state.fuelRecords.filter((f) => !f.archived && monthKey(f.date) === month);
    const operators = state.operatorRecords.filter((o) => !o.archived && monthKey(o.date) === month);
    const financials = pumpFinancials(state, `${month}-01`, `${month}-31`);
    const perPerson = state.persons
      .filter((p) => !p.archived)
      .map((p) => {
        const own = usages.filter((u) => u.personId === p.id);
        const txs = state.transactions.filter(
          (t) => t.personId === p.id && t.status === "posted" && monthKey(t.date) === month
        );
        return {
          person: p,
          minutes: own.reduce((s, u) => s + u.minutes, 0),
          liters: own.reduce((s, u) => s + u.fuelLiters, 0),
          debit: txs.filter((t) => t.direction === "debit").reduce((s, t) => s + t.amount, 0),
          credit: txs.filter((t) => t.direction === "credit").reduce((s, t) => s + t.amount, 0),
        };
      })
      .filter((r) => r.minutes > 0 || r.debit > 0 || r.credit > 0)
      .sort((a, b) => b.minutes - a.minutes);
    return { days, usages, stoppages, fuels, operators, financials, perPerson };
  }, [state, month]);

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="mb-3 flex items-center gap-2">
          <BarChart3 size={16} className="text-emerald-600" />
          <h2 className="text-sm font-extrabold text-gray-800 dark:text-white">ملخص {monthLabel(month)}</h2>
        </div>
        <div className="grid grid-cols-2 gap-2 text-center">
          <Metric label="أيام فعلية" value={`${data.days.length}`} />
          <Metric label="عمليات استخدام" value={`${data.usages.length}`} />
          <Metric
            label="ساعات الاستخدام"
            value={formatDuration(data.usages.reduce((s, u) => s + u.minutes, 0))}
          />
          <Metric label="ديزل مستهلك" value={`${formatNumber(data.financials.fuelLiters)} لتر`} />
          <Metric label="استحقاق الديزل" value={formatMoney(data.financials.fuelCharged, pump.currency)} />
          <Metric label="استحقاق الرواسة" value={formatMoney(data.financials.royaltyCharged, pump.currency)} />
          <Metric label="المسدَّد" value={formatMoney(data.financials.collected, pump.currency)} tone="green" />
          <Metric label="المتبقي" value={formatMoney(data.financials.outstanding, pump.currency)} tone="amber" />
          <Metric label="ساعات التوقف" value={formatDuration(data.stoppages.reduce((s, x) => s + x.minutes, 0))} />
          <Metric label="أجور الرواسة" value={formatMoney(data.operators.reduce((s, o) => s + o.dueAmount, 0), pump.currency)} />
        </div>
      </Card>

      <Card className="p-4">
        <h2 className="mb-2 text-sm font-extrabold text-gray-800 dark:text-white">تفصيل حسب الأشخاص</h2>
        {data.perPerson.length === 0 ? (
          <p className="py-3 text-center text-xs text-gray-400">لا توجد بيانات في هذا الشهر.</p>
        ) : (
          <div className="space-y-2">
            {data.perPerson.map((row) => (
              <div
                key={row.person.id}
                className="flex items-center gap-2 rounded-2xl bg-gray-50 px-3 py-2 text-[11px] dark:bg-slate-700"
              >
                <span className="flex-1 font-extrabold text-gray-800 dark:text-white">{row.person.name}</span>
                <span className="text-gray-500 dark:text-slate-300">{formatDuration(row.minutes)}</span>
                <span className="text-gray-400">{formatNumber(row.liters)} لتر</span>
                <span className="text-red-600">{formatMoney(row.debit, pump.currency)}</span>
                <span className="text-emerald-600">{formatMoney(row.credit, pump.currency)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-4">
        <h2 className="mb-2 flex items-center gap-2 text-sm font-extrabold text-gray-800 dark:text-white">
          <CalendarDays size={15} className="text-emerald-600" /> تفصيل الأيام
        </h2>
        {data.days.length === 0 ? (
          <p className="py-3 text-center text-xs text-gray-400">لا توجد أيام في هذا الشهر.</p>
        ) : (
          <div className="space-y-2">
            {data.days.map((day) => {
              const s = daySummary(state, day, pump);
              return (
                <div
                  key={day.id}
                  className="flex items-center gap-2 rounded-2xl border border-gray-100 px-3 py-2 text-[11px] dark:border-slate-700"
                >
                  <span className="flex-1 font-bold text-gray-800 dark:text-white">
                    {dialaDayLabel(state, day)} — {isoToShort(day.date)}
                  </span>
                  <span className="text-gray-500 dark:text-slate-300">{s.persons} شخص</span>
                  <span className="text-gray-500 dark:text-slate-300">{formatDuration(s.plannedMin)}</span>
                  <span className="text-gray-400">{formatNumber(s.liters)} لتر</span>
                  <span className="text-emerald-700 dark:text-emerald-300">
                    {formatMoney(s.usageAmount, pump.currency)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card className="p-4">
        <h2 className="mb-2 flex items-center gap-2 text-sm font-extrabold text-gray-800 dark:text-white">
          <Timer size={15} className="text-emerald-600" /> المساهمون الأساسيون (مرجع)
        </h2>
        <div className="space-y-1 text-[11px]">
          {scheduleRows(state, pump).map((row, i) => (
            <div key={row.shareholder.id} className="flex items-center gap-2">
              <span className="w-5 text-gray-400">{i + 1}</span>
              <span className="flex-1 font-bold text-gray-700 dark:text-slate-200">
                {personName(state, row.shareholder.personId)}
              </span>
              <span className="text-gray-500 dark:text-slate-300">
                {formatNumber(row.units)} {pump.shareUnit}
              </span>
              <span className="text-gray-500 dark:text-slate-300">{formatDuration(row.derivedHoursMin)}</span>
            </div>
          ))}
        </div>
      </Card>

      {data.stoppages.length > 0 ? (
        <Card className="p-4">
          <h2 className="mb-2 flex items-center gap-2 text-sm font-extrabold text-gray-800 dark:text-white">
            <Wrench size={15} className="text-emerald-600" /> التوقفات
          </h2>
          <div className="space-y-1 text-[11px]">
            {data.stoppages.map((s) => (
              <div key={s.id} className="flex items-center gap-2 text-gray-500 dark:text-slate-300">
                <span className="flex-1">
                  {isoToShort(s.date)} · {s.reason}
                </span>
                <span>{formatDuration(s.minutes)}</span>
              </div>
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  );
}

function Metric({
  label,
  value,
  tone = "gray",
}: {
  label: string;
  value: string;
  tone?: "gray" | "green" | "amber";
}) {
  return (
    <div className="rounded-2xl bg-gray-50 px-2 py-2 dark:bg-slate-700">
      <div className="text-[10px] font-bold text-gray-400">{label}</div>
      <div
        className={cx(
          "mt-0.5 text-xs font-extrabold",
          tone === "gray" && "text-gray-800 dark:text-white",
          tone === "green" && "text-emerald-700 dark:text-emerald-300",
          tone === "amber" && "text-amber-600 dark:text-amber-300"
        )}
      >
        {value}
      </div>
    </div>
  );
}

function DifferencesTab() {
  const { state, actions } = useApp();
  const pump = state.pump!;
  const [settleFor, setSettleFor] = useState<{ personId: string; rowIndex: number } | null>(null);
  const [conflictFor, setConflictFor] = useState<Conflict | null>(null);
  const [personalOpen, setPersonalOpen] = useState(false);
  const conflicts = state.conflicts.slice().sort((a, b) => {
    const rank = (c: Conflict) =>
      c.status === "open" ? 0 : c.status === "under_review" ? 1 : c.status === "resolved" ? 2 : 3;
    return rank(a) - rank(b);
  });
  const openCount = openConflicts(state).length;
  const persons = state.persons.filter((p) => !p.archived);
  const comparisons = persons
    .map((p) => ({ person: p, comparison: comparePerson(state, p.id) }))
    .filter((c) => c.comparison.rows.length > 0);
  const totalDifferences = comparisons.reduce((s, c) => s + c.comparison.differences, 0);

  const target = settleFor ? comparisons.find((c) => c.person.id === settleFor.personId) : null;
  const row = target ? target.comparison.rows[settleFor!.rowIndex] : null;

  return (
    <div className="space-y-4">
      <Card className="p-4" data-testid="conflicts-panel">
        <div className="flex items-center gap-2">
          <Scale size={16} className="text-emerald-600" />
          <h2 className="text-sm font-extrabold text-gray-800 dark:text-white">
            السجل الرسمي مقابل السجل الشخصي
          </h2>
          <Pill tone={openCount > 0 ? "amber" : "green"}>{openCount} تعارض قائم</Pill>
        </div>
        <p className="mt-2 text-[11px] leading-relaxed text-gray-400">
          النظام لا يحل التعارض تلقائيًا ولا يحذف أي سجل — يكشف الاختلاف ويعرض السجلين ثم يسمح بتسوية موثّقة.
        </p>

        <div className="mt-3 space-y-2">
          {conflicts.length === 0 ? (
            <p className="py-3 text-center text-xs text-gray-400">
              لا توجد تعارضات محفوظة — تُكتشف تلقائيًا عند وجود اختلاف بين السجلين أو تداخل أو تجاوز.
            </p>
          ) : (
            conflicts.map((c) => (
              <div
                key={c.id}
                className={cx(
                  "rounded-2xl border px-3 py-2 text-[11px]",
                  c.status === "open"
                    ? "border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-900/20"
                    : c.status === "resolved"
                      ? "border-emerald-200 bg-emerald-50/70 dark:border-emerald-900/40 dark:bg-emerald-900/20"
                      : "border-gray-200 bg-gray-50 dark:border-slate-700 dark:bg-slate-700/40"
                )}
              >
                <div className="flex flex-wrap items-center gap-2">
                  <Pill tone={c.status === "resolved" ? "green" : c.status === "open" ? "amber" : "gray"}>
                    {conflictStatusLabel(c.status)}
                  </Pill>
                  <span className="font-extrabold text-gray-800 dark:text-white">
                    {conflictTypeLabel(c.type)}
                  </span>
                  {c.personId ? (
                    <span className="text-gray-500 dark:text-slate-300">{personName(state, c.personId)}</span>
                  ) : null}
                  {c.dayId ? (
                    <span className="text-gray-400">
                      {isoToShort(state.days.find((d) => d.id === c.dayId)?.date ?? "")}
                    </span>
                  ) : null}
                  <button
                    onClick={() => setConflictFor(c)}
                    className="mr-auto rounded-xl bg-white px-2 py-1 font-bold text-emerald-700 dark:bg-slate-800 dark:text-emerald-300"
                  >
                    {c.status === "resolved" ? "تفاصيل القرار" : "مراجعة / قرار"}
                  </button>
                </div>
                <div className="mt-1 grid gap-0.5 text-gray-600 dark:text-slate-300">
                  <span>السجل الرسمي: {c.officialValue || "—"}</span>
                  <span>السجل الشخصي: {c.personalValue || "—"}</span>
                  <span className="font-bold text-amber-700 dark:text-amber-300">الفرق: {c.difference}</span>
                  {c.resolution ? (
                    <span className="text-emerald-700 dark:text-emerald-300">
                      القرار: {c.resolution} {c.resolvedBy ? `— ${c.resolvedBy}` : ""}
                    </span>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="secondary" className="px-3 py-1.5 text-[11px]" onClick={() => setPersonalOpen(true)}>
            + تسجيل سجل شخصي (من المستخدم)
          </Button>
          <Pill tone="gray">{totalDifferences} اختلاف في المقارنة المباشرة</Pill>
        </div>
      </Card>

      {comparisons.length === 0 ? (
        <p className="py-6 text-center text-xs text-gray-400">لا توجد سجلات شخصية مرتبطة بالمضخة بعد.</p>
      ) : (
        comparisons.map(({ person, comparison }) => (
          <Card key={person.id} className="p-4">
            <div className="flex items-center gap-2">
              <span className="text-sm font-extrabold text-gray-800 dark:text-white">{person.name}</span>
              <span className="mr-auto text-[11px] text-gray-400">
                رسمي {formatDuration(comparison.officialMinutes)} · شخصي {formatDuration(comparison.personalMinutes)}
              </span>
            </div>
            <div className="mt-2 space-y-2">
              {comparison.rows.map((r, index) => (
                <div
                  key={`${person.id}-${r.date}`}
                  className={cx(
                    "rounded-2xl border px-3 py-2 text-[11px]",
                    r.status === "matched"
                      ? "border-emerald-100 bg-emerald-50/60 dark:border-emerald-900/40 dark:bg-emerald-900/20"
                      : r.status === "settled"
                        ? "border-sky-100 bg-sky-50 dark:border-sky-900/40 dark:bg-sky-900/20"
                        : "border-amber-100 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-900/20"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-gray-700 dark:text-slate-200">{isoToShort(r.date)}</span>
                    <Pill
                      tone={
                        r.status === "matched"
                          ? "green"
                          : r.status === "settled"
                            ? "blue"
                            : "amber"
                      }
                    >
                      {matchStatusLabel(r.status)}
                    </Pill>
                    <span className="mr-auto text-gray-500 dark:text-slate-300">
                      رسمي {formatDuration(r.officialMinutes)} / شخصي {formatDuration(r.personalMinutes)}
                      {r.minutesDiff !== 0 ? ` (فرق ${formatDuration(Math.abs(r.minutesDiff))})` : ""}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-[10px] text-gray-400">
                    <span>قيمة رسمية {formatMoney(r.officialAmount, pump.currency)}</span>
                    <span>قيمة شخصية {formatMoney(r.personalAmount, pump.currency)}</span>
                    {r.status !== "settled" ? (
                      <button
                        onClick={() => setSettleFor({ personId: person.id, rowIndex: index })}
                        className="mr-auto rounded-xl bg-white px-2 py-1 font-bold text-emerald-700 dark:bg-slate-800 dark:text-emerald-300"
                      >
                        تسوية
                      </button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        ))
      )}

      {target && row ? (
        <SettlementModal
          personId={target.person.id}
          dayId={row.dayId}
          officialMinutes={row.officialMinutes}
          personalMinutes={row.personalMinutes}
          officialAmount={row.officialAmount}
          personalAmount={row.personalAmount}
          onClose={() => setSettleFor(null)}
          onSave={(settlement, adjustment) => {
            const personalRecord =
              state.personalRecords.find(
                (p) => p.personId === target.person.id && p.date === row.date
              ) ?? null;
            actions.settle(settlement, personalRecord?.id ?? null, null, adjustment);
            setSettleFor(null);
          }}
        />
      ) : null}

      {conflictFor ? (
        <ConflictResolveModal conflict={conflictFor} onClose={() => setConflictFor(null)} />
      ) : null}

      {personalOpen ? <PersonalRecordModal onClose={() => setPersonalOpen(false)} /> : null}
    </div>
  );
}

/** قرار على تعارض محفوظ — لا يعدّل أي سجل رسمي أو شخصي */
function ConflictResolveModal({
  conflict,
  onClose,
}: {
  conflict: Conflict;
  onClose: () => void;
}) {
  const { state, actions } = useApp();
  const [status, setStatus] = useState<ConflictStatus>(conflict.status);
  const [resolution, setResolution] = useState(conflict.resolution);
  const [notes, setNotes] = useState(conflict.notes);
  const [actor, setActor] = useState("المسؤول");

  return (
    <Modal open onClose={onClose} title={`مراجعة تعارض — ${conflictTypeLabel(conflict.type)}`}>
      <div className="space-y-3">
        <div className="rounded-2xl bg-gray-50 px-3 py-3 text-[11px] dark:bg-slate-700">
          <Row label="السجل الرسمي" value={conflict.officialValue || "—"} />
          <Row label="السجل الشخصي" value={conflict.personalValue || "—"} />
          <Row label="الفرق" value={conflict.difference} tone="amber" />
          <Row label="تاريخ الكشف" value={formatClock(conflict.createdAt)} />
          {conflict.personId ? <Row label="الشخص" value={personName(state, conflict.personId)} /> : null}
        </div>

        <Field label="الحالة">
          <Select value={status} onChange={(e) => setStatus(e.target.value as ConflictStatus)}>
            <option value="open">قائم</option>
            <option value="under_review">قيد المراجعة</option>
            <option value="resolved">محلول</option>
            <option value="ignored">مُهمل</option>
          </Select>
        </Field>
        <Field label="القرار" hint="مثال: اعتماد السجل الرسمي · اعتماد الشخصي · اعتماد قيمة متوسطة">
          <TextInput value={resolution} onChange={(e) => setResolution(e.target.value)} />
        </Field>
        <Field label="ملاحظات">
          <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </Field>
        <Field label="من يتخذ القرار">
          <TextInput value={actor} onChange={(e) => setActor(e.target.value)} />
        </Field>

        <Button
          className="w-full"
          onClick={() => {
            actions.resolveConflict(conflict.id, status, resolution, notes, actor);
            onClose();
          }}
        >
          <ShieldCheck size={16} /> حفظ القرار
        </Button>
        <p className="text-[10px] leading-relaxed text-gray-400">
          تغيير الحالة أو القرار لا يمسّ السجل الرسمي ولا الشخصي — يُحفظ القرار بمن اتخذه ومتى.
        </p>
      </div>
    </Modal>
  );
}

/** السجل الشخصي: إدخال مستقل عن السجل الرسمي (§19) ولا يعدّله */
function PersonalRecordModal({ onClose }: { onClose: () => void }) {
  const { state, actions } = useApp();
  const pump = state.pump!;
  const [person, setPerson] = useState<Person | null>(null);
  const [picking, setPicking] = useState(false);
  const [date, setDate] = useState(todayISO());
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("11:00");
  const [minutes, setMinutes] = useState(180);
  const [liters, setLiters] = useState(0);
  const [price, setPrice] = useState(0);
  const [royalty, setRoyalty] = useState(0);
  const [paid, setPaid] = useState(0);
  const [notes, setNotes] = useState("");
  const [useClock, setUseClock] = useState(true);

  const computedMinutes = useClock ? durationMin(startTime, endTime) : minutes;
  const dieselLiters = liters > 0 ? liters : 0;
  const dieselAmount = Math.round(dieselLiters * (price || 0));
  const debtAmount = Math.max(0, dieselAmount + royalty - paid);

  return (
    <Modal open onClose={onClose} title="تسجيل سجل شخصي">
      <div className="space-y-3">
        <Field label="الشخص">
          <button
            onClick={() => setPicking(true)}
            className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-right text-sm font-bold text-gray-800 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
          >
            {person ? person.name : "اختيار الشخص"}
          </button>
        </Field>

        <Field label="التاريخ">
          <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>

        <label className="flex items-center justify-between rounded-2xl bg-gray-50 px-3 py-2 text-[11px] font-bold dark:bg-slate-700">
          <span>تحديد الساعات بالوقت الفعلي (يدعم عبور منتصف الليل)</span>
          <input
            type="checkbox"
            checked={useClock}
            onChange={(e) => setUseClock(e.target.checked)}
            className="h-5 w-5 accent-emerald-600"
          />
        </label>

        {useClock ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="البداية">
              <TimeInput value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </Field>
            <Field label="النهاية">
              <TimeInput value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </Field>
          </div>
        ) : (
          <Field label="عدد الدقائق">
            <NumberInput value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} />
          </Field>
        )}

        <div className="grid grid-cols-3 gap-3">
          <Field label="اللترات">
            <NumberInput value={liters} onChange={(e) => setLiters(Number(e.target.value))} />
          </Field>
          <Field label="سعر اللتر الشخصي">
            <NumberInput value={price} onChange={(e) => setPrice(Number(e.target.value))} />
          </Field>
          <Field label="الرواسة">
            <NumberInput value={royalty} onChange={(e) => setRoyalty(Number(e.target.value))} />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="المدفوع">
            <NumberInput value={paid} onChange={(e) => setPaid(Number(e.target.value))} />
          </Field>
          <Field label="المتبقي (دين)">
            <TextInput value={debtAmount} readOnly dir="ltr" className="text-left" />
          </Field>
        </div>

        <div className="rounded-2xl bg-gray-50 px-3 py-2 text-[11px] dark:bg-slate-700">
          <Row label="المدة المحسوبة" value={formatDuration(computedMinutes)} />
          <Row label="تكلفة الديزل" value={formatMoney(dieselAmount, pump.currency)} />
          <Row label="المتبقي" value={formatMoney(debtAmount, pump.currency)} tone="amber" />
        </div>

        <Field label="ملاحظات">
          <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </Field>

        <Button
          className="w-full"
          disabled={!person || computedMinutes <= 0}
          onClick={() => {
            if (!person) return;
            const day = state.days.find((d) => d.date === date && !d.archived) ?? null;
            const record: PersonalRecord = {
              id: uid("pr"),
              personId: person.id,
              pumpId: pump.id,
              dayId: day?.id ?? null,
              date,
              startTime: useClock ? startTime : "",
              endTime: useClock ? endTime : "",
              minutes: computedMinutes,
              dieselLiters,
              dieselPricePerLiter: price,
              dieselAmount,
              royaltyAmount: royalty,
              paidAmount: paid,
              debtAmount,
              operationType: "usage",
              notes,
              matchStatus: "personal_only",
              source: "manager",
              createdAt: new Date().toISOString(),
              createdBy: "manager",
              fuelConsumptionPerHourSnapshot: pump.fuelConsumptionPerHour,
            };
            actions.savePersonal(record, true);
            onClose();
          }}
        >
          <ShieldCheck size={16} /> حفظ السجل الشخصي
        </Button>
        <p className="text-[10px] leading-relaxed text-gray-400">
          السجل الشخصي لا يعدّل السجل الرسمي — يظهر بجانبه في المقارنة، ويرفع تعارضًا إن اختلف.
        </p>
      </div>
      {picking ? (
        <PersonPicker
          open
          onClose={() => setPicking(false)}
          pumpId={pump.id}
          title="اختيار الشخص"
          onSelect={(p) => setPerson(p)}
        />
      ) : null}
    </Modal>
  );
}

function SettlementModal({
  personId,
  dayId,
  officialMinutes,
  personalMinutes,
  officialAmount,
  personalAmount,
  onClose,
  onSave,
}: {
  personId: string;
  dayId: string | null;
  officialMinutes: number;
  personalMinutes: number;
  officialAmount: number;
  personalAmount: number;
  onClose: () => void;
  onSave: (settlement: Settlement, adjustment: Transaction | null) => void;
}) {
  const { state } = useApp();
  const pump = state.pump!;
  const [decision, setDecision] = useState("اعتماد السجل الرسمي");
  const [notes, setNotes] = useState("");
  const [adjust, setAdjust] = useState(0);

  const person = findPerson(state, personId);
  const minutesDiff = officialMinutes - personalMinutes;
  const amountDiff = officialAmount - personalAmount;

  return (
    <Modal open onClose={onClose} title={`تسوية اختلاف — ${person?.name ?? ""}`}>
      <div className="space-y-3">
        <div className="rounded-2xl bg-gray-50 px-3 py-3 text-[11px] dark:bg-slate-700">
          <div className="flex justify-between">
            <span className="text-gray-500 dark:text-slate-300">السجل الرسمي</span>
            <span className="font-extrabold text-gray-800 dark:text-white">
              {formatDuration(officialMinutes)} · {formatMoney(officialAmount, pump.currency)}
            </span>
          </div>
          <div className="mt-1 flex justify-between">
            <span className="text-gray-500 dark:text-slate-300">السجل الشخصي</span>
            <span className="font-extrabold text-gray-800 dark:text-white">
              {formatDuration(personalMinutes)} · {formatMoney(personalAmount, pump.currency)}
            </span>
          </div>
          <div className="mt-1 flex justify-between">
            <span className="text-gray-500 dark:text-slate-300">الفرق</span>
            <span className="font-extrabold text-amber-600">
              {formatDuration(minutesDiff)} · {formatMoney(amountDiff, pump.currency)}
            </span>
          </div>
        </div>

        <Field label="القرار">
          <Select value={decision} onChange={(e) => setDecision(e.target.value)}>
            <option value="اعتماد السجل الرسمي">اعتماد السجل الرسمي</option>
            <option value="اعتماد السجل الشخصي">اعتماد السجل الشخصي</option>
            <option value="اعتماد قيمة متوسطة">اعتماد قيمة متوسطة</option>
            <option value="إبقاء الاختلاف قيد المراجعة">إبقاء الاختلاف قيد المراجعة</option>
          </Select>
        </Field>

        <Field label="تسوية مالية (اختياري)" hint="موجب = مبلغ على الشخص، سالب = مبلغ له">
          <NumberInput value={adjust} onChange={(e) => setAdjust(Number(e.target.value))} />
        </Field>
        <Field label="ملاحظات التسوية">
          <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </Field>

        <Button
          className="w-full"
          onClick={() => {
            const settlement: Settlement = {
              id: uid("st"),
              pumpId: pump.id,
              personId,
              dayId,
              officialUsageId: null,
              personalRecordId: null,
              officialMinutes,
              personalMinutes,
              minutesDiff,
              officialAmount,
              personalAmount,
              amountDiff,
              decision,
              notes,
              byUser: "manager",
              at: new Date().toISOString(),
            };
            const adjustment: Transaction | null =
              adjust !== 0
                ? {
                    id: uid("tx"),
                    pumpId: pump.id,
                    kind: "correction",
                    direction: adjust > 0 ? "debit" : "credit",
                    personId,
                    shareholderId: null,
                    dayId,
                    usageId: null,
                    operatorRecordId: null,
                    fuelRecordId: null,
                    amount: Math.abs(adjust),
                    date: todayISO(),
                    reason: `تسوية اختلاف — ${decision}`,
                    status: "posted",
                    correctsTxId: null,
                    notes,
                    source: "manager",
                    createdAt: new Date().toISOString(),
                    createdBy: "manager",
                  }
                : null;
            onSave(settlement, adjustment);
          }}
        >
          <ShieldCheck size={16} /> حفظ التسوية
        </Button>
        <p className="text-[10px] text-gray-400">
          التسوية لا تحذف السجلين الأصليين — تُضاف كسجل مستقل مع القرار ومن قام به وتاريخه.
        </p>
      </div>
    </Modal>
  );
}

/** صف صغير للعرض داخل البطاقات */
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
          tone === "amber" && "text-amber-600 dark:text-amber-300",
          tone === "red" && "text-red-600 dark:text-red-400",
          tone === "gray" && "text-gray-700 dark:text-slate-200"
        )}
      >
        {value}
      </span>
    </div>
  );
}

function AuditTab() {
  const { state } = useApp();
  const [entity, setEntity] = useState("all");
  const entities = useMemo(
    () => Array.from(new Set(state.auditLogs.map((l) => l.entity))),
    [state.auditLogs]
  );
  const logs = state.auditLogs.filter((l) => entity === "all" || l.entity === entity).slice(0, 120);
  const pending = state.syncQueue.filter((s) => s.status === "pending");

  return (
    <div className="space-y-4">
      <Card className="flex items-center gap-2 p-3">
        <History size={16} className="text-emerald-600" />
        <Select value={entity} onChange={(e) => setEntity(e.target.value)} className="flex-1">
          <option value="all">كل السجلات</option>
          {entities.map((e) => (
            <option key={e} value={e}>
              {e}
            </option>
          ))}
        </Select>
        <Pill tone={pending.length > 0 ? "amber" : "green"}>
          <CloudOff size={11} /> {pending.length} بانتظار المزامنة
        </Pill>
      </Card>

      <Card className="p-4">
        <div className="space-y-2">
          {logs.length === 0 ? (
            <p className="py-4 text-center text-xs text-gray-400">لا توجد سجلات.</p>
          ) : (
            logs.map((log) => (
              <div key={log.id} className="rounded-2xl border border-gray-100 px-3 py-2 dark:border-slate-700">
                <div className="flex items-center gap-2">
                  <Pill tone="blue">{log.action}</Pill>
                  <span className="text-[10px] text-gray-400">{formatClock(log.at)}</span>
                  <span className="mr-auto text-[10px] font-bold text-gray-500 dark:text-slate-300">
                    {log.actor} · {log.entity}
                  </span>
                </div>
                <p className="mt-1 text-[11px] font-bold text-gray-700 dark:text-slate-200">{log.summary}</p>
                {log.reason ? (
                  <p className="mt-0.5 text-[10px] text-amber-600">السبب: {log.reason}</p>
                ) : null}
                {log.before || log.after ? (
                  <details className="mt-1">
                    <summary className="cursor-pointer text-[10px] text-gray-400">
                      القيمة القديمة والجديدة
                    </summary>
                    <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-xl bg-gray-50 p-2 text-[10px] text-gray-500 dark:bg-slate-700 dark:text-slate-300">
                      {log.before ? `قبل: ${log.before}\n` : ""}
                      {log.after ? `بعد: ${log.after}` : ""}
                    </pre>
                  </details>
                ) : null}
              </div>
            ))
          )}
        </div>
      </Card>
    </div>
  );
}
