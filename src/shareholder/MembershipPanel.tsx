import { useState } from "react";
import { Check, Clock, Droplets, KeyRound, ShieldAlert, UserRound } from "lucide-react";
import { useAuth } from "../auth/AuthProvider";
import { ApiError } from "../auth/api";
import { requestJoin } from "../auth/pumpApi";
import { MEMBERSHIP_LABEL, STATUS_LABEL, type Membership } from "../auth/types";
import { Button, Card, Field, Pill, TextInput } from "../components/ui";

/**
 * ربط الحساب بالمضخة عبر رقم تعريف المضخة (§14، §15، §17، §33):
 * إدخال الكود يُنشئ «طلب ربط» بحالة pending فقط — لا يمنح أي وصول.
 * الوصول يبدأ بعد موافقة المسؤول.
 */
export default function MembershipPanel() {
  const { session, refresh } = useAuth();
  const memberships = session?.memberships ?? [];
  const [code, setCode] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const submit = async () => {
    const clean = code.trim();
    setError("");
    setNotice("");
    if (clean.length < 4) {
      setError("اكتب رقم تعريف المضخة كما وصلك من المسؤول (مثال: PMP-8F42K7).");
      return;
    }
    setBusy(true);
    try {
      await requestJoin(clean, note.trim());
      setCode("");
      setNote("");
      setNotice("أُرسل طلب الربط إلى مسؤول المضخة — يظهر لك هنا بعد موافقته.");
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "تعذّر إرسال طلب الربط — حاول مرة أخرى.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-center gap-2">
        <KeyRound size={18} className="text-emerald-600" />
        <h2 className="text-sm font-extrabold text-gray-800 dark:text-white">مضخاتي المرتبطة بحسابي</h2>
      </div>

      <p className="rounded-2xl bg-gray-50 px-3 py-2 text-[11px] leading-relaxed text-gray-500 dark:bg-slate-700 dark:text-slate-300">
        رقم تعريف المضخة (Pump Code) هو مفتاح <b>طلب</b> الربط فقط — لا يمنح أي صلاحية. بعد موافقة المسؤول
        تظهر المضخة هنا وتظهر بياناتك الرسمية في «السجل الرسمي».
      </p>

      {error ? (
        <p className="rounded-2xl bg-red-50 px-3 py-2 text-xs font-bold text-red-700" role="alert" data-testid="join-error">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="rounded-2xl bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700" role="status" data-testid="join-notice">
          {notice}
        </p>
      ) : null}

      <div className="flex items-end gap-2">
        <div className="flex-1">
          <Field label="رقم تعريف المضخة">
            <TextInput
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="PMP-8F42K7"
              dir="ltr"
              className="text-left font-mono"
              aria-label="رقم تعريف المضخة"
              data-testid="join-code"
            />
          </Field>
        </div>
        <Button onClick={() => void submit()} disabled={busy} className="px-4 py-3" data-testid="join-submit">
          {busy ? "جارٍ الإرسال…" : "بحث / إرسال طلب ربط"}
        </Button>
      </div>

      <Field label="ملاحظة للمسؤول (اختياري)">
        <TextInput
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="مثال: أنا صاحب السهم في البئر الشمالي"
          aria-label="ملاحظة طلب الربط"
        />
      </Field>

      {memberships.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-gray-200 px-3 py-3 text-center text-[11px] text-gray-400 dark:border-slate-600">
          لا توجد أي مضخة مرتبطة بحسابك بعد.
        </p>
      ) : (
        <div className="space-y-2">
          {memberships.map((m) => (
            <MembershipRow key={m.id} membership={m} />
          ))}
        </div>
      )}
    </Card>
  );
}

function MembershipRow({ membership: m }: { membership: Membership }) {
  const tone =
    m.status === "approved" ? "green" : m.status === "pending" ? "amber" : m.status === "rejected" ? "red" : "gray";

  return (
    <div
      className="rounded-2xl border border-gray-100 px-3 py-3 dark:border-slate-700"
      data-testid={`membership-${m.pumpCode}`}
    >
      <div className="flex items-center gap-2">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
          {m.status === "approved" ? <Droplets size={16} /> : <Clock size={16} />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-extrabold text-gray-900 dark:text-white">
            {m.status === "approved" ? (m.pumpName ?? m.pumpCode) : m.pumpCode}
          </div>
          <div className="text-[11px] text-gray-400" dir="ltr">
            {m.pumpCode}
          </div>
        </div>
        <Pill tone={tone}>{STATUS_LABEL[m.status]}</Pill>
      </div>

      {m.status === "approved" ? (
        <div className="mt-2 flex flex-wrap gap-1 text-[11px] text-gray-500 dark:text-slate-300">
          <Pill tone="blue">
            <Check size={11} /> {MEMBERSHIP_LABEL[m.membershipType]}
          </Pill>
          {m.managerName ? (
            <Pill tone="gray">
              <UserRound size={11} /> المسؤول: {m.managerName}
            </Pill>
          ) : null}
        </div>
      ) : null}

      {m.status === "pending" ? (
        <p className="mt-1 text-[11px] text-amber-600 dark:text-amber-400">
          بانتظار قرار المسؤول — لن تظهر بيانات المضخة قبل الموافقة.
        </p>
      ) : null}

      {m.status === "rejected" ? (
        <p className="mt-1 flex items-center gap-1 text-[11px] text-red-600">
          <ShieldAlert size={12} /> {m.rejectReason ? `سبب الرفض: ${m.rejectReason}` : "رُفض الطلب."}
        </p>
      ) : null}

      {m.status === "removed" ? (
        <p className="mt-1 text-[11px] text-gray-400">
          أُزيل ارتباطك بهذه المضخة. سجلاتك السابقة محفوظة ولم تُحذف.
        </p>
      ) : null}
    </div>
  );
}
