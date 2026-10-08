import { useMemo, useState } from "react";
import { Pencil, Phone, Plus, Trash2, Users } from "lucide-react";
import { useApp } from "../../store";
import { dayBaseRosterRows, dayBaseRosterTotalMin } from "../../domain/rules";
import type { DialaDay } from "../../domain/types";
import { formatDuration, toHours } from "../../domain/util";
import { Button, Card, Field, NumberInput, Pill } from "../../components/ui";
import PersonPicker from "../../components/PersonPicker";

export default function DailyBaseRosterPanel({ day }: { day: DialaDay }) {
  const { state, actions } = useApp();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [personId, setPersonId] = useState("");
  const [hours, setHours] = useState(1);
  const [editingId, setEditingId] = useState<string | null>(null);
  const rows = useMemo(() => dayBaseRosterRows(state, day.id), [state, day.id]);
  const totalMin = dayBaseRosterTotalMin(state, day.id);
  const remainingMin = Math.max(0, day.capacityMin - totalMin);
  const selected = state.persons.find((p) => p.id === personId) ?? null;

  const save = () => {
    if (!personId || hours <= 0) return;
    actions.saveDayBaseRosterMember(day.id, personId, Math.round(hours * 60), "manager");
    setPersonId("");
    setHours(1);
    setEditingId(null);
  };

  const edit = (row: (typeof rows)[number]) => {
    setEditingId(row.member.id);
    setPersonId(row.personId);
    setHours(Math.round((row.shareMin / 60) * 100) / 100);
  };

  return (
    <Card className="p-4" data-testid="daily-base-roster">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Users size={16} className="text-indigo-600 dark:text-indigo-300" />
        <h2 className="text-sm font-extrabold text-gray-800 dark:text-white">مساهمو اليوم الأساسيون</h2>
        <Pill tone="blue">{rows.length} مساهم</Pill>
        <span className="mr-auto text-[10px] text-gray-400">للحصة المتوقعة لهذا اليوم فقط</span>
      </div>
      <p className="mb-3 rounded-2xl bg-indigo-50 px-3 py-2 text-[11px] leading-relaxed text-indigo-800 dark:bg-indigo-900/25 dark:text-indigo-200">
        هذه ليست قائمة من أخذ التشغيل فعليًا. أضف هنا أصحاب النصيب المتوقع في هذا اليوم لمعرفة من دوره قادم أو مرّ؛ أما الحساب الفعلي والتكاليف فتُسجّل في قائمة الدوام الفعلي أدناه.
      </p>
      {rows.length === 0 ? (
        <p className="rounded-xl bg-gray-50 px-3 py-2 text-center text-[11px] text-gray-400 dark:bg-slate-700">لا يوجد مساهمون أساسيون لهذا اليوم بعد.</p>
      ) : (
        <div className="space-y-1.5">
          {rows.map((row, index) => (
            <div key={row.member.id} className="flex flex-wrap items-center gap-2 rounded-xl bg-indigo-50/60 px-3 py-2 text-[11px] dark:bg-slate-700" data-testid={`daily-base-row-${index + 1}`}>
              <b className="flex h-6 w-6 items-center justify-center rounded-lg bg-indigo-600 text-white">{index + 1}</b>
              <span className="min-w-[120px] flex-1 font-extrabold text-gray-800 dark:text-white">{row.name}</span>
              {row.phone ? <span dir="ltr" className="flex items-center gap-1 text-gray-400"><Phone size={10} />{row.phone}</span> : null}
              <Pill tone="blue">{formatDuration(row.shareMin)}</Pill>
              <button onClick={() => edit(row)} className="rounded-lg bg-white p-1.5 text-sky-700 dark:bg-slate-800 dark:text-sky-300" aria-label={`تعديل نصيب ${row.name}`}><Pencil size={13} /></button>
              <button onClick={() => actions.removeDayBaseRosterMember(row.member.id, { reason: "إزالة مساهم اليوم الأساسي", actor: "manager" })} className="rounded-lg bg-white p-1.5 text-red-600 dark:bg-slate-800 dark:text-red-300" aria-label={`إزالة ${row.name}`}><Trash2 size={13} /></button>
            </div>
          ))}
        </div>
      )}
      <div className="mt-3 flex flex-wrap items-end gap-2 rounded-2xl border border-indigo-100 p-3 dark:border-indigo-900/40">
        <div className="min-w-[180px] flex-1">
          <Field label={editingId ? "تعديل مساهم اليوم" : "إضافة مساهم أساسي لهذا اليوم"}>
            <button onClick={() => setPickerOpen(true)} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-right text-[11px] font-bold dark:border-slate-600 dark:bg-slate-800 dark:text-white">
              {selected?.name ?? "اختر شخصًا"}
            </button>
          </Field>
        </div>
        <div className="w-28">
          <Field label="الساعات">
            <NumberInput min={0.01} step={0.25} value={hours} onChange={(e) => setHours(Number(e.target.value))} />
          </Field>
        </div>
        <Button onClick={save} disabled={!personId || hours <= 0 || (!editingId && hours * 60 > remainingMin)}>
          {editingId ? <Pencil size={15} /> : <Plus size={15} />} {editingId ? "حفظ التعديل" : "إضافة"}
        </Button>
        {editingId ? <Button variant="ghost" onClick={() => { setEditingId(null); setPersonId(""); setHours(1); }}>إلغاء</Button> : null}
      </div>
      <div className="mt-2 text-[10px] text-gray-400">الموزع المتوقع: {formatDuration(totalMin)} · المتبقي من تشغيل اليوم: {formatDuration(remainingMin)} من {toHours(day.capacityMin)} ساعة</div>
      {pickerOpen ? <PersonPicker open onClose={() => setPickerOpen(false)} pumpId={day.pumpId} title="اختيار مساهم لهذا اليوم" priorityIds={[]} onSelect={(person) => { setPersonId(person.id); setPickerOpen(false); }} /> : null}
    </Card>
  );
}
