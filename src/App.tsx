import { useEffect, useMemo, useState } from "react";
import { Droplets, Megaphone } from "lucide-react";
import { AuthProvider, useAuth } from "./auth/AuthProvider";
import LoginScreen from "./components/LoginScreen";
import ServerLoginScreen from "./screens/LoginScreen";
import ManagerShell from "./manager/ManagerShell";
import ManagerApp from "./manager/ManagerApp";
import ShareholderApp from "./shareholder/ShareholderApp";
import AdminApp from "./admin/AdminApp";
import { AppProvider } from "./store";
import { managerStorageKey } from "./domain/storage";
import type { ManagedPump } from "./auth/types";
import { generateId, generatePumpCode, getSession, logoutUser } from "./lib/auth";
import type { AuthSession } from "./types";
import { clearLegacySession } from "./session";

/**
 * الباب الأمامي للتطبيق هو الوضع المحلي (`src/lib/auth.ts` + `src/components/LoginScreen.tsx`).
 * الحساب الحقيقي على الخادم يبقى متاحًا بزر واحد في الشريط العلوي، ولا يتأثر بالوضع المحلي.
 */
export default function App() {
  useEffect(() => {
    /* الجلسة القديمة (الاسم فقط) لم تكن هوية — تُزال عند أول تشغيل */
    clearLegacySession();
  }, []);

  return (
    <AuthProvider>
      <Root />
    </AuthProvider>
  );
}

function Root() {
  const { session: serverSession, loading, logout } = useAuth();

  /* جلسة الوضع المحلي */
  const [session, setSession] = useState<AuthSession | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [serverLoginOpen, setServerLoginOpen] = useState(false);
  /** فتح لوحة مسؤول النظام — لمن يدير مضخة أيضًا يبقى تطبيقه الأساسي */
  const [adminPanel, setAdminPanel] = useState(false);

  useEffect(() => {
    const existing = getSession();
    setSession(existing);
    setAuthChecked(true);
  }, []);

  /**
   * نجاح الدخول الحسابي الحقيقي يغلق بوابة الدخول فورًا ليدخل صاحب الحساب
   * إلى تطبيقه: تطبيق المسؤول أو تطبيق المستخدم (مساهم) حسب نوع الحساب.
   */
  useEffect(() => {
    if (serverSession) setServerLoginOpen(false);
  }, [serverSession]);

  const handleLogin = (s: AuthSession) => setSession(s);
  const handleLogout = () => {
    if (session) logoutUser(session.userId);
    setSession(null);
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-16 w-16 animate-pulse items-center justify-center rounded-3xl bg-gradient-to-br from-emerald-500 to-emerald-700 text-white">
            <Droplets size={28} />
          </div>
          <p className="text-sm font-bold text-gray-500">جارٍ التحقق…</p>
        </div>
      </div>
    );
  }

  if (!authChecked) return null;

  if (serverLoginOpen) {
    return (
      <div className="min-h-screen bg-gray-50">
        <TopBar
          note="الدخول الحسابي الحقيقي — الحساب على الخادم وقاعدة البيانات"
          actionLabel="رجوع للوضع المحلي"
          onAction={() => setServerLoginOpen(false)}
        />
        <ServerLoginScreen />
      </div>
    );
  }

  /* من دخل بحسابه الحقيقي يرى تطبيقه الحقيقي كما هو */
  if (serverSession) {
    const announcement = serverSession.announcement;
    const banner =
      announcement?.active && announcement.text.trim() ? (
        <AnnouncementBar tone={announcement.tone} text={announcement.text} />
      ) : null;
    const isAdmin = Boolean(serverSession.user.isAdmin);
    const isManager = serverSession.user.accountType === "manager";

    /* لوحة النظام لمن لا يدير مضخة، ولمن فتحها من تطبيق المسؤول */
    if (isAdmin && (!isManager || adminPanel)) {
      return (
        <>
          {banner}
          <AdminApp onExit={isManager ? () => setAdminPanel(false) : undefined} />
        </>
      );
    }
    if (isManager) {
      return (
        <>
          {banner}
          {isAdmin ? (
            <div className="border-b border-slate-200 bg-slate-100 px-3 py-2 print:hidden">
              <div className="mx-auto flex max-w-2xl items-center justify-between gap-2">
                <span className="text-[11px] font-bold text-slate-600">
                  أنت مسؤول نظام — لوحة التحكم متاحة لك
                </span>
                <button
                  type="button"
                  onClick={() => setAdminPanel(true)}
                  aria-label="لوحة مسؤول النظام"
                  data-testid="open-admin-panel"
                  className="rounded-lg bg-slate-900 px-3 py-1.5 text-[11px] font-extrabold text-white transition hover:bg-slate-800"
                >
                  لوحة مسؤول النظام
                </button>
              </div>
            </div>
          ) : null}
          <ManagerShell />
        </>
      );
    }
    return (
      <>
        {banner}
        <ShareholderApp userName={serverSession.user.name} onLogout={() => void logout()} />
      </>
    );
  }

  if (!session) {
    return (
      <div className="min-h-screen bg-gray-50">
        <TopBar
          note="وضع محلي — الحسابات محفوظة في هذا المتصفح فقط"
          actionLabel="الدخول الحسابي الحقيقي"
          onAction={() => setServerLoginOpen(true)}
        />
        <LoginScreen onLogin={handleLogin} />
      </div>
    );
  }

  return (
    <LocalApp
      session={session}
      onLogout={handleLogout}
      onOpenServerLogin={() => setServerLoginOpen(true)}
    />
  );
}

/** إعلان مسؤول النظام: يظهر أعلى التطبيق لكل المستخدمين حتى يغلقوه */
function AnnouncementBar({ tone, text }: { tone: "info" | "warn" | "danger"; text: string }) {
  const key = `pump-announcement-dismissed::${text.slice(0, 40)}`;
  const [hidden, setHidden] = useState(() => {
    try {
      return localStorage.getItem(key) === "1";
    } catch {
      return false;
    }
  });
  if (hidden) return null;
  const tones = {
    info: "bg-sky-50 text-sky-900 border-sky-200",
    warn: "bg-amber-50 text-amber-900 border-amber-200",
    danger: "bg-red-50 text-red-900 border-red-200",
  } as const;
  return (
    <div
      className={`border-b px-3 py-2 ${tones[tone]} print:hidden`}
      data-testid="system-announcement"
      role="status"
    >
      <div className="mx-auto flex max-w-3xl items-start gap-2">
        <Megaphone size={15} className="mt-0.5 shrink-0" />
        <p className="flex-1 text-[11px] font-bold leading-relaxed">{text}</p>
        <button
          type="button"
          aria-label="إغلاق الإعلان"
          onClick={() => {
            setHidden(true);
            try {
              localStorage.setItem(key, "1");
            } catch {
              /* ignore */
            }
          }}
          className="rounded-lg px-2 py-1 text-[10px] font-bold opacity-70 transition hover:opacity-100"
        >
          إغلاق
        </button>
      </div>
    </div>
  );
}

/** شريط علوي صغير: يوضّح الوضع الحالي، وفيه مدخل الحساب الحقيقي وزر تسجيل الخروج */
function TopBar({
  note,
  actionLabel,
  onAction,
  onLogout,
}: {
  note: string;
  actionLabel: string;
  onAction: () => void;
  onLogout?: () => void;
}) {
  return (
    <div className="border-b border-amber-200 bg-amber-50 px-3 py-2" data-testid="local-mode-bar">
      <div className="mx-auto flex max-w-2xl flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] font-bold leading-relaxed text-amber-900">{note}</span>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onAction}
            aria-label={actionLabel}
            data-testid="open-server-login"
            className="rounded-lg bg-white px-2 py-1 text-[11px] font-extrabold text-amber-900 ring-1 ring-amber-300 transition hover:bg-amber-100"
          >
            {actionLabel}
          </button>
          {onLogout ? (
            <button onClick={onLogout} className="text-sm text-red-600" data-testid="local-logout">
              تسجيل الخروج
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

const DEMO_PUMP_CODE_KEY = "pump_demo_code_v1";
const DEMO_PUMP_ID_KEY = "pump_demo_id_v1";

/** قيمة تُولَّد مرة واحدة وتُثبَّت في هذا المتصفح (معرّف المضخة المحلية ورقم تعريفها) */
function storedOnce(key: string, make: () => string): string {
  let value = "";
  try {
    value = localStorage.getItem(key) ?? "";
  } catch {
    /* ignore */
  }
  if (!value) {
    value = make();
    try {
      localStorage.setItem(key, value);
    } catch {
      /* ignore */
    }
  }
  return value;
}

/** مضخة محلية للحساب المحلي — رقم تعريف ثابت في هذا المتصفح */
function localPump(managerId: string, name: string): ManagedPump {
  return {
    id: storedOnce(DEMO_PUMP_ID_KEY, generateId),
    pumpCode: storedOnce(DEMO_PUMP_CODE_KEY, generatePumpCode),
    name,
    description: "مضخة محلية — لا تُرسل بياناتها إلى أي خادم.",
    location: "",
    managerId,
    status: "active",
    createdAt: new Date().toISOString(),
    membersCount: 0,
    pendingCount: 0,
  };
}

/** واجهة المستخدم داخل الوضع المحلي: مخزن محلي كامل، بلا نداءات للخادم */
function LocalApp({
  session,
  onLogout,
  onOpenServerLogin,
}: {
  session: AuthSession;
  onLogout: () => void;
  onOpenServerLogin: () => void;
}) {
  const pump = useMemo(
    () => (session.accountType === "manager" ? localPump(session.userId, "مضخة محلية") : null),
    [session]
  );

  const bar = (
    <TopBar
      note={`وضع محلي — ${session.name} · البيانات في هذا المتصفح فقط`}
      actionLabel="الدخول الحسابي الحقيقي"
      onAction={onOpenServerLogin}
      onLogout={onLogout}
    />
  );

  if (session.accountType === "manager" && pump) {
    return (
      <div className="min-h-screen bg-gray-50">
        {bar}
        <AppProvider key={pump.id} storageKey={managerStorageKey(pump.id)} adoptName={pump.name}>
          <ManagerApp pump={pump} onSwitchPump={() => undefined} offline />
        </AppProvider>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {bar}
      <ShareholderApp userName={session.name} onLogout={onLogout} />
    </div>
  );
}
