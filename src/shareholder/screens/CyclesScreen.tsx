import { useMemo, useState } from "react";
import {
  CalendarPlus,
  Check,
  Clock,
  Droplets,
  Layers,
  Plus,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { useShareholder } from "../store";
import {
  activeCycles,
  activePumps,
  currentDayOfCycle,
  dayContributors,
  dayFilledHours,
  findCycle,
  findPump,
} from "../selectors";
import {
  cycleDayDate,
  cycleName,
  durationToHours,
  minutesToTime,
  splitDuration,
  timeToMinutes,
  uid,
} from "../calc";
import { formatDayDate, formatDurationHours, formatTimeAmPm } from "../format";
import type { DayContributor, DayShareType, ShareholderCycle } from "../types";
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
} from "../../components/ui";

const SHARE_TYPES: { value: DayShareType; label: string; tone: "green" | "blue" | "amber" }[] = [
  { value: "owned", label: "ملك", tone: "green" },
  { value: "purchase", label: "شراء", tone: "blue" },
  { value: "loan", label: "سلف", tone: "amber" },
];

function shareTypeInfo(type: DayShareType) {
  return SHARE_TYPES.find((s) => s.value === type) ?? SHARE_TYPES[0];
}

export default function CyclesScreen() {
  const { state, actions } = useShareholder();
  const pumps = activePumps(state);
  const cycles = activeCycles(state);
  const [open, setOpen] = useState(false);
  const [dayDetail, setDayDetail] = useState<{ cycleId: string; dayIndex: number } | null>(null);
  const [form, setForm] = useState({
    pumpId: "",
    startDate: new Date().toISOString().slice(0, 10),
    days: 17,
  });

  const previewName = useMemo(
    () => (form.startDate ? cycleName(form.startDate, Number(form.days) || 1) : ""),
    [form.startDate, form.days]
  );

  const save = () => {
    if (!form.pumpId) return;
    const cycle: ShareholderCycle = {
      id: uid(),
      pumpId: form.pumpId,
      name: previewName,
      startDate: form.startDate,
      days: Math.max(1, Number(form.days) || 1),
      createdAt: new Date().toISOString(),
      archived: false,
    };
    actions.addCycle(cycle);
    setOpen(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-gray-900 dark:text-white">الدياله</h1>
          <p className="mt-0.5 text-[11px] font-bold text-gray-400 dark:text-slate-400">
            ديالاتي المسجَّلة في سجلي الخاص
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          disabled={pumps.length === 0}
          aria-label="إضافة الدياله"
          data-testid="open-form"
          className="flex shrink-0 items-center gap-1.5 rounded-full bg-gradient-to-l from-emerald-600 to-emerald-500 px-4 py-2.5 text-xs font-extrabold text-white shadow-lg shadow-emerald-600/25 transition active:scale-95 disabled:opacity-40 disabled:shadow-none"
        >
          <Plus size={16} /> إضافة
        </button>
      </div>

      {pumps.length === 0 ? (
        <EmptyState
          icon={<Droplets size={26} />}
          title="أضف مضخة أولًا"
          description="لا يمكن إنشاء دياله بدون مضخة."
        />
      ) : cycles.length === 0 ? (
        <EmptyState
          icon={<Layers size={26} />}
          title="لا توجد ديالات"
          description="أنشئ دياله لكل مضخة وسيُحسب اسمها تلقائيًا من التاريخ."
          action={
            <Button onClick={() => setOpen(true)}>
              <CalendarPlus size={18} /> إنشاء دياله
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {pumps.map((pump) => {
            const pumpCycles = cycles.filter((c) => c.pumpId === pump.id);
            if (pumpCycles.length === 0) return null;
            return (
              <div key={pump.id}>
                <div className="mb-2 flex items-center gap-2 px-1 text-sm font-extrabold text-gray-700 dark:text-slate-200">
                  <Droplets size={16} className="text-emerald-600" /> {pump.name}
                </div>
                <div className="space-y-2">
                  {pumpCycles.map((cycle) => (
                    <CycleCard
                      key={cycle.id}
                      cycle={cycle}
                      pump={pump}
                      onOpenDay={(dayIndex) => setDayDetail({ cycleId: cycle.id, dayIndex })}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="إضافة دياله">
        <div className="space-y-4">
          <Field label="المضخة">
            <Select value={form.pumpId} onChange={(e) => setForm({ ...form, pumpId: e.target.value })}>
              <option value="">اختر مضخة…</option>
              {pumps.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="تاريخ بداية الدياله">
              <TextInput
                type="date"
                dir="ltr"
                value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })}
              />
            </Field>
            <Field label="عدد الأيام">
              <NumberInput
                value={form.days || ""}
                onChange={(e) => setForm({ ...form, days: Number(e.target.value) })}
              />
            </Field>
          </div>
          <div className="rounded-2xl bg-emerald-50 p-3 text-center dark:bg-emerald-900/30">
            <div className="text-xs text-emerald-600 dark:text-emerald-300">اسم الدياله تلقائيًا</div>
            <div className="text-sm font-black text-emerald-800 dark:text-emerald-200">{previewName}</div>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setOpen(false)} className="flex-1">
              إلغاء
            </Button>
            <Button onClick={save} disabled={!form.pumpId} className="flex-1">
              حفظ
            </Button>
          </div>
        </div>
      </Modal>

      {dayDetail && (
        <DayDetailModal
          cycleId={dayDetail.cycleId}
          dayIndex={dayDetail.dayIndex}
          onClose={() => setDayDetail(null)}
        />
      )}
    </div>
  );
}

function CycleCard({
  cycle,
  pump,
  onOpenDay,
}: {
  cycle: ShareholderCycle;
  pump: ReturnType<typeof activePumps>[number];
  onOpenDay: (dayIndex: number) => void;
}) {
  const { state } = useShareholder();
  const currentDay = currentDayOfCycle(cycle);
  const days = Array.from({ length: cycle.days }, (_, i) => i + 1);
  const dailyHours = pump.dailyHours || 0;

  return (
    <Card className="p-3">
      <div className="flex items-center justify-between">
        <div className="font-extrabold text-gray-900 dark:text-white">{cycle.name}</div>
        <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400">
          {currentDay !== null ? `اليوم ${currentDay}` : `${cycle.days} يوم`}
        </span>
      </div>
      <div className="mt-1 text-[11px] text-gray-400 dark:text-slate-400">
        اضغط على أي يوم لإدارة مساهميه (دوام {formatDurationHours(dailyHours)} يوميًا)
      </div>
      <div className="mt-2 grid grid-cols-7 gap-1">
        {days.map((day) => {
          const date = cycleDayDate(cycle.startDate, day);
          const isToday = currentDay === day;
          const isPast = currentDay !== null && day < currentDay;
          const filled = dayFilledHours(state, cycle.id, day);
          const pct = dailyHours > 0 ? Math.min(100, Math.round((filled / dailyHours) * 100)) : 0;
          const isFull = dailyHours > 0 && filled >= dailyHours - 0.001;
          const label = `اليوم ${day} — ${formatDayDate(date)} · مسجّل ${formatDurationHours(filled)} من ${formatDurationHours(dailyHours)}`;
          return (
            <button
              key={day}
              onClick={() => onOpenDay(day)}
              title={label}
              aria-label={label}
              className={`relative flex h-11 flex-col items-center justify-center overflow-hidden rounded-lg text-xs font-bold transition ${
                isFull
                  ? "bg-emerald-600 text-white"
                  : filled > 0
                    ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200"
                    : isPast
                      ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400"
                      : "bg-gray-50 text-gray-400 dark:bg-slate-700 dark:text-slate-300"
              } ${isToday ? "ring-2 ring-emerald-400 ring-offset-1 dark:ring-offset-slate-900" : ""}`}
            >
              <span>{day}</span>
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-black/10 dark:bg-white/10">
                <span
                  className={`block h-full ${isFull ? "bg-white/70" : "bg-emerald-500"}`}
                  style={{ width: `${pct}%` }}
                />
              </span>
            </button>
          );
        })}
      </div>
    </Card>
  );
}

function DayDetailModal({
  cycleId,
  dayIndex,
  onClose,
}: {
  cycleId: string;
  dayIndex: number;
  onClose: () => void;
}) {
  const { state, actions } = useShareholder();
  const cycle = findCycle(state, cycleId);
  const pump = cycle ? findPump(state, cycle.pumpId) : undefined;
  const [view, setView] = useState<"list" | "form">("list");
  const [editing, setEditing] = useState<DayContributor | null>(null);
  /** إزالة مساهم اليوم بحذف ناعم بسبب موثّق */
  const [removeTarget, setRemoveTarget] = useState<DayContributor | null>(null);
  const [removeReason, setRemoveReason] = useState("");

  if (!cycle || !pump) {
    return null;
  }

  const list = dayContributors(state, cycle.id, dayIndex);
  const filled = dayFilledHours(state, cycle.id, dayIndex);
  const dailyHours = pump.dailyHours || 0;
  const remaining = Math.max(0, dailyHours - filled);
  const isFull = remaining <= 0.001;

  const date = cycleDayDate(cycle.startDate, dayIndex);

  const startAdd = () => {
    const last = list[list.length - 1];
    const defaultHours = Math.min(
      remaining || pump.dailyHours || 1,
      remaining > 0 ? remaining : 0.5
    );
    const { h, m } = splitDuration(defaultHours);
    setEditing(null);
    setView("form");
    setFormValues({
      name: "",
      hours: h,
      minutes: m,
      startTime: last ? last.endTime : pump.startTime || "06:00",
      dieselPaid: false,
      royaltyPaid: false,
      shareType: "owned",
      note: "",
    });
  };

  const startEdit = (c: DayContributor) => {
    const { h, m } = splitDuration(c.hours);
    setEditing(c);
    setView("form");
    setFormValues({
      name: c.name,
      hours: h,
      minutes: m,
      startTime: c.startTime,
      dieselPaid: c.dieselPaid,
      royaltyPaid: c.royaltyPaid,
      shareType: c.shareType,
      note: c.note,
    });
  };

  const [formValues, setFormValues] = useState({
    name: "",
    hours: 0,
    minutes: 30,
    startTime: "06:00",
    dieselPaid: false,
    royaltyPaid: false,
    shareType: "owned" as DayShareType,
    note: "",
  });

  const totalHours = durationToHours(formValues.hours, formValues.minutes);

  const endTime = useMemo(
    () => minutesToTime(timeToMinutes(formValues.startTime) + Math.round(totalHours * 60)),
    [formValues.startTime, formValues.hours, formValues.minutes]
  );

  const hoursForCheck = filled - (editing ? editing.hours : 0) + totalHours;
  const overLimit = hoursForCheck > dailyHours + 0.001;

  const saveContributor = () => {
    if (!formValues.name.trim() || overLimit || totalHours <= 0) return;
    const contributor: DayContributor = {
      id: editing?.id ?? uid(),
      cycleId: cycle.id,
      pumpId: pump.id,
      dayIndex,
      name: formValues.name.trim(),
      hours: totalHours,
      startTime: formValues.startTime,
      endTime,
      dieselPaid: formValues.dieselPaid,
      royaltyPaid: formValues.royaltyPaid,
      shareType: formValues.shareType,
      note: formValues.note,
      createdAt: editing?.createdAt ?? new Date().toISOString(),
    };
    if (editing) actions.updateDayContributor(contributor);
    else actions.addDayContributor(contributor);
    setView("list");
  };

  return (
    <>
      <Modal open onClose={onClose} title={view === "list" ? `اليوم ${dayIndex}` : (editing ? "تعديل مساهم" : "إضافة مساهم")}>
      {view === "list" ? (
        <div className="space-y-4">
          <div className="rounded-2xl bg-emerald-50 p-4 dark:bg-emerald-900/30">
            <div className="flex items-center justify-between">
              <div className="text-sm font-extrabold text-emerald-800 dark:text-emerald-200">
                {pump.name} · {formatDayDate(date)}
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-2 text-xs font-bold">
              <span className="rounded-full bg-white/70 px-2.5 py-1 text-emerald-700 dark:bg-slate-800 dark:text-emerald-300">
                دوام اليوم: {formatDurationHours(dailyHours)}
              </span>
              <span className="rounded-full bg-white/70 px-2.5 py-1 text-emerald-700 dark:bg-slate-800 dark:text-emerald-300">
                المسجّل: {formatDurationHours(filled)}
              </span>
              <span
                className={`rounded-full px-2.5 py-1 ${
                  isFull
                    ? "bg-emerald-600 text-white"
                    : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                }`}
              >
                {isFull ? "مكتمل" : `المتبقي: ${formatDurationHours(remaining)}`}
              </span>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/70 dark:bg-slate-800">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all"
                style={{ width: `${dailyHours > 0 ? Math.min(100, (filled / dailyHours) * 100) : 0}%` }}
              />
            </div>
          </div>

          {list.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-200 p-6 text-center text-sm text-gray-400 dark:border-slate-700 dark:text-slate-400">
              لا يوجد مساهمون في هذا اليوم بعد.
            </div>
          ) : (
            <div className="space-y-2">
              {list.map((c) => {
                const info = shareTypeInfo(c.shareType);
                return (
                  <div
                    key={c.id}
                    className="flex items-start gap-3 rounded-2xl border border-gray-100 bg-white p-3 dark:border-slate-700 dark:bg-slate-800"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                      <Users size={18} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-extrabold text-gray-900 dark:text-white">{c.name}</span>
                        <Pill tone={info.tone}>{info.label}</Pill>
                      </div>
                      <div className="mt-0.5 flex items-center gap-1.5 text-xs text-gray-500 dark:text-slate-400">
                        <Clock size={12} />
                        {formatTimeAmPm(c.startTime)} ← {formatTimeAmPm(c.endTime)} · {formatDurationHours(c.hours)}
                      </div>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        <Pill tone={c.dieselPaid ? "green" : "gray"}>
                          {c.dieselPaid ? "الديزل سُدّد" : "الديزل لم يُسدد"}
                        </Pill>
                        <Pill tone={c.royaltyPaid ? "green" : "gray"}>
                          {c.royaltyPaid ? "الرواسة سُددت" : "الرواسة لم تُسدد"}
                        </Pill>
                      </div>
                    </div>
                    <div className="flex flex-col gap-1">
                      <button
                        onClick={() => startEdit(c)}
                        className="rounded-lg px-2 py-1 text-xs font-bold text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/30"
                      >
                        تعديل
                      </button>
                      <button
                        onClick={() => {
                          setRemoveTarget(c);
                          setRemoveReason("");
                        }}
                        className="rounded-lg p-1 text-red-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/30"
                        aria-label="إزالة المساهم"
                        data-testid="remove-contributor"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <Button
            onClick={startAdd}
            disabled={isFull}
            className="w-full py-3"
          >
            <UserPlus size={18} />
            {isFull ? "اليوم مكتمل — لا يمكن إضافة مساهم آخر" : "إضافة مساهم"}
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <Field label="اسم المساهم *">
            <TextInput
              value={formValues.name}
              onChange={(e) => setFormValues({ ...formValues, name: e.target.value })}
              placeholder="مثال: علي حسن"
            />
          </Field>

          <div className="grid grid-cols-3 gap-3">
            <Field label="الساعات">
              <NumberInput
                value={formValues.hours || ""}
                min="0"
                step="1"
                onChange={(e) => setFormValues({ ...formValues, hours: Math.max(0, Number(e.target.value) || 0) })}
              />
            </Field>
            <Field label="الدقائق">
              <NumberInput
                value={formValues.minutes || ""}
                min="0"
                max="59"
                step="1"
                onChange={(e) => setFormValues({ ...formValues, minutes: Math.max(0, Math.min(59, Number(e.target.value) || 0)) })}
              />
            </Field>
            <Field label="من الساعة">
              <TimeInput
                value={formValues.startTime}
                onChange={(e) => setFormValues({ ...formValues, startTime: e.target.value })}
              />
            </Field>
          </div>

          <div className="rounded-2xl bg-emerald-50 p-3 text-center text-sm font-bold text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200">
            نصيبه: {formatDurationHours(totalHours)} · إلى الساعة (تلقائيًا): {formatTimeAmPm(endTime)}
          </div>

          {overLimit && (
            <div className="flex items-center gap-2 rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-600 dark:bg-red-900/30 dark:text-red-300">
              <X size={16} />
              تجاوزت دوام اليوم: المسجّل سيصبح {formatDurationHours(hoursForCheck)} من {formatDurationHours(dailyHours)}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="نوع الحصة">
              <Select
                value={formValues.shareType}
                onChange={(e) => setFormValues({ ...formValues, shareType: e.target.value as DayShareType })}
              >
                <option value="owned">ملك</option>
                <option value="purchase">شراء</option>
                <option value="loan">سلف</option>
              </Select>
            </Field>
            <Field label="الرواسة">
              <Select
                value={formValues.royaltyPaid ? "yes" : "no"}
                onChange={(e) => setFormValues({ ...formValues, royaltyPaid: e.target.value === "yes" })}
              >
                <option value="yes">سددت</option>
                <option value="no">لم تسدد</option>
              </Select>
            </Field>
          </div>

          <Field label="الديزل">
            <Select
              value={formValues.dieselPaid ? "yes" : "no"}
              onChange={(e) => setFormValues({ ...formValues, dieselPaid: e.target.value === "yes" })}
            >
              <option value="yes">سدد</option>
              <option value="no">لم يسدد</option>
            </Select>
          </Field>

          <Field label="ملاحظة">
            <TextArea
              value={formValues.note}
              onChange={(e) => setFormValues({ ...formValues, note: e.target.value })}
            />
          </Field>

          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setView("list")} className="flex-1">
              رجوع
            </Button>
            <Button
              onClick={saveContributor}
              disabled={!formValues.name.trim() || overLimit || totalHours <= 0}
              className="flex-1"
            >
              <Check size={18} /> حفظ
            </Button>
          </div>
        </div>
      )}
      </Modal>

      {/* إزالة مساهم اليوم: حذف ناعم بسبب موثّق — لا يُحذف أي سجل */}
      <Modal open={Boolean(removeTarget)} onClose={() => setRemoveTarget(null)} title="إزالة مساهم من اليوم">
        {removeTarget ? (
          <div className="space-y-4">
            <p className="rounded-2xl bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
              سيُخفى <b>{removeTarget.name}</b> ({removeTarget.hours} ساعة في اليوم {removeTarget.dayIndex}) من
              قوائمك، لكن <b>السجل يبقى محفوظًا</b> مع سبب الإزالة ووقته — لا يُحذف أي سجل نهائيًا.
            </p>
            <Field label="سبب الإزالة (يُسجَّل في سجل التغييرات)">
              <TextArea
                value={removeReason}
                onChange={(e) => setRemoveReason(e.target.value)}
                placeholder="مثال: أُضيف بالخطأ / سُجّل في يوم آخر"
                data-testid="remove-contributor-reason"
              />
            </Field>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setRemoveTarget(null)}>
                إلغاء
              </Button>
              <Button
                variant="danger"
                className="flex-1"
                onClick={() => {
                  actions.deleteDayContributor(removeTarget.id, { reason: removeReason });
                  setRemoveTarget(null);
                }}
                data-testid="remove-contributor-confirm"
              >
                <Trash2 size={16} /> إزالة المساهم
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </>
  );
}
