import { useEffect, useState } from "react";
import { Megaphone } from "lucide-react";
import { AuthProvider, useAuth } from "./auth/AuthProvider";
import ServerLoginScreen from "./screens/LoginScreen";
import ManagerShell from "./manager/ManagerShell";
import ShareholderApp from "./shareholder/ShareholderApp";
import AdminApp from "./admin/AdminApp";
import { BrandSplash } from "./components/Brand";
import { UpdateNotice } from "./components/UpdateNotice";
import { clearLegacySession } from "./session";


/**
 * الباب الوحيد للتطبيق: الحساب الحقيقي على الخادم (رقم الهاتف + كلمة المرور).
 * لا وجود لوضع محلي ولا لتسجيل حساب في المتصفح — الحسابات والعضويات والبيانات
 * كلها على الخادم في PostgreSQL عبر `/api`.
 */
export default function App() {
  useEffect(() => {
    /* الجلسة القديمة (الاسم فقط) لم تكن هوية — تُزال عند أول تشغيل */
    clearLegacySession();
  }, []);

  return (
    <AuthProvider>
      <Root />
      {/* إشعار النسخة الجديدة — يظهر في كل الشاشات فوق الشريط السفلي */}
      <UpdateNotice />
    </AuthProvider>
  );
}

function Root() {
  const { session, loading, logout } = useAuth();
  /** فتح لوحة مسؤول النظام — لمن يدير مضخة أيضًا يبقى تطبيقه الأساسي */
  const [adminPanel, setAdminPanel] = useState(false);

  if (loading) {
    /* شاشة البدء: يملأ الشعار الشاشة أثناء التحقق من الحساب */
    return <BrandSplash />;
  }

  /* بلا حساب: شاشة الدخول/إنشاء الحساب على الخادم — لا شيء غيرها */
  if (!session) {
    return <ServerLoginScreen />;
  }

  const announcement = session.announcement;
  const banner =
    announcement?.active && announcement.text.trim() ? (
      <AnnouncementBar tone={announcement.tone} text={announcement.text} />
    ) : null;
  const isAdmin = Boolean(session.user.isAdmin);
  const isManager = session.user.accountType === "manager";

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
      <ShareholderApp userName={session.user.name} onLogout={() => void logout()} />
    </>
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

