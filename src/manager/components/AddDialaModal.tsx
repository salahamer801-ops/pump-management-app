/**
 * إضافة ديالة — كل معلومات الديالة داخل زر منبثق (نافذة واحدة).
 * الديالة أم أيام المساهمة: تُحدَّد البداية وعدد الأيام، فتُسمّى أيامها
 * اليوم الأول، الثاني… حتى آخر يوم، ثم يعود الدوران بديالة جديدة.
 */
import { useMemo, useState } from "react";
import { CalendarPlus, Layers, ShieldCheck } from "lucide-react";
import { useApp } from "../../store";
import type { DialaRound } from "../../domain/types";
import { dayOrdinal, roundDates, roundEndDate, suggestRoundDays } from "../../domain/rules";
import { addDaysISO, isoToDisplay, isoToWeekday, todayISO, uid } from "../../domain/util";
import { Button, Field, Modal, NumberInput, TextInput, cx } from "../../components/ui";

const DAY_PRESETS = [3, 5, 7, 10, 15, 30];

export function AddDialaModal({
  startDate: initialStart,
  lockAfterCreate = false,
  onClose,
  onCreated,
}: {
  /** يوم بداية مقترح (يُعدّله المستخدم داخل النافذة) */
  startDate?: string;
  /** حفظ الديالة فور إنشائها فلا تُحذف أيامها بسهولة */
  lockAfterCreate?: boolean;
  onClose: () => void;
  onCreated?: (round: DialaRound) => void;
}) {
  const { state, actions } = useApp();
  const pump = state.pump!;
  const [startDate, setStartDate] = useState(initialStart || todayISO());
  const [days, setDays] = useState(() => suggestRoundDays(state));
  const [notes, setNotes] = useState("");
  const [lockIt, setLockIt] = useState(lockAfterCreate);

  const count = Math.floor(Number(days) || 0);
  const validDays = count >= 1 && count <= 400;
  const endDate = startDate && validDays ? roundEndDate(startDate, count) : "";
  const plannedDates = useMemo(
    () => (startDate && validDays ? roundDates(startDate, count) : []),
    [startDate, validDays, count]
  );
  const takenDates = plannedDates.filter((d) => state.days.some((x) => !x.archived && x.date === d));
  const freshCount = plannedDates.length - takenDates.length;

  const create = () => {
    if (!startDate || !validDays || freshCount === 0) return;
    const round: DialaRound = {
      id: uid("rnd"),
      pumpId: pump.id,
      number: state.counters.round,
      startDate,
      days: count,
      endDate: roundEndDate(startDate, count),
      locked: lockIt,
      lockedAt: lockIt ? new Date().toISOString() : "",
      lockedBy: lockIt ? "manager" : "",
      notes: notes.trim(),
      createdAt: new Date().toISOString(),
      createdBy: "manager",
      archived: false,
    };
    actions.createRound(round, plannedDates);
    onCreated?.(round);
    onClose();
  };

  return (
    <Modal open onClose={onClose} title="إضافة ديالة">
      <div className="space-y-3">
        <p className="text-[11px] leading-relaxed text-gray-500 dark:text-slate-300">
          حدّد يوم بداية الديالة وعدد أيامها (المدة / مرحلة الدوران)، ويُحسب تاريخ النهاية تلقائيًا. أيام الديالة
          تُسمّى اليوم الأول، الثاني… حتى آخر يوم، ثم يعود الدوران بديالة جديدة.
        </p>

        <Field label="يوم بداية الديالة">
          <TextInput
            type="date"
            dir="ltr"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            aria-label="يوم بداية الديالة"
          />
        </Field>

        <Field label="عدد أيام الديالة">
          <NumberInput
            min={1}
            max={400}
            value={days || ""}
            onChange={(e) => setDays(Number(e.target.value))}
            aria-label="عدد أيام الديالة"
          />
        </Field>

        <div className="flex flex-wrap gap-1.5">
          {DAY_PRESETS.map((n) => (
            <button
              key={n}
              onClick={() => setDays(n)}
              className={cx(
                "rounded-full border px-3 py-1 text-[11px] font-bold transition",
                count === n
                  ? "border-emerald-400 bg-emerald-50 text-emerald-700"
                  : "border-gray-200 text-gray-500 hover:border-emerald-200 dark:border-slate-600 dark:text-slate-300"
              )}
            >
              {n} أيام
            </button>
          ))}
        </div>

        <div className="rounded-2xl bg-emerald-50 px-3 py-3 dark:bg-emerald-900/30">
          <div className="text-[11px] font-bold text-emerald-600 dark:text-emerald-300">
            تاريخ نهاية الديالة (محسوب)
          </div>
          <div className="mt-0.5 text-base font-black text-emerald-800 dark:text-emerald-200">
            {endDate ? isoToDisplay(endDate) : "—"}
          </div>
          <div className="text-[10px] text-emerald-700 dark:text-emerald-300">
            {validDays && endDate
              ? `${isoToWeekday(endDate)} · ${count} يوم — من اليوم الأول إلى اليوم ${dayOrdinal(count)}`
              : "أدخل يوم البداية وعدد الأيام"}
          </div>
        </div>

        <Field label="ملاحظات الديالة (اختياري)" hint="مثال: المدة الأولى، أو مرحلة دوران معيّنة">
          <TextInput
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="اختياري"
            aria-label="ملاحظات الديالة"
          />
        </Field>

        <label className="flex items-start gap-2 rounded-2xl bg-gray-50 px-3 py-2 dark:bg-slate-700">
          <input
            type="checkbox"
            checked={lockIt}
            onChange={(e) => setLockIt(e.target.checked)}
            className="mt-0.5 h-4 w-4 accent-emerald-600"
            aria-label="حفظ الديالة بعد الإنشاء"
          />
          <span className="text-[11px] leading-relaxed text-gray-600 dark:text-slate-300">
            <b>حفظ أيام الديالة بعد الإنشاء</b> — تُثبَّت الأيام فلا تُحذف ولا تُؤرشف إلا بفك الحفظ بسبب موثّق.
          </span>
        </label>

        {!validDays ? (
          <p className="rounded-2xl bg-red-50 px-3 py-2 text-[11px] font-bold text-red-600 dark:bg-red-900/20 dark:text-red-300">
            أدخل عدد أيام صحيح (من 1 إلى 400).
          </p>
        ) : freshCount === 0 ? (
          <p className="rounded-2xl bg-amber-50 px-3 py-2 text-[11px] font-bold text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
            كل أيام هذه المدة مسجّلة بالفعل — اختر يوم بداية مختلفًا أو غيّر عدد الأيام.
          </p>
        ) : (
          <p className="rounded-2xl bg-gray-50 px-3 py-2 text-[11px] leading-relaxed text-gray-500 dark:bg-slate-700 dark:text-slate-300">
            سيُنشأ {freshCount} يوم بقوائم أساسيين <b>فارغة</b> — تضيف أساسيي كل يوم بنفسك. الديالة رقم{" "}
            {state.counters.round}
            {takenDates.length > 0 ? ` · ${takenDates.length} يوم مسجّل مسبقًا سيُترك كما هو` : ""}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <Button className="flex-1" onClick={create} disabled={!validDays || freshCount === 0}>
            <CalendarPlus size={18} /> إضافة الديالة ({validDays ? freshCount : 0} يوم)
          </Button>
          <Button variant="ghost" onClick={onClose}>
            إلغاء
          </Button>
        </div>

        {lockIt ? (
          <p className="flex items-center gap-1.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
            <ShieldCheck size={12} /> ستُحفظ الديالة فور إنشائها — أيامها لا تُحذف بسهولة.
          </p>
        ) : (
          <p className="flex items-center gap-1.5 text-[10px] text-gray-400">
            <Layers size={12} /> يمكنك حفظ الديالة لاحقًا بزر «حفظ أيام الديالة» في قائمة الديالات.
          </p>
        )}
      </div>
    </Modal>
  );
}

/** زر إضافة ديالة — يفتح النافذة المنبثقة */
export function AddDialaButton({
  startDate,
  lockAfterCreate = false,
  onCreated,
  label = "إضافة ديالة",
  className,
}: {
  startDate?: string;
  lockAfterCreate?: boolean;
  onCreated?: (round: DialaRound) => void;
  label?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const { state } = useApp();
  const suggested = startDate ?? nextStartDate(state.rounds.map((r) => r.endDate));
  return (
    <>
      <Button className={className} onClick={() => setOpen(true)} aria-label="إضافة ديالة">
        <CalendarPlus size={18} /> {label}
      </Button>
      {open ? (
        <AddDialaModal
          startDate={suggested}
          lockAfterCreate={lockAfterCreate}
          onClose={() => setOpen(false)}
          onCreated={onCreated}
        />
      ) : null}
    </>
  );
}

/** يوم البداية المقترح: اليوم التالي لآخر ديالة مسجّلة */
function nextStartDate(endDates: string[]): string {
  const latest = endDates.slice().sort().pop();
  if (!latest) return todayISO();
  const next = addDaysISO(latest, 1);
  return next > todayISO() ? next : todayISO();
}
