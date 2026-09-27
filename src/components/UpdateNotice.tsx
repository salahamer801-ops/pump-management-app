/**
 * شريط «نسخة جديدة متاحة — أعد التحميل» (بدل التحديث الصامت):
 * عند نشر تحديث جديد يُسجّل العامل الخدمي نسخة بالانتظار، ولا يُعاد تحميل
 * الصفحة فوق عمل المستخدم إلا بضغطه.
 */
import { RefreshCw, WifiOff, X } from "lucide-react";
import { usePwaState } from "../pwa";

export function UpdateNotice() {
  const { needRefresh, offlineReady, reload, dismiss } = usePwaState();
  if (!needRefresh) return null;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-50 px-3 pb-3 print:hidden"
      data-testid="update-notice"
      role="status"
    >
      <div className="mx-auto flex max-w-lg items-center gap-2 rounded-2xl bg-slate-900 px-3 py-2.5 text-white shadow-2xl">
        <RefreshCw size={16} className="shrink-0 text-emerald-300" />
        <span className="flex-1 text-[11px] font-bold leading-relaxed">
          {offlineReady ? "النسخة الجديدة جاهزة — أعد التحميل للتحديث" : "نسخة جديدة متاحة — أعد التحميل"}
        </span>
        <button
          type="button"
          onClick={reload}
          className="rounded-xl bg-emerald-500 px-3 py-1.5 text-[11px] font-extrabold text-slate-900 transition hover:bg-emerald-400"
          data-testid="update-reload"
        >
          إعادة التحميل
        </button>
        <button
          type="button"
          onClick={dismiss}
          aria-label="إخفاء إشعار التحديث"
          className="rounded-lg p-1 text-white/70 transition hover:text-white"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}

/** «يعمل بلا إنترنت» — يُظهر مرة واحدة عند تجهيز الأصول */
export function OfflineReadyNotice() {
  const { offlineReady } = usePwaState();
  if (!offlineReady) return null;
  return (
    <div className="flex items-center justify-center gap-1.5 px-3 py-1.5 text-[10px] font-bold text-gray-400 dark:text-slate-500">
      <WifiOff size={11} /> جاهز للعمل بلا إنترنت للأجزاء المحفوظة
    </div>
  );
}
