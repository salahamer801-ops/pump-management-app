import { useState } from "react";
import { Check, Droplets, LogOut, Plus, ShieldCheck } from "lucide-react";
import { useAuth } from "../auth/AuthProvider";
import { ApiError } from "../auth/api";
import { createPump } from "../auth/pumpApi";
import { Button, Card, Field, Pill, TextArea, TextInput, cx } from "../components/ui";

/**
 * إنشاء/اختيار المضخة — الاسم هنا ليس مفتاحًا: المعرّف الثابت هو pumpCode (§11، §12).
 */
export default function PumpGate({
  onSelect,
  onCancel,
  activePumpId,
}: {
  onSelect: (pumpId: string) => void;
  onCancel?: () => void;
  activePumpId: string | null;
}) {
  const { session, user, refresh, logout } = useAuth();
  const pumps = session?.managedPumps ?? [];
  const [creating, setCreating] = useState(pumps.length === 0);
  const [form, setForm] = useState({ name: "", location: "", description: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError("");
    if (!form.name.trim()) return setError("اكتب اسم المضخة.");
    setBusy(true);
    try {
      const pump = await createPump({
        name: form.name.trim(),
        location: form.location.trim(),
        description: form.description.trim(),
      });
      await refresh();
      onSelect(pump.id);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "تعذّر إنشاء المضخة — حاول مرة أخرى.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-lg space-y-4 px-4 py-6">
      <div className="text-center">
        <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-3xl bg-gradient-to-br from-emerald-500 to-emerald-700 text-white shadow-lg shadow-emerald-600/25">
          <ShieldCheck size={30} />
        </div>
        <h1 className="text-2xl font-black text-gray-900">مضخاتك كمسؤول</h1>
        <p className="mt-1 text-sm text-gray-500">
          {user?.name} — كل مضخة لها رقم تعريف ثابت تشاركه مع من تريد السماح له بطلب الربط.
        </p>
      </div>

      {pumps.length > 0 ? (
        <div className="space-y-3">
          {pumps.map((p) => (
            <Card key={p.id} className="p-4">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
                  <Droplets size={20} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-extrabold text-gray-900">{p.name}</div>
                  <div className="mt-1 font-mono text-xs font-bold text-emerald-700">{p.pumpCode}</div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    <Pill tone="gray">{p.membersCount} عضو</Pill>
                    {p.pendingCount > 0 ? <Pill tone="amber">{p.pendingCount} طلب بانتظارك</Pill> : null}
                  </div>
                </div>
                {activePumpId === p.id ? (
                  <Pill tone="green">
                    <Check size={12} /> الحالية
                  </Pill>
                ) : (
                  <Button onClick={() => onSelect(p.id)} className="px-3 py-2 text-xs" data-testid={`select-pump-${p.pumpCode}`}>
                    اختيار
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>
      ) : null}

      {creating ? (
        <Card className="space-y-3 p-4">
          <h2 className="text-sm font-extrabold text-gray-800">
            {pumps.length > 0 ? "إنشاء مضخة جديدة" : "أنشئ مضختك الأولى"}
          </h2>
          {error ? (
            <p className="rounded-2xl bg-red-50 px-3 py-2 text-xs font-bold text-red-700" role="alert">
              {error}
            </p>
          ) : null}
          <Field label="اسم المضخة">
            <TextInput
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="مثال: مضخة العليا"
              aria-label="اسم المضخة"
              data-testid="new-pump-name"
            />
          </Field>
          <Field label="الموقع / المزرعة">
            <TextInput
              value={form.location}
              onChange={(e) => setForm({ ...form, location: e.target.value })}
              aria-label="موقع المضخة"
              data-testid="new-pump-location"
            />
          </Field>
          <Field label="وصف مختصر">
            <TextArea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={2}
              aria-label="وصف المضخة"
            />
          </Field>
          <Button onClick={submit} disabled={busy} className="w-full py-4" data-testid="create-pump-submit">
            <Plus size={18} /> {busy ? "جارٍ الإنشاء…" : "إنشاء المضخة وإظهار رقم التعريف"}
          </Button>
          <p className="text-center text-[11px] text-gray-400">
            بعد الإنشاء يظهر لك رقم تعريف المضخة (Pump Code) لتشاركه مع المساهمين.
          </p>
        </Card>
      ) : (
        <Button variant="outline" className="w-full" onClick={() => setCreating(true)}>
          <Plus size={18} /> إضافة مضخة أخرى
        </Button>
      )}

      <div className={cx("flex gap-3", !onCancel && "flex-col")}>
        {onCancel ? (
          <Button variant="ghost" className="flex-1" onClick={onCancel}>
            رجوع
          </Button>
        ) : null}
        <Button variant="ghost" className="flex-1" onClick={() => void logout()} data-testid="logout-btn">
          <LogOut size={16} /> تسجيل الخروج
        </Button>
      </div>
    </div>
  );
}
