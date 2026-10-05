import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Fingerprint, LockKeyhole, RefreshCcw } from "lucide-react";
import { useAuth } from "../auth/AuthProvider";
import {
  authenticateWithBiometric,
  isBiometricLockEnabled,
  isNativeApp,
} from "./biometricLock";

export default function BiometricGate({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth();
  const [locked, setLocked] = useState(() => isNativeApp() && isBiometricLockEnabled());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const unlock = useCallback(async () => {
    if (!isNativeApp() || !isBiometricLockEnabled()) {
      setLocked(false);
      return;
    }
    setBusy(true);
    setError("");
    try {
      await authenticateWithBiometric();
      setLocked(false);
    } catch {
      setError("لم يتم التحقق. استخدم بصمة الهاتف أو رمز أمان الجهاز للمحاولة مرة أخرى.");
      setLocked(true);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    if (!loading && session && locked) void unlock();
  }, [loading, session, locked, unlock]);

  useEffect(() => {
    if (!isNativeApp()) return;
    const onVisibility = () => {
      if (document.visibilityState === "hidden" && isBiometricLockEnabled()) {
        setLocked(true);
      } else if (document.visibilityState === "visible" && session && isBiometricLockEnabled()) {
        void unlock();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [session, unlock]);

  if (!session || !locked) return <>{children}</>;

  return (
    <div className="flex min-h-dvh w-full items-center justify-center bg-slate-950 px-5 text-center text-white">
      <div className="w-full max-w-sm rounded-3xl border border-white/10 bg-white/10 p-6 shadow-2xl backdrop-blur">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-sky-500/20 text-sky-300">
          {busy ? <RefreshCcw size={30} className="animate-spin" /> : <Fingerprint size={32} />}
        </div>
        <div className="mt-4 flex items-center justify-center gap-2 text-lg font-black">
          <LockKeyhole size={18} /> التطبيق مقفل
        </div>
        <p className="mt-2 text-sm leading-relaxed text-slate-300">
          بياناتك محمية بقفل الهاتف. لا تُنسخ البصمة ولا تُخزَّن داخل التطبيق؛ التحقق يتم من خلال Android نفسه.
        </p>
        {error ? <p className="mt-3 text-xs font-bold text-amber-300">{error}</p> : null}
        <button
          type="button"
          disabled={busy}
          onClick={() => void unlock()}
          className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-sky-500 px-4 py-3 text-sm font-extrabold text-white transition hover:bg-sky-400 disabled:opacity-60"
        >
          <Fingerprint size={18} /> فتح بالبصمة
        </button>
      </div>
    </div>
  );
}
