/**
 * مزامنة جهاز المساهم مع الخادم الرسمي — مكان واحد لكل التحديثات.
 *
 * متى يُحدَّث؟
 *  ١) عند فتح التطبيق.
 *  ٢) عند العودة إليه من الخلفية (visibilitychange/focus).
 *  ٣) عند عودة الشبكة (online) أو انقطاعها (offline).
 *  ٤) كل ٦٠ ثانية وهو مفتوح ومرئي ــ بفحص «رقم النسخة» الخفيف قبل أي تنزيل.
 *  ٥) يدويًّا بزر «تحديث» (force: ينزّل مهما كان رقم النسخة).
 *
 * لا تُعدَّل بيانات المسؤول من هنا: هذه قراءة رسمية فقط.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "../auth/AuthProvider";
import { latestOfficialSyncAt } from "../domain/storage";
import type { OfficialSyncStatus } from "../domain/syncStatus";
import { syncOfficialPump, type PumpSyncOutcome } from "./officialSync";

/** الفاصل بين نبضتين تلقائيتين وهو مفتوح */
export const SYNC_INTERVAL_MS = 60_000;

export interface OfficialSyncValue {
  status: OfficialSyncStatus;
  /** وقت آخر تحديث ناجح (ISO) أو null */
  lastUpdatedAt: string | null;
  /** يزيد كلما وصلت بيانات جديدة — لتُعاد قراءة السجل الرسمي في الشاشات */
  tick: number;
  online: boolean;
  refresh: (force?: boolean) => Promise<void>;
}

const OfficialSyncContext = createContext<OfficialSyncValue | null>(null);

export function OfficialSyncProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();

  /* مفتاح ثابت: معرّفات المضخات المعتمدة مرتّبة (لا يتغيّر مع كل عرض) */
  const key = (session?.memberships ?? [])
    .filter((m) => m.status === "approved")
    .map((m) => m.pumpId)
    .sort()
    .join(",");

  const [status, setStatus] = useState<OfficialSyncStatus>("idle");
  const [lastUpdatedAt, setLastUpdatedAt] = useState<string | null>(() =>
    latestOfficialSyncAt(key ? key.split(",") : [])
  );
  const [tick, setTick] = useState(0);
  const [online, setOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine !== false
  );
  const busy = useRef(false);

  const refresh = useCallback(
    async (force = false) => {
      const ids = key ? key.split(",") : [];
      if (ids.length === 0) {
        setStatus("idle");
        return;
      }
      /* لا نداءات متراكبة: نبضة واحدة تكفي */
      if (busy.current) return;
      busy.current = true;
      setStatus("syncing");
      let anyOffline = false;
      let anyUpdated = false;
      try {
        for (const id of ids) {
          const outcome: PumpSyncOutcome = await syncOfficialPump(id, force);
          if (outcome === "offline") anyOffline = true;
          else if (outcome === "updated") anyUpdated = true;
        }
      } finally {
        busy.current = false;
      }
      setLastUpdatedAt(latestOfficialSyncAt(ids));
      setStatus(anyOffline ? "offline" : "synced");
      if (anyUpdated || force) setTick((n) => n + 1);
    },
    [key]
  );

  /* عند أول فتح + أي تغيّر في المضخات المرتبطة (موافقة جديدة على الربط) */
  useEffect(() => {
    if (!key) {
      setStatus("idle");
      return;
    }
    void refresh(false);
  }, [key, refresh]);

  useEffect(() => {
    if (!key) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void refresh(false);
    }, SYNC_INTERVAL_MS);

    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh(false);
    };
    const onOnline = () => {
      setOnline(true);
      void refresh(false);
    };
    const onOffline = () => setOnline(false);
    const onFocus = () => void refresh(false);

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("focus", onFocus);
    };
  }, [key, refresh]);

  const value = useMemo<OfficialSyncValue>(
    () => ({ status: online ? status : "offline", lastUpdatedAt, tick, online, refresh }),
    [status, lastUpdatedAt, tick, online, refresh]
  );

  return <OfficialSyncContext.Provider value={value}>{children}</OfficialSyncContext.Provider>;
}

export function useOfficialSync(): OfficialSyncValue {
  const ctx = useContext(OfficialSyncContext);
  if (!ctx) throw new Error("useOfficialSync must be used within OfficialSyncProvider");
  return ctx;
}
