/**
 * شريط تنبيه: «تحقّق من رقمك» — يظهر داخل التطبيق لمن لم يُتحقّق بعد،
 * وفقط إذا فعّل مسؤول النظام هذا التنبيه. بلا أي رسوم: التحقّق عبر تيليجرام.
 */
import { useCallback, useEffect, useState } from "react";
import { BadgeCheck, Send, X } from "lucide-react";
import { api } from "../auth/api";

interface TgStatus {
  configured: boolean;
  linked: boolean;
  verified: boolean;
  prompt: boolean;
}

const DISMISS_KEY = "pump-telegram-prompt-dismissed";

export default function VerifyBanner() {
  const [status, setStatus] = useState<TgStatus | null>(null);
  const [hidden, setHidden] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await api<TgStatus>("/api/telegram/status");
      setStatus(res);
      let dismissed = false;
      try {
        dismissed = localStorage.getItem(DISMISS_KEY) === "1";
      } catch {
        /* بلا تخزين محلي */
      }
      setHidden(dismissed || !res.configured || !res.prompt || res.verified);
    } catch {
      setHidden(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (hidden || !status) return null;

  const start = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await api<{ deepLink: string }>("/api/telegram/link", { method: "POST" });
      window.open(res.deepLink, "_blank", "noopener,noreferrer");
      window.setTimeout(() => void load(), 15000);
    } catch (err) {
      setError(
        err && typeof err === "object" && "message" in err
          ? String((err as { message: string }).message)
          : "تعذّر إنشاء الرابط — حاول من الإعدادات."
      );
    } finally {
      setBusy(false);
    }
  };

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* بلا تخزين محلي */
    }
    setHidden(true);
  };

  return (
    <div
      className="mx-3 mt-3 flex flex-wrap items-center gap-2 rounded-2xl border border-sky-200 bg-sky-50 px-3 py-2 text-[11px] font-bold text-sky-900"
      data-testid="verify-banner"
    >
      <BadgeCheck size={15} className="shrink-0" />
      <span className="flex-1">
        {status.linked
          ? "اربط رقمك بشكل صحيح ليصلك رمز استعادة كلمة المرور على تيليجرام."
          : "تحقّق من رقمك عبر تيليجرام (مجانًا) ليصل رمز استعادة كلمة المرور إلى جوالك."}
      </span>
      {error ? <span className="text-red-700">{error}</span> : null}
      <button
        type="button"
        onClick={start}
        disabled={busy}
        className="inline-flex items-center gap-1 rounded-xl bg-sky-700 px-3 py-1.5 text-white disabled:opacity-60"
        data-testid="verify-banner-start"
      >
        <Send size={13} /> {busy ? "جارٍ التحضير…" : "تحقّق الآن"}
      </button>
      <button
        type="button"
        onClick={dismiss}
        className="text-sky-700/70"
        aria-label="إخفاء التنبيه"
        data-testid="verify-banner-dismiss"
      >
        <X size={15} />
      </button>
    </div>
  );
}
