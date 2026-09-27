/**
 * لوحة المساهمين الأساسيين داخل شاشة اليوم الفعلي.
 * قاعدة (§3, §14): المساهم الأساسي سجل مرجعي ثابت — لا يتغيّر بتغيّر اليوم الفعلي،
 * ولا يُحذف ولا يُعاد ترتيبه من هنا. ما يُسجَّل هنا هو:
 * بيانات المساهم + حالة استخدام سهمه (مستمر / مؤاجر / مناقل / بايع)
 * وإن كان مؤاجرًا أو بايعًا أو مناقلًا فيُسجَّل الطرف الآخر بالاسم والرقم
 * ويصبح من ضمن المستخدمين الفعليين مع بقاء المساهم الأساسي كما هو.
 */
import { useMemo, useState } from "react";
import {
  ArrowLeftRight,
  Phone,
  RotateCcw,
  ShieldCheck,
  UserPlus,
  Users,
} from "lucide-react";
import { useApp } from "../../store";
import type { DayEntry, Person, RightKind, ShareRight, Shareholder, ShareholderUseStatus } from "../../domain/types";
import {
  USE_STATUS_OPTIONS,
  activeShareholders,
  currentRight,
  findPerson,
  shareholderUsageRows,
  useStatusLabel,
  useStatusRightKind,
  useStatusTone,
} from "../../domain/rules";
import { formatNumber } from "../../format";
import { isoToShort, minutesToTime, timeToMinutes, todayISO, uid } from "../../domain/util";
import {
  Button,
  Card,
  Field,
  Modal,
  NumberInput,
  Pill,
  TextArea,
  TextInput,
  cx,
} from "../../components/ui";
import PersonPicker from "../../components/PersonPicker";

type CounterpartStatus = Exclude<ShareholderUseStatus, "continuing">;

export default function ShareholdersPanel({
  dayId,
  actor,
}: {
  dayId: string | null;
  actor: string;
}) {
  const { state } = useApp();
  const pump = state.pump!;
  const rows = useMemo(() => shareholderUsageRows(state, pump.id), [state, pump.id]);
  const [addOpen, setAddOpen] = useState(false);
  const [statusFor, setStatusFor] = useState<{ shareholder: Shareholder; status: CounterpartStatus } | null>(
    null
  );
  const [returnFor, setReturnFor] = useState<Shareholder | null>(null);
  const [note, setNote] = useState("");

  const rentedCount = rows.filter((r) => r.status === "rented").length;

  return (
    <Card className="p-4" >
      <div className="flex items-center gap-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
          <Users size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h2 className="text-sm font-extrabold text-gray-800 dark:text-white">المساهمون الأساسيون</h2>
            <Pill tone="gray">سجل مرجعي ثابت</Pill>
            <Pill tone="green">{rows.length} مساهم</Pill>
            {rentedCount > 0 ? <Pill tone="amber">{rentedCount} مؤاجر</Pill> : null}
          </div>
          <p className="mt-0.5 text-[11px] leading-relaxed text-gray-400">
            ثابتون ولا يتغيّرون بتغيّر اليوم الفعلي — لا تقديم ولا تأخير ولا حذف من هنا. الترتيب والتنفيذ يكونان في
            قسم المستخدمين الفعليين.
          </p>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="mt-3 rounded-2xl bg-gray-50 px-3 py-3 text-center text-xs text-gray-500 dark:bg-slate-700 dark:text-slate-300">
          لا يوجد مساهمون أساسيون مسجّلون بعد — سجّل المساهم الأول بالاسم والرقم ثم حدّد حالة استخدام سهمه.
        </p>
      ) : (
        <div className="mt-3 space-y-2">
          {rows.map((row) => {
            const sh = row.shareholder;
            /**
             * مصدر الحقيقة لحالة السهم هو سجل الحقوق (§23):
             * إن وُجد حق نشط فهو الحالة، وحقول useStatus/counterpart تبقى للتوافق والعرض التاريخي فقط.
             */
            const rightStatus: ShareholderUseStatus = row.activeRight
              ? row.activeRight.kind === "rent"
                ? "rented"
                : "transferred"
              : row.status;
            const legacyOnly = !row.activeRight && row.status !== "continuing";
            return (
              <div
                key={sh.id}
                className="rounded-2xl border border-gray-100 p-3 dark:border-slate-700"
                data-testid={`shareholder-${sh.id}`}
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gray-100 text-xs font-black text-gray-600 dark:bg-slate-700 dark:text-slate-200">
                    {sh.baseOrder + 1}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="truncate text-sm font-extrabold text-gray-900 dark:text-white">
                        {row.person?.name ?? "—"}
                      </span>
                      <Pill tone={useStatusTone(rightStatus)}>{useStatusLabel(rightStatus)}</Pill>
                      {row.activeRight ? <Pill tone="gray">من سجل الحقوق</Pill> : null}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-gray-400">
                      {row.person?.phone ? (
                        <span className="flex items-center gap-1">
                          <Phone size={11} /> {row.person.phone}
                        </span>
                      ) : (
                        <span>بلا رقم مسجّل</span>
                      )}
                      <span>
                        {formatNumber(sh.units)} {pump.shareUnit}
                        {sh.baseHoursMin > 0 ? ` · ${sh.baseHoursMin / 60} ساعة أساسية` : ""}
                      </span>
                    </div>
                    {row.activeRight && row.currentHolder && row.currentHolder.id !== sh.personId ? (
                      <div className="mt-1 rounded-xl bg-sky-50 px-2.5 py-1.5 text-[11px] font-bold text-sky-800 dark:bg-sky-900/20 dark:text-sky-300">
                        صاحب الحق الحالي (من سجل الحقوق): {row.currentHolder.name} ·{" "}
                        {row.activeRight.kind === "rent" ? "تأجير" : row.activeRight.kind === "gift" ? "إعطاء" : row.activeRight.kind === "loan" ? "إعارة" : "نقل حق"}
                        {row.activeRight.startedAt ? ` من ${isoToShort(row.activeRight.startedAt)}` : ""}
                        {row.counterpartPhone ? ` — ${row.counterpartPhone}` : ""}
                      </div>
                    ) : legacyOnly ? (
                      <div className="mt-1 rounded-xl bg-amber-50 px-2.5 py-1.5 text-[11px] font-bold text-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
                        حالة قديمة مسجّلة (لا يوجد حق نشط حاليًا):{" "}
                        {row.status === "rented" ? "المستأجر" : row.status === "sold" ? "المالك الجديد" : "المتنازل له"}:{" "}
                        {row.counterpart?.name ?? "—"}
                        {row.counterpartPhone ? ` — ${row.counterpartPhone}` : ""}
                        {sh.useStatusAt ? ` · من ${isoToShort(sh.useStatusAt)}` : ""}
                      </div>
                    ) : null}
                    {sh.useStatusNote ? (
                      <div className="mt-1 text-[10px] text-gray-400">{sh.useStatusNote}</div>
                    ) : null}
                  </div>
                </div>

                <div className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
                  {USE_STATUS_OPTIONS.map((opt) => (
                    <button
                      key={opt.id}
                      onClick={() => {
                        if (opt.id === "continuing") {
                          if (rightStatus === "continuing") return;
                          setReturnFor(sh);
                          return;
                        }
                        if (opt.id === "rented" || opt.id === "transferred" || opt.id === "sold") {
                          setStatusFor({ shareholder: sh, status: opt.id });
                        }
                      }}
                      aria-label={`حالة ${row.person?.name ?? ""}: ${opt.label}`}
                      title={opt.hint}
                      className={cx(
                        "rounded-xl border px-2 py-1.5 text-[11px] font-bold transition",
                        rightStatus === opt.id
                          ? "border-emerald-400 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                          : "border-gray-200 text-gray-500 hover:border-emerald-200 dark:border-slate-600 dark:text-slate-300"
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Button variant="secondary" className="mt-3 w-full" onClick={() => setAddOpen(true)}>
        <UserPlus size={18} /> تسجيل مساهم أساسي (اسم + رقم)
      </Button>

      {note ? (
        <p className="mt-2 rounded-2xl bg-emerald-50 px-3 py-2 text-[11px] font-bold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
          {note}
        </p>
      ) : null}
      <p className="mt-2 text-[10px] leading-relaxed text-gray-400">
        تسجيل الحالة لا يحذف المساهم ولا تاريخه — مصدر الحقيقة لصاحب الحق هو <b>سجل الحقوق</b>، وكل تغيير يُحفظ
        فيه وفي سجل التدقيق ولا يستبدل العلاقة السابقة.
      </p>

      {addOpen ? (
        <AddShareholderModal
          onClose={() => setAddOpen(false)}
          onDone={(name) => {
            setNote(`سُجّل المساهم الأساسي ${name}.`);
            setAddOpen(false);
          }}
        />
      ) : null}

      {statusFor ? (
        <UseStatusModal
          shareholder={statusFor.shareholder}
          status={statusFor.status}
          dayId={dayId}
          actor={actor}
          onClose={() => setStatusFor(null)}
          onDone={(message) => {
            setNote(message);
            setStatusFor(null);
          }}
        />
      ) : null}

      {returnFor ? (
        <ReturnModal
          shareholder={returnFor}
          actor={actor}
          onClose={() => setReturnFor(null)}
          onDone={(message) => {
            setNote(message);
            setReturnFor(null);
          }}
        />
      ) : null}
    </Card>
  );
}

/* ------------------------- تسجيل مساهم أساسي جديد ------------------------ */

function AddShareholderModal({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: (name: string) => void;
}) {
  const { state, actions } = useApp();
  const pump = state.pump!;
  const [picked, setPicked] = useState<Person | null>(null);
  const [picking, setPicking] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [units, setUnits] = useState(1);
  const [baseHours, setBaseHours] = useState(0);
  const [order, setOrder] = useState(activeShareholders(state, pump.id).length);
  const [notes, setNotes] = useState("");

  const finalName = picked?.name ?? name;

  return (
    <Modal open onClose={onClose} title="تسجيل مساهم أساسي">
      <div className="space-y-3">
        <Field label="المساهم الأساسي" hint="اختر شخصًا مسجّلًا أو اكتب اسمًا جديدًا مع رقمه">
          <button
            onClick={() => setPicking(true)}
            className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-right text-sm font-bold text-gray-800 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
          >
            {finalName || "اختيار شخص مسجّل / كتابة اسم جديد"}
          </button>
        </Field>

        {!picked ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="اسم المساهم">
              <TextInput value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            </Field>
            <Field label="رقمه (الهاتف)">
              <TextInput
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                dir="ltr"
                className="text-left"
                placeholder="7XXXXXXXX"
              />
            </Field>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Field label="اسم المساهم">
              <TextInput value={picked.name} onChange={(e) => setPicked({ ...picked, name: e.target.value })} />
            </Field>
            <Field label="رقمه (الهاتف)">
              <TextInput
                value={picked.phone}
                onChange={(e) => setPicked({ ...picked, phone: e.target.value })}
                dir="ltr"
                className="text-left"
              />
            </Field>
          </div>
        )}

        <div className="grid grid-cols-3 gap-3">
          <Field label={`الحصص (${pump.shareUnit})`}>
            <NumberInput value={units} onChange={(e) => setUnits(Number(e.target.value))} />
          </Field>
          <Field label="الساعات الأساسية" hint="0 = تُحسب من الحصص">
            <NumberInput value={baseHours} onChange={(e) => setBaseHours(Number(e.target.value))} />
          </Field>
          <Field label="ترتيب الدور">
            <NumberInput value={order} onChange={(e) => setOrder(Number(e.target.value))} />
          </Field>
        </div>

        <Field label="ملاحظات">
          <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </Field>

        <p className="rounded-2xl bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
          المساهم الأساسي سجل مرجعي: يُضاف إلى سجل المساهمين ويبقى ثابتًا في كل الأيام ولا يُحذف من شاشة اليوم.
        </p>

        <Button
          className="w-full"
          disabled={!finalName.trim()}
          onClick={() => {
            const trimmedName = finalName.trim();
            const trimmedPhone = (picked ? picked.phone : phone).trim();
            const person: Person = picked
              ? { ...picked, name: trimmedName, phone: trimmedPhone }
              : {
                  id: uid("pr"),
                  name: trimmedName,
                  phone: trimmedPhone,
                  nationalId: "",
                  notes: "",
                  guest: false,
                  archived: false,
                  createdAt: new Date().toISOString(),
                  createdBy: "manager",
                };
            actions.savePerson(person, !picked);
            const sh: Shareholder = {
              id: uid("sh"),
              pumpId: pump.id,
              personId: person.id,
              shareNo: activeShareholders(state, pump.id).length + 1,
              units,
              baseHoursMin: Math.round(baseHours * 60),
              baseOrder: order,
              startDate: todayISO(),
              endDate: null,
              status: "active",
              useStatus: "continuing",
              counterpartPersonId: null,
              counterpartPhone: "",
              useStatusAt: todayISO(),
              useStatusNote: "",
              notes,
              archived: false,
              createdAt: new Date().toISOString(),
            };
            actions.saveShareholder(sh, true);
            onDone(person.name);
          }}
        >
          <ShieldCheck size={16} /> تسجيل المساهم
        </Button>
      </div>

      {picking ? (
        <PersonPicker
          open
          onClose={() => setPicking(false)}
          pumpId={pump.id}
          title="اختيار المساهم الأساسي"
          onSelect={(person) => setPicked(person)}
        />
      ) : null}
    </Modal>
  );
}

/* ----------------- حالة السهم: مؤاجر / مناقل / بايع (طرف آخر) ------------- */

const FIELD_LABEL: Record<CounterpartStatus, string> = {
  rented: "اسم المستأجر",
  transferred: "اسم المتنازل له",
  sold: "اسم المالك الجديد",
};

function UseStatusModal({
  shareholder,
  status,
  dayId,
  actor,
  onClose,
  onDone,
}: {
  shareholder: Shareholder;
  status: CounterpartStatus;
  dayId: string | null;
  actor: string;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const { state, actions } = useApp();
  const pump = state.pump!;
  const owner = findPerson(state, shareholder.personId);
  const existing = currentRight(state, shareholder.id);
  const [picked, setPicked] = useState<Person | null>(null);
  const [picking, setPicking] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [startedAt, setStartedAt] = useState(todayISO());
  const [endedAt, setEndedAt] = useState("");
  const [amount, setAmount] = useState(0);
  const [agreement, setAgreement] = useState("");
  const [notes, setNotes] = useState("");
  const [addToDay, setAddToDay] = useState(!!dayId);

  const finalName = picked?.name ?? name;
  const finalPhone = (picked ? picked.phone : phone).trim();
  const actionLabel = USE_STATUS_OPTIONS.find((o) => o.id === status)?.label ?? "";

  return (
    <Modal open onClose={onClose} title={`حالة السهم: ${actionLabel}`}>
      <div className="space-y-3">
        <div className="rounded-2xl bg-emerald-50 px-3 py-2 text-[11px] leading-relaxed text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
          المساهم الأساسي <b>{owner?.name ?? "—"}</b> يبقى ثابتًا كما هو — يُسجَّل فقط {FIELD_LABEL[status]} ورقمه،
          ويصبح من ضمن المستخدمين الفعليين.
          {existing
            ? ` سيُنهى الحق الحالي (${findPerson(state, existing.holderPersonId)?.name ?? "—"}) عند تاريخ البداية مع حفظ تاريخه.`
            : ""}
        </div>

        <Field label={FIELD_LABEL[status]}>
          <button
            onClick={() => setPicking(true)}
            className="w-full rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3 text-right text-sm font-bold text-gray-800 dark:border-slate-600 dark:bg-slate-700 dark:text-white"
          >
            {finalName || "اختيار من المسجّلين أو كتابة اسم جديد"}
          </button>
        </Field>

        {!picked ? (
          <div className="grid grid-cols-2 gap-3">
            <Field label="الاسم">
              <TextInput value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            </Field>
            <Field label="رقمه (الهاتف)">
              <TextInput
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                dir="ltr"
                className="text-left"
                placeholder="7XXXXXXXX"
              />
            </Field>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Field label="الاسم">
              <TextInput value={picked.name} onChange={(e) => setPicked({ ...picked, name: e.target.value })} />
            </Field>
            <Field label="رقمه (الهاتف)">
              <TextInput
                value={picked.phone}
                onChange={(e) => setPicked({ ...picked, phone: e.target.value })}
                dir="ltr"
                className="text-left"
              />
            </Field>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field label="من تاريخ">
            <TextInput type="date" value={startedAt} onChange={(e) => setStartedAt(e.target.value)} />
          </Field>
          <Field label="إلى تاريخ (اختياري)" hint="مثال: نهاية سنة التأجير">
            <TextInput type="date" value={endedAt} onChange={(e) => setEndedAt(e.target.value)} />
          </Field>
        </div>

        {status !== "transferred" ? (
          <Field label="قيمة الاتفاق (اختياري)" hint="تُحفظ مع العملية ولا تُغيّر العمليات القديمة">
            <NumberInput value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
          </Field>
        ) : null}

        <Field label="وصف الاتفاق / ملاحظة">
          <TextInput
            value={agreement}
            onChange={(e) => setAgreement(e.target.value)}
            placeholder={status === "rented" ? "مثال: تأجير سنة كاملة" : status === "sold" ? "مثال: بيع السهم" : "مثال: تنازل عن السهم"}
          />
        </Field>
        <Field label="ملاحظات">
          <TextArea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
        </Field>

        {dayId ? (
          <label className="flex items-center justify-between rounded-2xl bg-gray-50 px-3 py-3 dark:bg-slate-700">
            <span className="text-[11px] font-bold text-gray-700 dark:text-slate-200">
              إضافة {FIELD_LABEL[status]} إلى مستخدمي هذا اليوم
            </span>
            <input
              type="checkbox"
              checked={addToDay}
              onChange={(e) => setAddToDay(e.target.checked)}
              className="h-5 w-5 accent-emerald-600"
            />
          </label>
        ) : null}

        <Button
          className="w-full"
          disabled={!finalName.trim()}
          onClick={() => {
            const trimmed = finalName.trim();
            const person: Person = picked
              ? { ...picked, name: trimmed, phone: finalPhone }
              : {
                  id: uid("pr"),
                  name: trimmed,
                  phone: finalPhone,
                  nationalId: "",
                  notes: "",
                  guest: false,
                  archived: false,
                  createdAt: new Date().toISOString(),
                  createdBy: "manager",
                };
            actions.savePerson(person, !picked);

            const kind: RightKind = useStatusRightKind(status);
            const right: ShareRight = {
              id: uid("rt"),
              pumpId: pump.id,
              shareholderId: shareholder.id,
              fromPersonId: existing?.holderPersonId ?? shareholder.personId,
              holderPersonId: person.id,
              kind,
              hoursMin: shareholder.baseHoursMin || 0,
              amount: status === "transferred" ? 0 : amount,
              agreement: agreement || (status === "sold" ? "بيع السهم" : status === "rented" ? "تأجير السهم" : "نقل السهم"),
              startedAt,
              endedAt: endedAt || null,
              toPumpId: null,
              status: "active",
              notes,
              parentId: existing?.id ?? null,
              createdAt: new Date().toISOString(),
              createdBy: actor || "manager",
            };
            actions.addRight(right, !!existing);

            actions.saveShareholder(
              {
                ...shareholder,
                useStatus: status,
                counterpartPersonId: person.id,
                counterpartPhone: finalPhone,
                useStatusAt: startedAt,
                useStatusNote: notes || agreement,
              },
              false
            );

            let addedToDay = false;
            if (dayId && addToDay) {
              const day = state.days.find((d) => d.id === dayId) ?? null;
              const list = state.entries
                .filter((e) => e.dayId === dayId && !e.archived)
                .sort((a, b) => a.orderIndex - b.orderIndex);
              const last = list[list.length - 1];
              const startMin = last ? timeToMinutes(last.endTime) : timeToMinutes(day?.workStart ?? pump.workStart);
              const span = shareholder.baseHoursMin || 60;
              const entry: DayEntry = {
                id: uid("en"),
                dayId,
                pumpId: pump.id,
                orderIndex: list.length,
                personId: person.id,
                role: status === "rented" ? "tenant" : "right_holder",
                shareholderId: shareholder.id,
                rightId: right.id,
                startTime: minutesToTime(startMin),
                endTime: minutesToTime(startMin + span),
                plannedMin: span,
                actualPersonId: null,
                usageId: null,
                status: "planned",
                postponeToDayId: null,
                reason: "",
                notes: `${actionLabel} — طرف آخر لسهم ${owner?.name ?? ""}`,
                createdAt: new Date().toISOString(),
                createdBy: actor || "manager",
                archived: false,
              };
              actions.saveEntry(entry, true);
              addedToDay = true;
            }

            onDone(
              `سُجّل ${trimmed} (${actionLabel})${finalPhone ? ` — ${finalPhone}` : ""}${
                addedToDay ? " · وأُضيف إلى المستخدمين الفعليين في هذا اليوم" : ""
              }. المساهم الأساسي ${owner?.name ?? ""} بقي ثابتًا.`
            );
          }}
        >
          <ArrowLeftRight size={16} /> تسجيل الحالة والطرف الآخر
        </Button>
      </div>

      {picking ? (
        <PersonPicker
          open
          onClose={() => setPicking(false)}
          pumpId={pump.id}
          title={`اختيار ${FIELD_LABEL[status]}`}
          onSelect={(person) => setPicked(person)}
        />
      ) : null}
    </Modal>
  );
}

/* ------------------- إعادة الحالة إلى «مستمر» (عودة الحق) ---------------- */
function ReturnModal({
  shareholder,
  actor,
  onClose,
  onDone,
}: {
  shareholder: Shareholder;
  actor: string;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const { state, actions } = useApp();
  const owner = findPerson(state, shareholder.personId);
  const existing = currentRight(state, shareholder.id);
  const [date, setDate] = useState(todayISO());
  const [reason, setReason] = useState("عودة السهم إلى المساهم الأساسي");

  return (
    <Modal open onClose={onClose} title="حالة السهم: مستمر">
      <div className="space-y-3">
        <p className="rounded-2xl bg-emerald-50 px-3 py-3 text-xs leading-relaxed text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
          يعود الاستخدام إلى المساهم الأساسي <b>{owner?.name ?? "—"}</b>
          {existing
            ? ` وينتهي حق ${findPerson(state, existing.holderPersonId)?.name ?? "—"} بتاريخ الإنهاء مع حفظ تاريخه كاملًا.`
            : "."}
        </p>
        <Field label="تاريخ العودة / الإنهاء">
          <TextInput type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="السبب">
          <TextInput value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <div className="flex gap-2">
          <Button variant="ghost" className="flex-1" onClick={onClose}>
            رجوع
          </Button>
          <Button
            className="flex-1"
            onClick={() => {
              if (existing) actions.endRight(existing.id, date, reason, actor || "manager");
              actions.saveShareholder(
                {
                  ...shareholder,
                  useStatus: "continuing",
                  counterpartPersonId: null,
                  counterpartPhone: "",
                  useStatusAt: date,
                  useStatusNote: reason,
                },
                false
              );
              onDone(`عاد سهم ${owner?.name ?? ""} إليه — الحالة الآن «مستمر».`);
            }}
          >
            <RotateCcw size={16} /> تأكيد العودة
          </Button>
        </div>
      </div>
    </Modal>
  );
}
