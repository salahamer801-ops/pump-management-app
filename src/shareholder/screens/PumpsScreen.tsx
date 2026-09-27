import { useMemo, useState } from "react";
import { ChevronLeft, Fuel, Gauge, Plus, Settings2, Timer } from "lucide-react";
import { useShareholder } from "../store";
import MembershipPanel from "../MembershipPanel";
import { activePumps } from "../selectors";
import { endTimeFor, uid } from "../calc";
import { formatHours, formatMoneyYER, formatTimeAmPm } from "../format";
import type { ShareholderPump } from "../types";
import {
  Button,
  Card,
  EmptyState,
  Field,
  Modal,
  NumberInput,
  TextArea,
  TextInput,
  TimeInput,
} from "../../components/ui";

const emptyForm = {
  name: "",
  dailyHours: 12,
  dieselPerHour: 20,
  dieselPricePerLiter: 1200,
  startTime: "06:00",
  royaltyName: "رواس المضخة",
  royaltyCost: 0,
  myShares: 0,
  totalShares: 0,
  notes: "",
};

export default function PumpsScreen() {
  const { state, actions } = useShareholder();
  const pumps = activePumps(state);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ShareholderPump | null>(null);
  const [form, setForm] = useState(emptyForm);

  const previewEnd = useMemo(() => {
    const start = form.startTime;
    const mins = (parseInt(start.split(":")[0] || "0") * 60 + parseInt(start.split(":")[1] || "0") + (Number(form.dailyHours) || 0) * 60);
    const total = ((mins % 1440) + 1440) % 1440;
    const h = Math.floor(total / 60);
    const m = total % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  }, [form.startTime, form.dailyHours]);

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm);
    setOpen(true);
  };

  const openEdit = (p: ShareholderPump) => {
    setEditing(p);
    setForm({
      name: p.name,
      dailyHours: p.dailyHours,
      dieselPerHour: p.dieselPerHour,
      dieselPricePerLiter: p.dieselPricePerLiter,
      startTime: p.startTime,
      royaltyName: p.royaltyName,
      royaltyCost: p.royaltyCost,
      myShares: p.myShares,
      totalShares: p.totalShares,
      notes: p.notes,
    });
    setOpen(true);
  };

  const save = () => {
    if (!form.name.trim()) return;
    const pump: ShareholderPump = {
      id: editing?.id ?? uid(),
      name: form.name.trim(),
      dailyHours: Number(form.dailyHours) || 0,
      dieselPerHour: Number(form.dieselPerHour) || 0,
      dieselPricePerLiter: Number(form.dieselPricePerLiter) || 0,
      startTime: form.startTime || "06:00",
      royaltyName: form.royaltyName.trim(),
      royaltyCost: Number(form.royaltyCost) || 0,
      myShares: Number(form.myShares) || 0,
      totalShares: Number(form.totalShares) || 0,
      notes: form.notes,
      archived: editing?.archived ?? false,
      createdAt: editing?.createdAt ?? new Date().toISOString(),
    };
    if (editing) actions.updatePump(pump);
    else actions.addPump(pump);
    setOpen(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-gray-900 dark:text-white">المضخات</h1>
          <p className="mt-0.5 text-[11px] font-bold text-gray-400 dark:text-slate-400">
            مضخاتي المرتبطة بحسابي وسجلي الخاص
          </p>
        </div>
        <button
          type="button"
          onClick={openAdd}
          
          aria-label="إضافة مضخة"
          data-testid="open-pump-form"
          className="flex shrink-0 items-center gap-1.5 rounded-full bg-gradient-to-l from-emerald-600 to-emerald-500 px-4 py-2.5 text-xs font-extrabold text-white shadow-lg shadow-emerald-600/25 transition active:scale-95 disabled:opacity-40 disabled:shadow-none"
        >
          <Plus size={16} /> إضافة
        </button>
      </div>

      <MembershipPanel />

      <div className="pt-1 text-xs font-bold text-gray-400">مضخاتي في دفتري الشخصي</div>

      {pumps.length === 0 ? (
        <EmptyState
          icon={<Settings2 size={26} />}
          title="لا توجد مضخات"
          description="أضف مضخاتك المساهَم بها، وستُستخدم بياناتها تلقائيًا في الدياله والدوري والحسابات."
          action={
            <Button onClick={openAdd}>
              <Plus size={18} /> إضافة أول مضخة
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {pumps.map((p) => (
            <button key={p.id} onClick={() => openEdit(p)} className="block w-full text-right">
              <Card className="p-4 transition hover:border-emerald-200">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-700 text-white">
                    <Fuel size={20} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-extrabold text-gray-900">{p.name}</div>
                    <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-400">
                      <span className="flex items-center gap-1">
                        <Timer size={12} /> {formatHours(p.dailyHours)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Gauge size={12} /> {p.dieselPerHour} لتر/ساعة
                      </span>
                      <span>
                        {formatTimeAmPm(p.startTime)} ← {formatTimeAmPm(endTimeFor(p))}
                      </span>
                    </div>
                  </div>
                  <ChevronLeft size={18} className="text-gray-300" />
                </div>
                <div className="mt-2 flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 font-bold text-emerald-700">
                    الرواس: {formatMoneyYER(p.royaltyCost)}
                  </span>
                  <span className="rounded-full bg-gray-50 px-2.5 py-1 font-bold text-gray-500">
                    الديزل: {formatMoneyYER(p.dieselPricePerLiter)} / لتر
                  </span>
                </div>
              </Card>
            </button>
          ))}
        </div>
      )}

      <Modal open={open} onClose={() => setOpen(false)} title={editing ? "تعديل مضخة" : "إضافة مضخة"}>
        <div className="space-y-4">
          <Field label="اسم المضخة *">
            <TextInput
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="مثال: مضخة العليا"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="ساعات التشغيل اليومية">
              <NumberInput
                value={form.dailyHours || ""}
                onChange={(e) => setForm({ ...form, dailyHours: Number(e.target.value) })}
              />
            </Field>
            <Field label="لتر الديزل / ساعة">
              <NumberInput
                value={form.dieselPerHour || ""}
                onChange={(e) => setForm({ ...form, dieselPerHour: Number(e.target.value) })}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="سعر لتر الديزل (ر.ي)">
              <NumberInput
                value={form.dieselPricePerLiter || ""}
                onChange={(e) => setForm({ ...form, dieselPricePerLiter: Number(e.target.value) })}
              />
            </Field>
            <Field label="وقت التشغيل">
              <TimeInput
                value={form.startTime}
                onChange={(e) => setForm({ ...form, startTime: e.target.value })}
              />
            </Field>
          </div>

          <div className="rounded-2xl bg-emerald-50 p-3 text-center text-sm font-bold text-emerald-800">
            وقت الإطفاء يُحسب تلقائيًا: {formatTimeAmPm(previewEnd)}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="اسم الرواس">
              <TextInput
                value={form.royaltyName}
                onChange={(e) => setForm({ ...form, royaltyName: e.target.value })}
              />
            </Field>
            <Field label="تكلفة الرواسة (ر.ي)">
              <NumberInput
                value={form.royaltyCost || ""}
                onChange={(e) => setForm({ ...form, royaltyCost: Number(e.target.value) })}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="أسهمي (اختياري)">
              <NumberInput
                value={form.myShares || ""}
                onChange={(e) => setForm({ ...form, myShares: Number(e.target.value) })}
              />
            </Field>
            <Field label="إجمالي أسهم المضخة">
              <NumberInput
                value={form.totalShares || ""}
                onChange={(e) => setForm({ ...form, totalShares: Number(e.target.value) })}
              />
            </Field>
          </div>

          <Field label="ملاحظات">
            <TextArea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </Field>

          <div className="flex gap-3 pt-1">
            <Button variant="outline" onClick={() => setOpen(false)} className="flex-1">
              إلغاء
            </Button>
            <Button onClick={save} disabled={!form.name.trim()} className="flex-1">
              حفظ
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
