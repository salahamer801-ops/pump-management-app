import { useEffect, useState } from "react";
import { Fingerprint, ShieldCheck } from "lucide-react";
import { Card, Pill } from "../components/ui";
import {
  authenticateWithBiometric,
  getBiometricAvailability,
  isBiometricLockEnabled,
  isNativeApp,
  setBiometricLockEnabled,
  type BiometricAvailability,
} from "./biometricLock";

export default function BiometricSettingsCard({
  t = (ar: string) => ar,
}: {
  t?: (ar: string, en: string) => string;
}) {
  const [enabled, setEnabled] = useState(() => isBiometricLockEnabled());
  const [availability, setAvailability] = useState<BiometricAvailability | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const native = isNativeApp();

  useEffect(() => {
    if (!native) return;
    void getBiometricAvailability().then(setAvailability);
  }, [native]);

  const toggle = async () => {
    setMessage("");
    if (enabled) {
      setBiometricLockEnabled(false);
      setEnabled(false);
      setMessage(t("تم إيقاف قفل التطبيق.", "App lock disabled."));
      return;
    }
    setBusy(true);
    try {
      const status = availability ?? (await getBiometricAvailability());
      setAvailability(status);
      if (!status.available || !status.enrolled) {
        setMessage(t("فعّل البصمة أو رمز أمان الجهاز أولًا من إعدادات الهاتف.", "Enable fingerprint or a device credential in phone settings first."));
        return;
      }
      await authenticateWithBiometric();
      setBiometricLockEnabled(true);
      setEnabled(true);
      setMessage(t("تم تفعيل قفل التطبيق. سيُطلب التحقق عند العودة إليه.", "App lock enabled. Verification is required when returning to the app."));
    } catch {
      setMessage(t("لم يتم التفعيل — يجب إكمال التحقق من نافذة أمان الهاتف.", "Not enabled — complete the phone security prompt to continue."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300">
          <Fingerprint size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-extrabold text-gray-800 dark:text-white">
              {t("قفل التطبيق بالبصمة", "Fingerprint app lock")}
            </h2>
            {enabled ? <Pill tone="green">{t("مفعّل", "Enabled")}</Pill> : null}
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-gray-500 dark:text-slate-300">
            {t(
              "استخدم بصمة الهاتف أو رمز أمان الجهاز عند فتح التطبيق. البصمة لا تُنسخ ولا تُحفظ داخل التطبيق أو الخادم.",
              "Use your phone fingerprint or device credential when opening the app. Your biometric data is never copied or stored here or on the server."
            )}
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={() => void toggle()}
        disabled={!native || busy || (!enabled && availability !== null && !availability.available)}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-xs font-extrabold text-sky-700 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-sky-800 dark:bg-sky-900/20 dark:text-sky-200"
      >
        <ShieldCheck size={16} />
        {!native
          ? t("متاح داخل تطبيق Android فقط", "Available in the Android app only")
          : enabled
            ? t("إيقاف قفل التطبيق", "Disable app lock")
            : t("تفعيل قفل التطبيق", "Enable app lock")}
      </button>
      {message ? <p className="text-[11px] font-bold text-sky-700 dark:text-sky-300">{message}</p> : null}
    </Card>
  );
}
