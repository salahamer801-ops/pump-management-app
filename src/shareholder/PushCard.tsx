/**
 * بطاقة إشعارات الجوال في إعدادات المساهم:
 * يُفعّلها بزر واحد، فيصله إشعار فوري عند أي تعديل يحفظه مسؤول المضخة.
 */
import { BellRing, BellOff, Info } from "lucide-react";
import { useAuth } from "../auth/AuthProvider";
import { Card, Pill } from "../components/ui";
import { usePushState } from "./push";

export default function PushCard() {
  const { session } = useAuth();
  const pumpId = (session?.memberships ?? []).find((m) => m.status === "approved")?.pumpId ?? null;
  const push = usePushState(pumpId);

  const tone = !push.supported ? "gray" : push.subscribed ? "green" : "amber";
  const label = !push.supported ? "غير مدعوم" : push.subscribed ? "مفعّلة" : "موقوفة";

  return (
    <Card className="p-5" data-testid="push-card">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300">
          {push.subscribed ? <BellRing size={20} /> : <BellOff size={20} />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-extrabold text-gray-900 dark:text-white">إشعارات الجوال</div>
          <div className="text-xs text-gray-400 dark:text-slate-400">
            يصلك إشعار لحظة أي تعديل من مسؤول المضخة
          </div>
        </div>
        <Pill tone={tone}>{label}</Pill>
      </div>

      {!pumpId ? (
        <p className="mt-3 rounded-2xl bg-gray-50 px-3 py-2 text-[11px] leading-relaxed text-gray-500 dark:bg-slate-700/60 dark:text-slate-300">
          اربط حسابك بمضخة أولًا (برقم تعريفها) — الإشعارات تخصّ مضخة محددة.
        </p>
      ) : (
        <>
          {push.message ? (
            <p
              className="mt-3 rounded-2xl bg-gray-50 px-3 py-2 text-[11px] font-bold leading-relaxed text-gray-600 dark:bg-slate-700/60 dark:text-slate-200"
              role="status"
              data-testid="push-message"
            >
              {push.message}
            </p>
          ) : null}

          {push.subscribed ? (
            <button
              type="button"
              onClick={() => void push.disable()}
              disabled={push.busy}
              className="mt-4 w-full rounded-2xl bg-gray-100 py-3 text-xs font-extrabold text-gray-700 transition hover:bg-gray-200 disabled:opacity-60 dark:bg-slate-700 dark:text-slate-100"
              data-testid="push-disable"
            >
              {push.busy ? "جارٍ الإيقاف…" : "إيقاف الإشعارات على هذا الجهاز"}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void push.enable()}
              disabled={push.busy || !push.supported}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 py-3 text-xs font-extrabold text-white transition hover:bg-emerald-700 disabled:opacity-60"
              data-testid="push-enable"
            >
              <BellRing size={15} />
              {push.busy ? "جارٍ التفعيل…" : "فعّل الإشعارات على هذا الجوال"}
            </button>
          )}

          <p className="mt-3 flex items-start gap-2 rounded-2xl bg-sky-50 px-3 py-2 text-[10px] leading-relaxed text-sky-900 dark:bg-sky-900/20 dark:text-sky-200">
            <Info size={12} className="mt-0.5 shrink-0" />
            <span>
              على آيفون: ثبّت التطبيق على الشاشة الرئيسية أولًا (مشاركة ← إضافة إلى الشاشة الرئيسية) وافتحه
              من الأيقونة، ثم فعّل الإشعارات. على أندرويد يعمل مباشرة من كروم بعد السماح.
            </span>
          </p>
        </>
      )}
    </Card>
  );
}
