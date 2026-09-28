/**
 * بطاقة التحقّق من الرقم عبر تيليجرام — مجانية بالكامل (بلا رسوم لكل رسالة).
 *
 * تيليجرام وحده يتحقّق من الرقم: المستخدم يضغط «شارك رقمي» في المحادثة،
 * فلا نطلب الرقم كتابةً ولا نرسل رسائل SMS مدفوعة.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { BadgeCheck, ExternalLink, Loader2, Send, ShieldAlert, ShieldCheck } from "lucide-react";
import { api } from "../auth/api";
import { Button, Card } from "./ui";

interface TgStatus {
  configured: boolean;
  botUsername: string;
  linked: boolean;
  verified: boolean;
  verifiedAt: string | null;
  username: string;
  alerts: boolean;
  phoneMasked: string;
}

function errorText(err: unknown): string {
  if (err && typeof err === "object" && "message" in err) return String((err as { message: string }).message);
  return "تعذّر تنفيذ العملية — حاول مرة أخرى.";
}

export default function TelegramVerifyCard({ compact = false }: { compact?: boolean }) {
  const [status, setStatus] = useState<TgStatus | null>(null);
  const [link, setLink] = useState<{ deepLink: string; expiresInMinutes: number } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const pollRef = useRef<number | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await api<TgStatus>("/api/telegram/status");
      setStatus(res);
      return res;
    } catch (err) {
      setError(errorText(err));
      return null;
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /* بعد إنشاء الرابط نتابع الحالة كل 4 ثوانٍ حتى يتم التحقّق من الجوال */
  useEffect(() => {
    if (!waiting) return;
    pollRef.current = window.setInterval(async () => {
      const res = await load();
      if (res?.linked) setWaiting(false);
    }, 4000);
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, [waiting, load]);

  const startLink = async () => {
    setError("");
    setBusy(true);
    try {
      const res = await api<{ deepLink: string; expiresInMinutes: number }>("/api/telegram/link", {
        method: "POST",
      });
      setLink({ deepLink: res.deepLink, expiresInMinutes: res.expiresInMinutes });
      setWaiting(true);
      window.open(res.deepLink, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const unlink = async () => {
    setBusy(true);
    setError("");
    try {
      await api("/api/telegram/link", { method: "DELETE" });
      setLink(null);
      setWaiting(false);
      await load();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const toggleAlerts = async () => {
    if (!status) return;
    setBusy(true);
    try {
      await api("/api/telegram/alerts", { method: "PATCH", body: { alerts: !status.alerts } });
      await load();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  if (!status) {
    return (
      <Card className="space-y-2 p-4" data-testid="telegram-card">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-700">
          <Loader2 size={16} className="animate-spin" /> جارٍ التحقّق من حالة الربط…
        </div>
      </Card>
    );
  }

  return (
    <Card className="space-y-3 p-4" data-testid="telegram-card">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm font-black text-slate-800">
            <Send size={16} /> التحقّق من رقمي (تيليجرام — مجاني)
          </div>
          <div className="mt-0.5 text-[11px] text-gray-500">
            {status.verified
              ? `رقمك مُتحقَّق ✅ (${status.phoneMasked})`
              : "تحقّق مرة واحدة، ويصل رمز استعادة كلمة المرور إلى محادثتك في تيليجرام."}
          </div>
        </div>
        {status.verified ? (
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700">
            <BadgeCheck size={13} /> رقم مُتحقَّق
          </span>
        ) : null}
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[11px] font-bold text-red-700" data-testid="telegram-error">
          {error}
        </div>
      ) : null}

      {!status.configured ? (
        <div className="flex items-start gap-2 rounded-xl bg-slate-50 px-3 py-2 text-[11px] leading-relaxed text-slate-600">
          <ShieldAlert size={15} className="mt-0.5 shrink-0" />
          التحقّق عبر تيليجرام غير مُهيّأ بعد — يُضيفه مسؤول النظام مجانًا (توكن بوت من @BotFather).
          وحتى ذلك الحين يبقى رمز الاستعادة يظهر على الشاشة كما كان.
        </div>
      ) : link ? (
        <div className="space-y-2 rounded-2xl border border-sky-200 bg-sky-50 px-3 py-3" data-testid="telegram-instructions">
          <div className="text-[12px] font-black text-sky-900">أكمل التحقّق من تيليجرام</div>
          <ol className="space-y-1 pr-4 text-[11px] leading-relaxed text-sky-900" style={{ listStyle: "decimal" }}>
            <li>افتح الرابط الذي فُتح لك، واضغط <b>Start</b> في المحادثة.</li>
            <li>اضغط زر <b>«📱 شارك رقمي»</b> — تيليجرام وحده يتحقّق من الرقم.</li>
            <li>ارجع هنا؛ ستتحدّث الحالة تلقائيًا خلال ثوانٍ.</li>
          </ol>
          <div className="flex flex-wrap gap-2">
            <a
              href={link.deepLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 rounded-xl bg-sky-700 px-3 py-2 text-[11px] font-bold text-white"
              data-testid="telegram-open"
            >
              <ExternalLink size={14} /> فتح محادثة البوت
            </a>
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-sky-800">
              {waiting ? <><Loader2 size={12} className="animate-spin" /> في انتظار التأكيد…</> : "الرابط صالح 15 دقيقة"}
            </span>
          </div>
        </div>
      ) : status.linked && !status.verified ? (
        <div className="space-y-1 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-900">
          <div className="font-bold">تم ربط تيليجرام، لكن الرقم الذي شاركته مختلف عن رقم حسابك.</div>
          <div>يمكنك استلام رموز الاستعادة هنا، وللحصول على وسم «رقم مُتحقَّق» اطلب من مسؤول المضخة تحديث رقمك ثم أعد المحاولة.</div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {status.configured && !status.linked ? (
          <Button onClick={startLink} disabled={busy} data-testid="telegram-link">
            <Send size={16} /> {busy ? "جارٍ التحضير…" : "اربط تيليجرام وتحقّق"}
          </Button>
        ) : null}
        {status.configured && status.linked ? (
          <>
            <Button variant="ghost" onClick={startLink} disabled={busy} data-testid="telegram-relink">
              <ShieldCheck size={16} /> {status.verified ? "تحديث الربط" : "إعادة التحقّق"}
            </Button>
            <Button variant="ghost" onClick={toggleAlerts} disabled={busy} data-testid="telegram-alerts">
              {status.alerts ? "إيقاف تنبيهات تيليجرام" : "تشغيل تنبيهات تيليجرام"}
            </Button>
            <Button variant="ghost" onClick={unlink} disabled={busy} data-testid="telegram-unlink">
              إلغاء الربط
            </Button>
          </>
        ) : null}
      </div>

      {!compact && status.linked ? (
        <div className="text-[10px] leading-relaxed text-gray-500">
          تحصل على تنبيه مجاني عند تغيير كلمة مرور حسابك، ورمز استعادة عند الحاجة — كل ذلك بلا أي رسوم.
        </div>
      ) : null}
    </Card>
  );
}
