/**
 * «إضافة مشارك في دوام اليوم» — خطوة واحدة لكل شخص.
 *
 * المشارك يُدخل هنا مرة واحدة: الاسم (وفق كشف ديالة اليوم أولًا، ثم بقية
 * الأشخاص)، ثم من → إلى بالترتيب الزمني، مع الديزل والرواسة وسبب النقص.
 * الترتيب الزمني إلزامي: تُمنع المدة الصفرية والخروج عن نافذة تشغيل اليوم
 * والتداخل وتكرار نفس الشخص في فترة متقاطعة — ويُقترح وقت بديل.
 * الكشف مرجع لا يحجز ساعات: كل ما يُسجَّل هنا هو دوام هذا اليوم وحده.
 */
import { useMemo, useState } from "react";
import { AlertTriangle, ArrowLeftRight, CheckCircle2, HandCoins, ShieldCheck, UserPlus } from "lucide-react";
import { useApp } from "../../store";
import {
  SHORTFALL_REASON_OPTIONS,
  baseRosterTimeline,
  computeUsageDraft,
  dayTimeline,
  findPerson,
  nextAvailableStart,
  pumpWindow,
  scheduleConflicts,
  settlementPostings,
  shareUseNote,
  shareholderOfPerson,
  shortfallReasonLabel,
  stoppageMinutesInRange,
} from "../../domain/rules";
import type {
  DayEntry,
  DialaDay,
  EntryRole,
  ShortfallReason,
  UsageType,
} from "../../domain/types";
import {durationMin, formatDuration, formatTimeAmPm, formatTimeRange, minutesToTime, timeToMinutes, toHours, uid} from "../../domain/util";
import { formatMoney as money, formatNumber } from "../../format";
import {
  Button,
  Field,
  MiniRow,
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
import SettlementEditor, {
  EMPTY_SETTLEMENT,
  settlementAmounts,
  type SettlementDraft,
} from "./SettlementEditor";

interface Props {
  day: DialaDay;
  actor: string;
  correctionReason?: string;
  onClose: () => void;
}

export default function ParticipantModal({ day, actor, correctionReason = "", onClose }: Props) {
  const { state, actions } = useApp();
  const pump = state.pump!;

  /** أسطر كشف ديالة هذا اليوم — للاقتراح ولمعرفة النصيب الأساسي */
  const roster = useMemo(
    () => baseRosterTimeline(state, pump, day.roundId ?? null),
    [state, pump, day.roundId]
  );
  const priorityIds = useMemo(() => roster.map((r) => r.personId), [roster]);
  const rosterByPerson = useMemo(
    () => new Map(roster.map((r) => [r.personId, r])),
    [roster]
  );

  const [personId, setPersonId] = useState<string>("");
  const [role, setRole] = useState<EntryRole>("shareholder");
  const [startTime, setStartTime] = useState(() => nextAvailableStart(state, day, pump));
  const [endTime, setEndTime] = useState(() => {
    const start = nextAvailableStart(state, day, pump);
    return minutesToTime(timeToMinutes(start) + 60);
  });
  const [baseMin, setBaseMin] = useState(0);
  const [shortfallReason, setShortfallReason] = useState<ShortfallReason | "">("");
  const [shortfallNote, setShortfallNote] = useState("");
  const [settlement, setSettlement] = useState<SettlementDraft>(EMPTY_SETTLEMENT);
  const [personalFuelPrice, setPersonalFuelPrice] = useState(0);
  const [usageType, setUsageType] = useState<UsageType>("share");
  const [notes, setNotes] = useState("");
  const [picking, setPicking] = useState(false);
  const [savedName, setSavedName] = useState("");

  const window = pumpWindow(pump, day);
  const timeline = useMemo(() => dayTimeline(state, day, pump), [state, day, pump]);
  const minutes = durationMin(startTime, endTime);
  const stoppageMin = stoppageMinutesInRange(
    state,
    day.id,
    startTime,
    endTime,
    timeToMinutes(window.start),
    window.capacityMin
  );
  const draft = computeUsageDraft(pump, day, startTime, endTime, { personalFuelPrice, stoppageMin });
  const usedPrice = draft.personalFuelPriceSnapshot > 0 ? draft.personalFuelPriceSnapshot : draft.fuelPriceSnapshot;
  const fuelDue = Math.round(draft.fuelAmountDue);
  const royaltyDue = Math.round(draft.royaltyAmountDue);

  /* المستحق من الساعات × الاستهلاك × السعر — والمبالغ المدفوعة من محرّر التسديد */
  const amounts = settlementAmounts(settlement, { fuelDue, royaltyDue, usedPrice });

  const conflicts = useMemo(
    () => scheduleConflicts(state, day, pump, { startTime, endTime, personId }),
    [state, day, pump, personId, startTime, endTime]
  );
  const overlapConflict = conflicts.find((c) => c.kind === "overlap" || c.kind === "duplicate");
  const windowConflict = conflicts.find((c) => c.kind === "window" || c.kind === "zero");
  const suggestedStart = (windowConflict ?? overlapConflict)?.suggestedStart;

  const person = personId ? findPerson(state, personId) : null;
  const rosterRow = personId ? rosterByPerson.get(personId) ?? null : null;
  const shareholder = personId ? shareholderOfPerson(state, pump.id, personId) : null;
  const shareUse = personId ? shareUseNote(state, pump.id, personId, day.date) : null;
  const shortfall = baseMin > 0 && minutes > 0 && minutes < baseMin;
  const shortfallOk = !shortfall || Boolean(shortfallReason);
  const canSave =
    Boolean(personId) && minutes > 0 && !overlapConflict && !windowConflict && shortfallOk;

  /** صف التسديد المتوقع — يُعرض قبل الحفظ (أثر مالي فوري) */
  const postings = useMemo(() => {
    const built = {
      fuelAmountDue: fuelDue,
      fuelLiters: draft.fuelLiters,
      fuelPriceSnapshot: usedPrice,
      fuelPerHourSnapshot: draft.fuelPerHourSnapshot,
      dieselSettlement: settlement.dieselSettlement,
      dieselShortageLiters: settlement.dieselSettlement === "shortage" ? amounts.dieselShortageLiters : 0,
      dieselPaidAmount: amounts.dieselPaid,
      royaltyAmountDue: royaltyDue,
      royaltyPayMode: settlement.royaltyPayMode,
      royaltyCashAmount: amounts.royaltyCash,
      settlementNote: notes,
      shortfallNote,
    } as Parameters<typeof settlementPostings>[0];
    return settlementPostings(built);
  }, [
    fuelDue,
    draft.fuelLiters,
    usedPrice,
    settlement,
    amounts,
    royaltyDue,
    notes,
    shortfallNote,
  ]);

  const pickPerson = (id: string) => {
    setPersonId(id);
    const row = rosterByPerson.get(id);
    const sh = shareholderOfPerson(state, pump.id, id);
    const share = row?.shareMin || sh?.baseHoursMin || 60;
    setBaseMin(share);
    setRole(row?.role ?? (sh ? "shareholder" : "guest"));
    setUsageType(row || sh ? "share" : "guest");
    /* اختيار اسم من الكشف يملأ ساعات دوامه تلقائيًا — والمسؤول يعدّلها بحرية */
    setEndTime(minutesToTime(timeToMinutes(startTime) + share));
    setPicking(false);
  };

  const applyHours = (hours: number) => {
    const m = Math.max(0, Math.round(hours * 60));
    setEndTime(minutesToTime(timeToMinutes(startTime) + m));
  };

  const save = (andNext: boolean) => {
    if (!canSave || !person) return;
    const entry: DayEntry = {
      id: uid("en"),
      dayId: day.id,
      pumpId: pump.id,
      orderIndex: 999,
      personId,
      role,
      shareholderId: shareholder?.id ?? null,
      rightId: null,
      startTime,
      endTime,
      plannedMin: minutes,
      actualPersonId: null,
      usageId: null,
      status: "planned",
      postponeToDayId: null,
      reason: "",
      notes,
      createdAt: new Date().toISOString(),
      createdBy: "manager",
      archived: false,
      shortfallReason: shortfall ? (shortfallReason as ShortfallReason) : undefined,
      shortfallNote: shortfall ? shortfallNote : "",
    };
    actions.saveEntry(entry, true, { actor, correctionReason });
    actions.recordUsage({
      dayId: day.id,
      entryId: entry.id,
      personId,
      shareholderId: shareholder?.id ?? null,
      rightHolderId: null,
      usageType,
      startTime,
      endTime,
      notes: notes || (shortfall ? `نقص النصيب — ${shortfallReasonLabel(shortfallReason as ShortfallReason)}` : ""),
      dieselSettlement: settlement.dieselSettlement,
      dieselShortageLiters: settlement.dieselSettlement === "shortage" ? amounts.dieselShortageLiters : 0,
      dieselPaidAmount: amounts.dieselPaid,
      royaltyPayMode: settlement.royaltyPayMode,
      royaltyCashAmount: amounts.royaltyCash,
      royaltyDeferredAmount: amounts.royaltyDeferred,
      shortfallReason: shortfall ? (shortfallReason as ShortfallReason) : undefined,
      shortfallNote: shortfall ? shortfallNote : "",
      settlementNote: notes,
      overCapacityReason: "",
      personalFuelPrice,
      correctionReason,
      actor,
    });
    if (!andNext) {
      onClose();
      return;
    }
    /* «حفظ وإضافة التالي» — يُسلسل الوقت تلقائيًا من نهاية هذا المشارك */
    setSavedName(person.name);
    const nextStart = endTime;
    setPersonId("");
    setBaseMin(0);
    setShortfallReason("");
    setShortfallNote("");
    setNotes("");
    setSettlement(EMPTY_SETTLEMENT);
    setStartTime(nextStart);
    setEndTime(minutesToTime(timeToMinutes(nextStart) + 60));
  };

  return (
    <Modal open onClose={onClose} title="إضافة مشارك في دوام اليوم">
      <div className="space-y-3">
        {/* شريط النافذة الزمنية: من بداية التشغيل إلى نهايته */}
        <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-gradient-to-l from-brand-700 to-brand-500 px-3 py-2 text-white">
          <span className="text-[11px] font-extrabold">نافذة تشغيل اليوم</span>
          <Pill tone="gray" className="border-white/30 bg-white/20 text-white">
            <span>
              {formatTimeRange(window.start, window.end)}
            </span>
          </Pill>
          <span className="text-[11px] text-sky-100/90">
            {toHours(window.capacityMin)} ساعة · المتبقي من الخطة {formatDuration(timeline.remainingMin)}
          </span>
        </div>

        {savedName ? (
          <p
            className="flex items-center gap-1.5 rounded-2xl bg-emerald-50 px-3 py-2 text-[11px] font-bold text-emerald-700 dark:bg-emerald-900/25 dark:text-emerald-300"
            data-testid="participant-saved"
          >
            <CheckCircle2 size={13} /> حُفظ {savedName} — أدخل المشارك التالي من {formatTimeAmPm(startTime)}.
          </p>
        ) : null}

        {/* الاسم: كشف الديالة أولًا ثم بقية الأشخاص */}
        <Field label="المشارك">
          <button
            onClick={() => setPicking(true)}
            className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-right text-sm font-bold text-gray-800 transition hover:border-sky-200 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
            data-testid="participant-pick"
          >
            {person ? (
              <span className="flex flex-wrap items-center justify-center gap-2">
                <span>{person.name}</span>
                {person.phone ? (
                  <span dir="ltr" className="text-[11px] font-normal text-gray-400">
                    {person.phone}
                  </span>
                ) : null}
                {rosterRow ? <Pill tone="blue">كشف الديالة · {formatDuration(rosterRow.shareMin)}</Pill> : null}
                {shareUse ? (
                  <span className="rounded-lg bg-white px-1.5 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-slate-800 dark:text-amber-300">
                    {shareUse.label}
                  </span>
                ) : null}
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2 text-gray-400">
                <UserPlus size={16} /> اختر المشارك — كشف الديالة أولًا
              </span>
            )}
          </button>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="من">
            <TimeInput
              value={startTime}
              onChange={(e) => {
                const start = e.target.value;
                const m = minutes > 0 ? minutes : baseMin || 60;
                setStartTime(start);
                setEndTime(minutesToTime(timeToMinutes(start) + m));
              }}
              aria-label="بداية دوام المشارك"
            />
          </Field>
          <Field label="إلى">
            <TimeInput
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              aria-label="نهاية دوام المشارك"
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="المدة بالساعات" hint="عدّلها فيتغيّر وقت النهاية" >
            <NumberInput
              value={Math.round((minutes / 60) * 100) / 100}
              onChange={(e) => applyHours(Number(e.target.value))}
              aria-label="مدة الدوام بالساعات"
            />
          </Field>
          <div className="rounded-2xl bg-sky-50 px-3 py-2 text-[11px] font-bold text-sky-800 dark:bg-sky-900/25 dark:text-sky-200">
            <div>المدة: {formatDuration(minutes)}</div>
            {rosterRow ? <div className="mt-1 text-sky-700/80 dark:text-sky-300/80">نصيبه في الكشف: {formatDuration(rosterRow.shareMin)}</div> : null}
          </div>
        </div>

        {/* سبب النقص: إلزامي عند تقليل النصيب عن أساسه */}
        {shortfall ? (
          <div className="space-y-2 rounded-2xl border border-amber-200 bg-amber-50/70 px-3 py-2 dark:border-amber-900/40 dark:bg-amber-900/20">
            <div className="text-[11px] font-extrabold text-amber-800 dark:text-amber-300">
              نصيبه أقل من أساسه ({formatDuration(baseMin)} ← {formatDuration(minutes)}) — سبب النقص إلزامي
            </div>
            <div className="flex flex-wrap gap-1.5">
              {SHORTFALL_REASON_OPTIONS.map((o) => (
                <button
                  key={o.id}
                  onClick={() => setShortfallReason(o.id)}
                  className={cx(
                    "rounded-xl border px-2.5 py-1 text-[11px] font-bold transition",
                    shortfallReason === o.id
                      ? "border-amber-400 bg-white text-amber-700 dark:bg-slate-800 dark:text-amber-300"
                      : "border-amber-200 text-amber-700/70 dark:border-amber-900/40 dark:text-amber-300/70"
                  )}
                  data-testid={`shortfall-${o.id}`}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <TextInput
              value={shortfallNote}
              onChange={(e) => setShortfallNote(e.target.value)}
              placeholder="ملاحظة النقص (اختياري)"
              aria-label="ملاحظة سبب النقص"
            />
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-2 rounded-2xl bg-gray-50 p-3 text-[11px] dark:bg-slate-700">
          <MiniRow label="اللترات المحسوبة" value={`${formatNumber(draft.fuelLiters)} لتر`} />
          <MiniRow label={draft.personalFuelPriceSnapshot > 0 ? "سعرك للّتر" : "سعر اللتر"} value={`${usedPrice}`} />
        </div>

        <Field label="سعر لتر الديزل عندك اليوم" hint="اتركه 0 لاستخدام السعر المرجعي للمضخة">
          <NumberInput
            value={personalFuelPrice}
            onChange={(e) => setPersonalFuelPrice(Number(e.target.value))}
            aria-label="سعر لتر الديزل الشخصي"
          />
        </Field>

        {/* محرّر التسديد الموحّد: ديزل ورواسة — نفس المحرّر المستخدم في التعديل */}
        <SettlementEditor
          value={settlement}
          onChange={setSettlement}
          fuelDue={fuelDue}
          fuelLiters={draft.fuelLiters}
          royaltyDue={royaltyDue}
          usedPrice={usedPrice}
          currency={pump.currency}
        />

        {/* الأثر المالي فورًا */}
        <div className="rounded-2xl border border-gray-100 p-3 dark:border-slate-700" data-testid="participant-postings">
          <div className="mb-1.5 text-[11px] font-extrabold text-gray-700 dark:text-slate-200">
            <HandCoins size={12} className="inline -mt-0.5" /> الأثر المالي عند الحفظ
          </div>
          {postings.length === 0 ? (
            <p className="text-[11px] text-gray-400">لا حركات مالية على هذا المشارك.</p>
          ) : (
            <div className="space-y-1">
              {postings.map((p, i) => (
                <div
                  key={i}
                  className={cx(
                    "flex items-center justify-between gap-2 rounded-xl px-2 py-1 text-[10px] font-bold",
                    p.direction === "debit"
                      ? "bg-red-50 text-red-700 dark:bg-red-900/25 dark:text-red-300"
                      : "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/25 dark:text-emerald-300"
                  )}
                >
                  <span>
                    {p.direction === "debit" ? "استحقاق" : "سداد"} · {p.reason}
                  </span>
                  <span>{money(p.amount, pump.currency)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {conflicts.length > 0 ? (
          <div
            className="space-y-2 rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700 dark:border-red-900/40 dark:bg-red-900/20 dark:text-red-300"
            data-testid="participant-conflict"
          >
            <div className="font-extrabold">
              <AlertTriangle size={13} className="inline -mt-0.5" /> الترتيب الزمني إلزامي — لا يُحفظ هذا الإدخال
            </div>
            {conflicts.map((c, i) => (
              <div key={i}>{c.message}</div>
            ))}
            {suggestedStart ? (
              <button
                onClick={() => {
                  const m = minutes > 0 ? minutes : baseMin || 60;
                  setStartTime(suggestedStart);
                  setEndTime(minutesToTime(timeToMinutes(suggestedStart) + m));
                }}
                className="rounded-xl bg-white px-2.5 py-1.5 font-bold text-red-700 dark:bg-slate-800 dark:text-red-300"
                data-testid="participant-use-suggested"
              >
                استخدم الوقت المقترح {suggestedStart}
              </button>
            ) : null}
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-3">
          <Field label="نوع الاستخدام">
            <Select value={usageType} onChange={(e) => setUsageType(e.target.value as typeof usageType)}>
              <option value="share">حصة أساسية</option>
              <option value="rental">تأجير</option>
              <option value="loan">إعارة / سلفة</option>
              <option value="purchase">شراء ساعات</option>
              <option value="extra">ساعات إضافية</option>
              <option value="guest">ضيف</option>
            </Select>
          </Field>
          <Field label="صفته في اليوم">
            <Select value={role} onChange={(e) => setRole(e.target.value as EntryRole)}>
              <option value="shareholder">مساهم أساسي</option>
              <option value="right_holder">صاحب حق</option>
              <option value="tenant">مستأجر</option>
              <option value="guest">ضيف</option>
              <option value="other">أخرى</option>
            </Select>
          </Field>
        </div>

        <Field label="ملاحظات">
          <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </Field>

        {!shortfallOk ? (
          <p className="rounded-2xl bg-amber-50 px-3 py-2 text-[11px] font-bold text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
            اختر سبب النقص أولًا — لا يُقبل نقص بلا سبب.
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" className="px-3" onClick={onClose}>
            إغلاق
          </Button>
          <Button
            className="flex-1"
            disabled={!canSave}
            onClick={() => save(false)}
            data-testid="participant-save"
          >
            <ShieldCheck size={16} /> حفظ
          </Button>
          <Button
            variant="secondary"
            className="flex-1"
            disabled={!canSave}
            onClick={() => save(true)}
            data-testid="participant-save-next"
          >
            <ArrowLeftRight size={16} /> حفظ وإضافة التالي
          </Button>
        </div>
        <p className="text-[10px] leading-relaxed text-gray-400">
          الحفظ يُنشئ صف المشارك في اليوم مع تسجيل استخدامه وتسديده في خطوة واحدة. الكشف لا يُعدَّل من هنا، ولا
          تُحجز ساعاته تلقائيًا.
        </p>
      </div>

      {picking ? (
        <PersonPicker
          open
          onClose={() => setPicking(false)}
          pumpId={pump.id}
          title="اختيار المشارك — كشف الديالة أولًا"
          priorityIds={priorityIds}
          hintFor={(p) => {
            const row = rosterByPerson.get(p.id);
            if (!row) return null;
            const use = shareUseNote(state, pump.id, p.id, day.date);
            return `نصيبه ${formatDuration(row.shareMin)}${p.phone ? ` · ${p.phone}` : ""}${
              use ? ` · ${use.label}` : ""
            }`;
          }}
          onSelect={(p) => pickPerson(p.id)}
        />
      ) : null}
    </Modal>
  );
}

/* ----------------------------- أدوات محلية ----------------------------- */

