import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Bell,
  CalendarCheck,
  Droplets,
  Home,
  Info,
  Layers,
  Settings,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { ShareholderProvider, useShareholder } from "./store";
import { useAuth } from "../auth/AuthProvider";
import { readManagerState, readUserLink } from "../domain/storage";
import { formatDateTime } from "../format";
import { tr } from "./i18n";
import { cx, Modal, Pill } from "../components/ui";
import HomeScreen from "./screens/HomeScreen";
import PumpsScreen from "./screens/PumpsScreen";
import CyclesScreen from "./screens/CyclesScreen";
import TurnsScreen from "./screens/TurnsScreen";
import AccountsScreen from "./screens/AccountsScreen";
import SettingsScreen from "./screens/SettingsScreen";
import OfficialScreen from "./screens/OfficialScreen";

type Tab = "home" | "pumps" | "cycles" | "turns" | "official" | "accounts" | "settings";

function Shell({
  onLogout,
  userName,
}: {
  onLogout: () => void;
  userName: string;
}) {
  const { state, actions } = useShareholder();
  const { session } = useAuth();
  const [tab, setTab] = useState<Tab>("home");
  const [notifOpen, setNotifOpen] = useState(false);
  /** السجل الرسمي للمضخة المرتبطة (قراءة فقط) — لإظهار اسم المضخة وكودها والتنبيهات */
  const linkedPumpId =
    (session?.memberships ?? []).find((m) => m.status === "approved")?.pumpId ?? null;
  const linkedPersonId =
    (session?.memberships ?? []).find((m) => m.status === "approved" && m.personId)?.personId ??
    readUserLink();
  const [official, setOfficial] = useState(() => readManagerState(linkedPumpId));
  const lang = state.settings.language;
  const t = (ar: string, en: string) => tr(lang, ar, en);

  /* تحديث السجل الرسمي عند فتح أي تبويب — لا نداءات للخادم، قراءة من الجهاز */
  const goTab = (id: Tab) => {
    setTab(id);
    setOfficial(readManagerState(linkedPumpId));
  };

  useEffect(() => {
    setOfficial(readManagerState(linkedPumpId));
  }, [linkedPumpId]);

  const pumpName = official?.pump?.name ?? null;
  const pumpCode = official?.pump?.pumpCode ?? null;
  /** تنبيهات المسؤول الموجّهة لي (أو العامة) — قراءة فقط، ولا تُحذف من هنا */
  const myNotifications = useMemo(
    () =>
      (official?.notifications ?? [])
        .filter((n) => !n.personId || (linkedPersonId && n.personId === linkedPersonId))
        .slice(0, 60),
    [official, linkedPersonId]
  );
  const unread = myNotifications.filter((n) => !n.read).length;

  // تطبيق الثيم واللغة على مستوى المستند
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", state.settings.theme === "dark");
    root.setAttribute("dir", lang === "en" ? "ltr" : "rtl");
    root.setAttribute("lang", lang === "en" ? "en" : "ar");
    return () => root.classList.remove("dark");
  }, [state.settings.theme, lang]);

  // نقل اسم الجلسة إلى الملف الشخصي عند أول دخول
  useEffect(() => {
    if (userName && !state.profile.name) {
      actions.setProfile({ ...state.profile, name: userName });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userName]);

  const NAV: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "home", label: t("الرئيسية", "Home"), icon: <Home size={22} /> },
    { id: "pumps", label: t("المضخات", "Pumps"), icon: <Droplets size={22} /> },
    { id: "cycles", label: t("الدياله", "Cycles"), icon: <Layers size={22} /> },
    { id: "turns", label: t("دوري", "My Turn"), icon: <CalendarCheck size={22} /> },
    { id: "official", label: t("السجل الرسمي", "Official"), icon: <ShieldCheck size={22} /> },
    { id: "accounts", label: t("الحسابات", "Accounts"), icon: <Wallet size={22} /> },
    { id: "settings", label: t("الإعدادات", "Settings"), icon: <Settings size={22} /> },
  ];

  return (
    <div className="mx-auto min-h-screen max-w-lg pb-24">
      <header className="sticky top-0 z-30 border-b border-emerald-100/60 bg-white/80 backdrop-blur dark:border-slate-700 dark:bg-slate-900/80">
        <div className="mx-auto flex max-w-lg items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 text-white shadow-md shadow-emerald-600/20">
              <Droplets size={18} />
            </div>
            <div>
              <div className="text-sm font-black leading-tight text-gray-900 dark:text-white">
                {pumpName ?? t("مشروع تنظيم المضخات", "Pump Organization")}
              </div>
              <div className="text-xs text-gray-400 dark:text-slate-400">
                {state.profile.name || t("مساهم", "Member")}
                {pumpCode ? (
                  <span className="mr-1 font-mono font-bold text-emerald-600 dark:text-emerald-400">
                    · {pumpCode}
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setNotifOpen(true)}
            aria-label={t("التنبيهات", "Alerts")}
            data-testid="user-notifications"
            className="relative rounded-full p-2 text-gray-500 hover:bg-gray-100 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <Bell size={20} />
            {unread > 0 ? (
              <span className="absolute right-0 top-0 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
                {unread}
              </span>
            ) : null}
          </button>
        </div>
      </header>

      <main className="px-4 py-4">
        {tab === "home" && <HomeScreen onGoTo={goTab} />}
        {tab === "pumps" && <PumpsScreen />}
        {tab === "cycles" && <CyclesScreen />}
        {tab === "turns" && <TurnsScreen />}
        {tab === "official" && <OfficialScreen />}
        {tab === "accounts" && <AccountsScreen />}
        {tab === "settings" && <SettingsScreen onLogout={onLogout} />}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-gray-100 bg-white/95 backdrop-blur dark:border-slate-700 dark:bg-slate-900/95">
        <div className="mx-auto grid max-w-lg grid-cols-7">
          {NAV.map((item) => (
            <button
              key={item.id}
              onClick={() => goTab(item.id)}
              data-testid={`nav-${item.id}`}
              className={cx(
                "flex flex-col items-center gap-0.5 py-2.5 text-[10px] font-bold transition",
                tab === item.id
                  ? "text-emerald-700 dark:text-emerald-400"
                  : "text-gray-400 hover:text-gray-600 dark:text-slate-400 dark:hover:text-slate-300"
              )}
              aria-label={item.label}
            >
              <span
                className={cx(
                  "flex h-8 w-11 items-center justify-center rounded-full transition",
                  tab === item.id && "bg-emerald-50 dark:bg-emerald-900/30"
                )}
              >
                {item.icon}
              </span>
              {item.label}
            </button>
          ))}
        </div>
      </nav>
      <Modal
        open={notifOpen}
        onClose={() => setNotifOpen(false)}
        title={t("التنبيهات من المسؤول", "Alerts from the manager")}
      >
        {myNotifications.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400">
            {t("لا توجد تنبيهات حاليًا.", "No alerts right now.")}
          </p>
        ) : (
          <div className="max-h-[60vh] space-y-2 overflow-y-auto" data-testid="user-notifications-list">
            {myNotifications.map((n) => (
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
                  {n.level === "danger" || n.level === "warn" ? (
                    <AlertTriangle size={14} className="text-amber-500" />
                  ) : (
                    <Info size={14} className="text-sky-500" />
                  )}
                  {n.title}
                  {!n.read ? (
                    <Pill tone="green" className="mr-auto">
                      {t("جديد", "New")}
                    </Pill>
                  ) : null}
                </div>
                <p className="mt-1 text-xs leading-relaxed text-gray-600 dark:text-slate-300">{n.body}</p>
                <p className="mt-1 text-[10px] text-gray-400">{formatDateTime(n.at)}</p>
              </div>
            ))}
          </div>
        )}
        <p className="mt-3 text-center text-[10px] leading-relaxed text-gray-400">
          {t(
            "التنبيهات تأتي من سجل المسؤول في هذا الجهاز — قراءة فقط.",
            "Alerts come from the manager record on this device — read only."
          )}
        </p>
      </Modal>
    </div>
  );
}

export default function ShareholderApp({
  onLogout,
  userName,
}: {
  onLogout: () => void;
  userName: string;
}) {
  return (
    <ShareholderProvider>
      <Shell onLogout={onLogout} userName={userName} />
    </ShareholderProvider>
  );
}
