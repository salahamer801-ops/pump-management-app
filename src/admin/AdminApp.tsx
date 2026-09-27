import { useState } from "react";
import {
  Activity,
  Download,
  Droplets,
  Gauge,
  LogOut,
  ScrollText,
  Settings2,
  ShieldCheck,
  Users,
  UserCheck,
} from "lucide-react";
import { useAuth } from "../auth/AuthProvider";
import { cx } from "../components/ui";
import OverviewScreen from "./screens/OverviewScreen";
import UsersScreen from "./screens/UsersScreen";
import PumpsScreen from "./screens/PumpsScreen";
import MembershipsScreen from "./screens/MembershipsScreen";
import AuditScreen from "./screens/AuditScreen";
import AdminSettingsScreen from "./screens/AdminSettingsScreen";

type Tab = "overview" | "users" | "pumps" | "memberships" | "audit" | "settings";

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "overview", label: "نظرة عامة", icon: <Gauge size={18} /> },
  { id: "users", label: "المستخدمون", icon: <Users size={18} /> },
  { id: "pumps", label: "المضخات", icon: <Droplets size={18} /> },
  { id: "memberships", label: "الطلبات والعضويات", icon: <UserCheck size={18} /> },
  { id: "audit", label: "سجل التدقيق", icon: <ScrollText size={18} /> },
  { id: "settings", label: "إعدادات النظام", icon: <Settings2 size={18} /> },
];

/** لوحة تحكم مسؤول النظام — الصلاحية محقّقة على الخادم لكل نداء */
export default function AdminApp({ onExit }: { onExit?: () => void }) {
  const { session, logout } = useAuth();
  const [tab, setTab] = useState<Tab>("overview");

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900" data-testid="admin-app">
      {/* الرأس */}
      <header className="sticky top-0 z-20 border-b border-emerald-700/20 bg-gradient-to-l from-emerald-700 via-emerald-600 to-teal-600 text-white shadow-lg shadow-emerald-900/10">
        <div className="mx-auto flex max-w-5xl items-center gap-3 px-4 py-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/15 backdrop-blur">
            <ShieldCheck size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-sm font-black leading-tight">
              لوحة تحكم مسؤول النظام
              <span className="rounded-full bg-white/15 px-2 py-0.5 text-[9px] font-bold">ADMIN</span>
            </div>
            <div className="truncate text-[11px] text-emerald-50/90">
              {session?.user?.name ?? "مسؤول النظام"}
            </div>
          </div>
          {onExit ? (
            <button
              type="button"
              onClick={onExit}
              aria-label="رجوع إلى تطبيقي"
              data-testid="admin-exit"
              className="flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-2 text-[11px] font-bold backdrop-blur transition hover:bg-white/25"
            >
              رجوع إلى تطبيقي
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => void logout()}
            aria-label="تسجيل الخروج"
            data-testid="admin-logout"
            className="flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-2 text-[11px] font-bold backdrop-blur transition hover:bg-white/25"
          >
            <LogOut size={14} /> خروج
          </button>
        </div>

        {/* التنقل */}
        <nav className="mx-auto max-w-5xl px-2 pb-2">
          <div className="flex gap-1 overflow-x-auto">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                aria-label={t.label}
                data-testid={`admin-tab-${t.id}`}
                aria-current={tab === t.id}
                className={cx(
                  "flex shrink-0 items-center gap-1.5 rounded-2xl px-3 py-2 text-[11px] font-extrabold transition",
                  tab === t.id
                    ? "bg-white text-emerald-700 shadow-sm"
                    : "text-emerald-50/90 hover:bg-white/10"
                )}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
          </div>
        </nav>
      </header>

      <main className="mx-auto max-w-5xl space-y-4 px-4 py-5">
        {tab === "overview" ? <OverviewScreen /> : null}
        {tab === "users" ? <UsersScreen /> : null}
        {tab === "pumps" ? <PumpsScreen /> : null}
        {tab === "memberships" ? <MembershipsScreen /> : null}
        {tab === "audit" ? <AuditScreen /> : null}
        {tab === "settings" ? <AdminSettingsScreen /> : null}

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white px-4 py-3 text-[10px] text-gray-400 shadow-sm dark:bg-slate-800 dark:text-slate-400">
          <span className="flex items-center gap-1.5">
            <Activity size={12} /> كل عملية في هذه اللوحة تُسجَّل في سجل التدقيق باسمك ووقتها.
          </span>
          <span className="flex items-center gap-1.5">
            <Download size={12} /> لا حذف نهائي: الإيقاف والأرشفة حالات قابلة للرجوع.
          </span>
        </div>
      </main>
    </div>
  );
}
