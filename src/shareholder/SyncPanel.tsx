/**
 * مؤشرات المزامنة للمساهم: حالة الاتصال بالخادم، وقت آخر تحديث، وزر تحديث.
 * تُستخدم في الرئيسية (سطر مختصر) وفي الإعدادات (بطاقة كاملة).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, CloudOff, RefreshCw, Server } from "lucide-react";
import { api } from "../auth/api";
import { Card, Pill } from "../components/ui";
import { SYNC_HINT, SYNC_LABEL, lastUpdateLabel, serverStatusLabel } from "../domain/syncStatus";
import { useOfficialSync } from "./useOfficialSync";

/** حالة الخادم الرسمي (فحص صحة خفيف) */
function useServerHealth(): { ok: boolean | null; checking: boolean; check: () => void } {
  const [ok, setOk] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);
  const busy = useRef(false);

  const check = useCallback(() => {
    if (busy.current) return;
    busy.current = true;
    setChecking(true);
    api<{ ok: boolean }>("/api/health", { auth: false })
      .then((res) => setOk(res.ok === true))
      .catch(() => setOk(false))
      .finally(() => {
        busy.current = false;
        setChecking(false);
      });
  }, []);

  useEffect(() => {
    check();
  }, [check]);

  return { ok, checking, check };
}

export function SyncStatusBar() {
  const { status, lastUpdatedAt, refresh } = useOfficialSync();
  const tone = status === "synced" ? "green" : status === "offline" ? "amber" : status === "syncing" ? "blue" : "gray";

  return (
    <div
      className="flex items-center gap-2 rounded-2xl border border-gray-100 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-800"
      data-testid="sync-status"
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-gray-50 text-gray-500 dark:bg-slate-700 dark:text-slate-300">
        {status === "offline" ? <CloudOff size={14} /> : <CheckCircle2 size={14} />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-extrabold text-gray-800 dark:text-white">
          {SYNC_LABEL[status]}
        </div>
        <div className="truncate text-[10px] text-gray-400 dark:text-slate-400" data-testid="sync-last-updated">
          {lastUpdateLabel(lastUpdatedAt)}
        </div>
      </div>
      <Pill tone={tone}>{status === "syncing" ? "…" : "تحديث"}</Pill>
      <button
        type="button"
        onClick={() => void refresh(true)}
        aria-label="تحديث من الخادم"
        data-testid="sync-refresh"
        className="rounded-xl p-2 text-emerald-700 transition hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-slate-700"
      >
        <RefreshCw size={16} />
      </button>
    </div>
  );
}

export function SyncSettingsCard() {
  const { status, lastUpdatedAt, refresh, online } = useOfficialSync();
  const { ok, checking, check } = useServerHealth();

  return (
    <Card className="p-5" data-testid="sync-settings">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300">
          <Server size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-extrabold text-gray-900 dark:text-white">المزامنة مع المسؤول</div>
          <div className="text-xs text-gray-400 dark:text-slate-400">
            الخادم الرسمي هو المصدر — جهازك نسخة عرض فقط
          </div>
        </div>
        <Pill tone={status === "synced" ? "green" : status === "offline" ? "amber" : "blue"}>
          {SYNC_LABEL[status]}
        </Pill>
      </div>

      <p className="mt-3 rounded-2xl bg-gray-50 px-3 py-2 text-[11px] leading-relaxed text-gray-500 dark:bg-slate-700/60 dark:text-slate-300">
        {SYNC_HINT[status]}
      </p>

      <div className="mt-3 space-y-2 text-[11px]">
        <Row
          icon={<CheckCircle2 size={13} className="text-emerald-600 dark:text-emerald-300" />}
          label="آخر تحديث ناجح"
          value={lastUpdateLabel(lastUpdatedAt)}
        />
        <Row
          icon={
            ok === false ? (
              <AlertTriangle size={13} className="text-amber-600" />
            ) : (
              <Server size={13} className="text-sky-600 dark:text-sky-300" />
            )
          }
          label="الخادم"
          value={serverStatusLabel(online, ok)}
        />
      </div>

      <button
        type="button"
        onClick={() => {
          check();
          void refresh(true);
        }}
        disabled={checking || status === "syncing"}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-emerald-600 py-3 text-xs font-extrabold text-white transition hover:bg-emerald-700 disabled:opacity-60"
        data-testid="sync-now"
      >
        <RefreshCw size={15} className={status === "syncing" ? "animate-spin" : ""} />
        {status === "syncing" ? "جارٍ التحديث…" : "حدّث بياناتي الآن"}
      </button>

      <p className="mt-2 text-center text-[10px] leading-relaxed text-gray-400 dark:text-slate-400">
        يُحدَّث تلقائيًا عند فتح التطبيق، وعند العودة إليه، وكل دقيقة، وعند عودة الإنترنت.
      </p>
    </Card>
  );
}

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 rounded-2xl border border-gray-100 px-3 py-2 dark:border-slate-700">
      {icon}
      <span className="text-gray-400 dark:text-slate-400">{label}</span>
      <span className="ms-auto font-bold text-gray-800 dark:text-slate-100">{value}</span>
    </div>
  );
}

/**
 * السحب للأسفل للتحديث (لمس الجوال): يُفعِّل التحديث عندما تكون الصفحة في أعلاها
 * ويسحب المستخدم إصبعًا لأسفل مسافة كافية.
 */
export function usePullToRefresh(onRefresh: () => void, threshold = 70): void {
  const start = useRef<number | null>(null);

  useEffect(() => {
    const atTop = () => (window.scrollY || document.documentElement.scrollTop || 0) <= 2;

    const onTouchStart = (event: TouchEvent) => {
      start.current = atTop() ? event.touches[0]?.clientY ?? null : null;
    };
    const onTouchMove = (event: TouchEvent) => {
      if (start.current === null) return;
      const y = event.touches[0]?.clientY ?? 0;
      if (y - start.current > threshold) {
        start.current = null;
        onRefresh();
      }
    };
    const onTouchEnd = () => {
      start.current = null;
    };

    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, [onRefresh, threshold]);
}
