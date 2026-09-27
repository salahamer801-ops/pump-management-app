import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  Bell,
  Cloud,
  CloudOff,
  CloudUpload,
  CalendarCheck,
  Droplets,
  Fuel,
  Info,
  LayoutDashboard,
  Layers,
  Receipt,
  Settings2,
  ShieldCheck,
  Users,
} from "lucide-react";
import { useApp } from "../store";
import { useAuth } from "../auth/AuthProvider";
import { listRequests } from "../auth/pumpApi";
import type { ManagedPump } from "../auth/types";
import { unreadNotifications } from "../domain/rules";
import { formatClock } from "../domain/util";
import { cx, Modal, Pill } from "../components/ui";
import PumpSetup from "./PumpSetup";
import Dashboard from "./screens/Dashboard";
import ActualDayScreen from "./screens/ActualDayScreen";
import PeopleScreen from "./screens/PeopleScreen";
import DialaScreen from "./screens/DialaScreen";
import FinanceScreen from "./screens/FinanceScreen";
import ReportsScreen from "./screens/ReportsScreen";
import SettingsScreen from "./screens/SettingsScreen";
import PumpAccountsScreen from "./screens/PumpAccountsScreen";

export type ManagerTab =
  | "home"
  | "day"
  | "people"
  | "diala"
  | "finance"
  | "reports"
  | "accounts"
  | "settings";

const NAV: { id: ManagerTab; label: string; icon: React.ReactNode }[] = [
  { id: "home", label: "الرئيسية", icon: <LayoutDashboard size={20} /> },
  { id: "day", label: "اليوم الفعلي", icon: <CalendarCheck size={20} /> },
  { id: "people", label: "الأشخاص", icon: <Users size={20} /> },
  { id: "diala", label: "الديالات", icon: <Layers size={20} /> },
  { id: "finance", label: "المالية", icon: <Receipt size={20} /> },
  { id: "reports", label: "التقارير", icon: <BarChart3 size={20} /> },
  { id: "accounts", label: "الحسابات", icon: <ShieldCheck size={20} /> },
  { id: "settings", label: "الإعدادات", icon: <Settings2 size={20} /> },
];

export default function ManagerApp({
  pump: managedPump,
  onSwitchPump,
  offline = false,
}: {
  pump: ManagedPump;
  onSwitchPump: () => void;
  /** وضع تجريبي محلي: لا نداءات للخادم (طلبات الربط والأعضاء والسجل) */
  offline?: boolean;
}) {
  const { state, actions, syncState } = useApp();
  const { user, logout } = useAuth();
  const userName = user?.name ?? "المسؤول";
  const [tab, setTab] = useState<ManagerTab>("home");
  const [selectedDayId, setSelectedDayId] = useState<string | null>(null);
  const [notifOpen, setNotifOpen] = useState(false);
  const [pendingCount, setPendingCount] = useState(managedPump.pendingCount ?? 0);

  const refreshPending = useMemo(
    () => () => {
      if (offline) return;
      listRequests(managedPump.id)
        .then((rows) => setPendingCount(rows.length))
        .catch(() => undefined);
    },
    [managedPump.id, offline]
  );

  useEffect(() => {
    refreshPending();
  }, [refreshPending]);

  /** في الوضع التجريبي المحلي تُخفى شاشة «الحسابات» لأنها تعمل على الخادم */
  const navItems = useMemo(() => (offline ? NAV.filter((n) => n.id !== "accounts") : NAV), [offline]);

  const unread = useMemo(() => unreadNotifications(state).length, [state]);
  const pendingSync = useMemo(
    () => state.syncQueue.filter((s) => s.status === "pending").length,
    [state]
  );

  if (!state.pump) return <PumpSetup pump={managedPump} onLogout={() => void logout()} />;

  /* بيانات التشغيل محليًا، ورقم التعريف الثابت (Pump Code) من الخادم */
  const pump = state.pump;
  const openDay = (dayId: string | null) => {
    setSelectedDayId(dayId);
    setTab("day");
  };

  return (
    <div className="mx-auto min-h-screen max-w-2xl pb-24">
      <header className="sticky top-0 z-30 border-b border-emerald-100/60 bg-white/85 backdrop-blur dark:border-slate-700 dark:bg-slate-900/85">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 text-white shadow-md shadow-emerald-600/20">
              <Droplets size={18} />
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-black leading-tight text-gray-900 dark:text-white">
                {pump.name}
              </div>
              <div className="text-xs text-gray-400">
                لوحة المسؤول · {userName || "المسؤول"} ·{" "}
                <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                  {managedPump.pumpCode}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1">
            {/* حالة حفظ بيانات التشغيل الرسمية على الخادم (PostgreSQL) */}
            {syncState === "synced" ? (
              <span data-testid="cloud-synced">
                <Pill tone="green" className="hidden sm:inline-flex">
                  <Cloud size={12} /> محفوظ على الخادم
                </Pill>
              </span>
            ) : syncState === "connecting" ? (
              <span data-testid="cloud-saving">
                <Pill tone="gray" className="hidden sm:inline-flex">
                  <CloudUpload size={12} /> جارٍ الحفظ…
                </Pill>
              </span>
            ) : syncState === "offline" ? (
              <span data-testid="cloud-offline">
                <Pill tone="amber" className="hidden sm:inline-flex">
                  <CloudOff size={12} /> لا يوجد اتصال بالإنترنت
                </Pill>
              </span>
            ) : null}
            {pendingSync > 0 ? (
              <Pill tone="amber" className="hidden sm:inline-flex">
                <Fuel size={12} /> {pendingSync} غير متزامن
              </Pill>
            ) : null}
            <button
              onClick={() => {
                setNotifOpen(true);
                actions.readNotifications(null);
              }}
              className="relative rounded-full p-2 text-gray-500 hover:bg-gray-100 dark:text-slate-300 dark:hover:bg-slate-800"
              aria-label="الإشعارات والتنبيهات"
            >
              <Bell size={20} />
              {unread > 0 ? (
                <span className="absolute right-0 top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                  {unread}
                </span>
              ) : null}
            </button>
          </div>
        </div>
      </header>

      <main className="px-4 py-4">
        {tab === "home" && <Dashboard onOpenDay={openDay} onGoTab={setTab} />}
        {tab === "day" && (
          <ActualDayScreen dayId={selectedDayId} onChangeDay={setSelectedDayId} />
        )}
        {tab === "people" && <PeopleScreen />}
        {tab === "diala" && <DialaScreen onOpenDay={openDay} />}
        {tab === "finance" && <FinanceScreen />}
        {tab === "reports" && <ReportsScreen />}
        {tab === "accounts" && (
          <PumpAccountsScreen
            pump={managedPump}
            onSwitchPump={onSwitchPump}
            onChanged={refreshPending}
          />
        )}
        {tab === "settings" && <SettingsScreen onLogout={() => void logout()} userName={userName} />}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-gray-100 bg-white/95 backdrop-blur dark:border-slate-700 dark:bg-slate-900/95">
        <div
          className={cx(
            "mx-auto grid max-w-2xl",
            navItems.length === NAV.length ? "grid-cols-8" : "grid-cols-7"
          )}
        >
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setTab(item.id)}
              aria-label={item.label}
              data-testid={`nav-${item.id}`}
              className={cx(
                "flex flex-col items-center gap-0.5 py-2.5 text-[9px] font-bold transition",
                tab === item.id
                  ? "text-emerald-700 dark:text-emerald-400"
                  : "text-gray-400 hover:text-gray-600 dark:text-slate-500"
              )}
            >
              <span
                className={cx(
                  "relative flex h-8 w-10 items-center justify-center rounded-full transition",
                  tab === item.id && "bg-emerald-50 dark:bg-emerald-900/40"
                )}
              >
                {item.icon}
                {item.id === "accounts" && pendingCount > 0 ? (
                  <span className="absolute -top-0.5 right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
                    {pendingCount}
                  </span>
                ) : null}
              </span>
              {item.label}
            </button>
          ))}
        </div>
      </nav>

      <Modal open={notifOpen} onClose={() => setNotifOpen(false)} title="الإشعارات والتنبيهات">
        {state.notifications.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400">لا توجد تنبيهات حاليًا.</p>
        ) : (
          <div className="space-y-2">
            <div className="max-h-[55vh] space-y-2 overflow-y-auto">
              {state.notifications.slice(0, 60).map((n) => (
                <div
                  key={n.id}
                  className={cx(
                    "rounded-2xl border px-3 py-3",
                    n.level === "danger"
                      ? "border-red-100 bg-red-50 dark:border-red-900/40 dark:bg-red-900/20"
                      : n.level === "warn"
                        ? "border-amber-100 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-900/20"
                        : "border-sky-100 bg-sky-50 dark:border-sky-900/40 dark:bg-sky-900/20"
                  )}
                >
                  <div className="flex items-center gap-2 text-sm font-extrabold text-gray-800 dark:text-white">
                    {n.level === "danger" ? (
                      <AlertTriangle size={14} className="text-red-500" />
                    ) : n.level === "warn" ? (
                      <AlertTriangle size={14} className="text-amber-500" />
                    ) : (
                      <Info size={14} className="text-sky-500" />
                    )}
                    {n.title}
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-gray-600 dark:text-slate-300">
                    {n.body}
                  </p>
                  <p className="mt-1 text-[10px] text-gray-400">{formatClock(n.at)}</p>
                </div>
              ))}
            </div>
            <button
              onClick={() => actions.clearNotifications()}
              className="w-full rounded-2xl bg-gray-50 py-3 text-xs font-bold text-gray-500 dark:bg-slate-700 dark:text-slate-300"
            >
              حذف كل الإشعارات
            </button>
          </div>
        )}
      </Modal>
    </div>
  );
}
