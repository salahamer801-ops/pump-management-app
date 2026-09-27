import { useState } from "react";
import { Droplets, Fuel, ShieldCheck, Sprout, Sun, Tractor } from "lucide-react";
import { useApp } from "../store";
import type { ManagedPump } from "../auth/types";
import type { Currency, EnergyType, Pump } from "../domain/types";
import { durationMin } from "../domain/util";
import { generateId, generatePumpCode, getSession } from "../lib/auth";
import { Button, Card, Field, NumberInput, Select, TextArea, TextInput, TimeInput } from "../components/ui";

/** إنشاء المضخة — بيانات مرجعية تُستخدم في كل الحسابات لاحقًا (§20) */
export default function PumpSetup({
  onLogout,
  pump: serverPump,
}: {
  onLogout: () => void;
  pump?: ManagedPump;
}) {
  const { actions } = useApp();
  const [form, setForm] = useState({
    name: serverPump?.name ?? "",
    wells: "",
    farm: serverPump?.location ?? "",
    engine: "",
    energyType: "diesel" as EnergyType,
    workStart: "06:00",
    workEnd: "02:00",
    fuelConsumptionPerHour: 6,
    fuelPrice: 1200,
    fuelPerCycle: 120,
    fuelCalcMode: "hour" as "hour" | "cycle",
    royaltyEnabled: true,
    royaltyMode: "hour" as "hour" | "cycle",
    royaltyPerHour: 500,
    royaltyPerCycle: 0,
    operatorName: "",
    operatorHourlyWage: 0,
    shareUnit: "حصة",
    currency: "YER" as Currency,
    notes: serverPump?.description ?? "",
  });

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const save = () => {
    if (!form.name.trim()) return;
    /* حساب المسؤول الحالي: من الخادم إن وُجدت مضخة مسجَّلة، وإلا من الجلسة المحلية */
    const localSession = getSession();
    const pump: Pump = {
      id: generateId(),
      /* الرقم الثابت من الخادم إن كانت المضخة مسجَّلة هناك، وإلا رقم محلي جديد */
      pumpCode: serverPump?.pumpCode || generatePumpCode(),
      managerId: serverPump?.managerId || localSession?.userId || "",
      name: form.name.trim(),
      wells: form.wells,
      farm: form.farm,
      engine: form.engine,
      energyType: form.energyType,
      workStart: form.workStart,
      workEnd: form.workEnd,
      fuelConsumptionPerHour: form.fuelConsumptionPerHour,
      fuelPerCycle: form.fuelPerCycle,
      fuelCalcMode: form.fuelCalcMode,
      fuelPrice: form.fuelPrice,
      royaltyEnabled: form.royaltyEnabled,
      royaltyMode: form.royaltyMode,
      royaltyPerCycle: form.royaltyPerCycle,
      royaltyPerHour: form.royaltyPerHour,
      operatorName: form.operatorName,
      operatorHourlyWage: form.operatorHourlyWage,
      operatorStart: form.workStart,
      operatorEnd: form.workEnd,
      shareUnit: form.shareUnit || "حصة",
      currency: form.currency,
      notes: form.notes,
      archived: false,
      createdAt: new Date().toISOString(),
    };
    actions.savePump(pump, true);
  };

  const dailyHours = Math.round((durationMin(form.workStart, form.workEnd) / 60) * 10) / 10;

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      <div className="mb-5 text-center">
        <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br from-emerald-500 to-emerald-700 text-white shadow-lg shadow-emerald-600/25">
          <Droplets size={30} />
        </div>
        <h1 className="text-2xl font-black text-gray-900 dark:text-white">تسجيل المضخة</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">
          هذه البيانات مرجعية وتُستخدم في كل الحسابات — يمكن تعديلها لاحقًا دون تغيير الماضي.
        </p>
        {serverPump ? (
          <p className="mx-auto mt-3 inline-flex items-center gap-2 rounded-2xl bg-emerald-50 px-4 py-2 text-xs font-bold text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
            <ShieldCheck size={14} /> رقم تعريف المضخة:{" "}
            <span className="font-mono" data-testid="pump-code">
              {serverPump.pumpCode}
            </span>
          </p>
        ) : null}
      </div>

      <div className="space-y-4">
        <Card className="space-y-3 p-4">
          <h2 className="text-sm font-extrabold text-gray-800 dark:text-white">بيانات المضخة</h2>
          <Field label="اسم المضخة">
            <TextInput value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="مثال: مضخة العليا" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="البئر">
              <TextInput value={form.wells} onChange={(e) => set("wells", e.target.value)} />
            </Field>
            <Field label="المزرعة / المنطقة">
              <TextInput value={form.farm} onChange={(e) => set("farm", e.target.value)} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="المحرك" hint="وصف المحرك">
              <TextInput value={form.engine} onChange={(e) => set("engine", e.target.value)} placeholder="محرك 60 حصان" />
            </Field>
            <Field label="نوع الطاقة">
              <Select value={form.energyType} onChange={(e) => set("energyType", e.target.value as EnergyType)}>
                <option value="diesel">ديزل عادي</option>
                <option value="solar">ديزل شمسي (طاقة شمسية)</option>
                <option value="hybrid">شمسي + ديزل</option>
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="بداية التشغيل">
              <TimeInput value={form.workStart} onChange={(e) => set("workStart", e.target.value)} />
            </Field>
            <Field label="نهاية التشغيل">
              <TimeInput value={form.workEnd} onChange={(e) => set("workEnd", e.target.value)} />
            </Field>
          </div>
          <p className="rounded-2xl bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700">
            ساعات التشغيل اليومية: {dailyHours} ساعة (يدعم عبور منتصف الليل)
          </p>
        </Card>

        <Card className="space-y-3 p-4">
          <h2 className="flex items-center gap-2 text-sm font-extrabold text-gray-800 dark:text-white">
            <Fuel size={16} className="text-emerald-600" /> الديزل
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <Field label="الاستهلاك (لتر/ساعة)">
              <NumberInput
                value={form.fuelConsumptionPerHour}
                onChange={(e) => set("fuelConsumptionPerHour", Number(e.target.value))}
              />
            </Field>
            <Field label="سعر اللتر المرجعي" hint="مرجعي فقط — السعر النهائي يسجّله المستخدم">
              <NumberInput value={form.fuelPrice} onChange={(e) => set("fuelPrice", Number(e.target.value))} />
            </Field>
          </div>
        </Card>

        <Card className="space-y-3 p-4">
          <h2 className="flex items-center gap-2 text-sm font-extrabold text-gray-800 dark:text-white">
            <Tractor size={16} className="text-emerald-600" /> الرواسة
          </h2>
          <Field label="اسم الرواس">
            <TextInput value={form.operatorName} onChange={(e) => set("operatorName", e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="أجر الساعة">
              <NumberInput value={form.operatorHourlyWage} onChange={(e) => set("operatorHourlyWage", Number(e.target.value))} />
            </Field>
            <Field label="العملة">
              <Select value={form.currency} onChange={(e) => set("currency", e.target.value as Currency)}>
                <option value="YER">ريال يمني</option>
                <option value="SAR">ريال سعودي</option>
                <option value="USD">دولار</option>
              </Select>
            </Field>
          </div>
          <label className="flex items-center justify-between rounded-2xl bg-gray-50 px-3 py-3 dark:bg-slate-700">
            <span className="text-sm font-bold text-gray-700 dark:text-slate-200">يوجد رواسة على المساهمين</span>
            <input
              type="checkbox"
              checked={form.royaltyEnabled}
              onChange={(e) => set("royaltyEnabled", e.target.checked)}
              className="h-5 w-5 accent-emerald-600"
            />
          </label>
          {form.royaltyEnabled ? (
            <div className="grid grid-cols-2 gap-3">
              <Field label="طريقة الرواسة">
                <Select value={form.royaltyMode} onChange={(e) => set("royaltyMode", e.target.value as "hour" | "cycle")}>
                  <option value="hour">لكل ساعة</option>
                  <option value="cycle">لكل ديالة</option>
                </Select>
              </Field>
              {form.royaltyMode === "hour" ? (
                <Field label="الرواسة لكل ساعة">
                  <NumberInput value={form.royaltyPerHour} onChange={(e) => set("royaltyPerHour", Number(e.target.value))} />
                </Field>
              ) : (
                <Field label="الرواسة لكل ديالة">
                  <NumberInput value={form.royaltyPerCycle} onChange={(e) => set("royaltyPerCycle", Number(e.target.value))} />
                </Field>
              )}
            </div>
          ) : null}
        </Card>

        <Card className="space-y-3 p-4">
          <h2 className="flex items-center gap-2 text-sm font-extrabold text-gray-800 dark:text-white">
            <Sprout size={16} className="text-emerald-600" /> وحدات الحصص
          </h2>
          <Field label="اسم وحدة الحصة" hint="مثال: حصة، سهم، ساعة">
            <TextInput value={form.shareUnit} onChange={(e) => set("shareUnit", e.target.value)} />
          </Field>
          <Field label="ملاحظات">
            <TextArea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={2} />
          </Field>
        </Card>

        <Button className="w-full py-4 text-base" onClick={save} disabled={!form.name.trim()}>
          <Droplets size={20} /> حفظ المضخة والبدء
        </Button>
        <Button variant="ghost" className="w-full" onClick={onLogout}>
          تسجيل الخروج
        </Button>
        <button
          onClick={() => actions.seedDemo()}
          className="mx-auto flex items-center gap-2 text-xs font-bold text-emerald-600"
        >
          <Sun size={14} /> تحميل بيانات تجريبية للاستعراض
        </button>
      </div>
    </div>
  );
}
