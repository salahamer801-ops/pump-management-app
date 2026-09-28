import { useEffect, useState } from "react";
import {
  ArrowRight,
  KeyRound,
  LogIn,
  Send,
  ShieldCheck,
  UserPlus,
  UserRound,
} from "lucide-react";
import { useAuth } from "../auth/AuthProvider";
import type { AccountType } from "../auth/types";
import { ApiError } from "../auth/api";
import { Button, Field, TextInput, cx } from "../components/ui";
import { BRAND_NAME, BrandLogo } from "../components/Brand";

type Tab = "login" | "register" | "forgot";

interface PublicSettings {
  announcement: { active: boolean; tone: "info" | "warn" | "danger"; text: string };
  registration: { manager: boolean; user: boolean };
}

const errorText = (err: unknown) =>
  err instanceof ApiError ? err.message : "تعذّر تنفيذ العملية — حاول مرة أخرى.";

/* عناوين المراحل: كل مرحلة لها بطاقة واحدة بعنوان واضح */
const HEADINGS: Record<Tab, { title: string; subtitle: string }> = {
  login: { title: "تسجيل الدخول", subtitle: "أدخل رقم هاتفك وكلمة المرور للمتابعة" },
  register: { title: "إنشاء حساب جديد", subtitle: "حساب شخصي واحد — لا يمكن الدخول إلى حساب غيرك" },
  forgot: { title: "استعادة كلمة المرور", subtitle: "برقم الهاتف والاسم المسجَّل في حسابك" },
};

export default function LoginScreen() {
  const [tab, setTab] = useState<Tab>("login");
  const [notice, setNotice] = useState("");
  /** إعدادات عامة: إعلان مسؤول النظام وحالة فتح التسجيل */
  const [system, setSystem] = useState<PublicSettings | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/settings/public")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (alive && data) setSystem(data as PublicSettings);
      })
      .catch(() => {
        /* بلا اتصال: تبقى الشاشة تعمل كما هي */
      });
    return () => {
      alive = false;
    };
  }, []);

  const announcement = system?.announcement;
  const registrationClosed = system
    ? !system.registration.manager && !system.registration.user
    : false;
  const heading = HEADINGS[tab];

  const go = (next: Tab) => {
    setNotice("");
    setTab(next);
  };

  return (
    /* خلفية كحلية كاملة للشاشة، وبطاقة بيضاء واحدة في الوسط للنموذج */
    <div
      className="relative flex min-h-dvh w-full flex-col overflow-hidden bg-[#04101f]"
      data-testid="login-screen"
    >
      {/* طبقات العمق والضوء */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-[#0d2b4e] via-[#0a1d36] to-[#04101f]" />
      <span className="pointer-events-none absolute -top-32 right-[-12%] h-80 w-80 rounded-full bg-sky-500/25 blur-3xl" />
      <span className="pointer-events-none absolute -bottom-24 left-[-10%] h-96 w-96 rounded-full bg-emerald-500/15 blur-3xl" />
      <span className="pointer-events-none absolute inset-x-0 top-0 h-px bg-white/15" />
      <span
        className="pointer-events-none absolute inset-0 opacity-[0.06]"
        style={{
          backgroundImage:
            "linear-gradient(to right, #ffffff 1px, transparent 1px), linear-gradient(to bottom, #ffffff 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-4 py-9 sm:px-6">
        <div className="w-full max-w-md">
          {/* الهوية */}
          <div className="mb-6 flex flex-col items-center text-center">
            <BrandLogo size={84} rounded="rounded-3xl" className="ring-1 ring-white/25" />
            <h1 className="mt-4 text-2xl font-black text-white sm:text-[28px]">{BRAND_NAME}</h1>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-1.5">
              {["الديالات", "الأدوار", "الحصص", "الحسابات"].map((item) => (
                <span
                  key={item}
                  className="rounded-full bg-white/10 px-3 py-1 text-[10px] font-extrabold text-sky-100/90 ring-1 ring-inset ring-white/10"
                >
                  {item}
                </span>
              ))}
            </div>
          </div>

          {announcement?.active && announcement.text.trim() ? (
            <div
              data-testid="login-announcement"
              className={cx(
                "mb-4 rounded-2xl px-4 py-3 text-[11px] font-bold leading-relaxed ring-1 ring-inset backdrop-blur",
                announcement.tone === "danger"
                  ? "bg-red-500/15 text-red-50 ring-red-400/30"
                  : announcement.tone === "warn"
                    ? "bg-amber-400/15 text-amber-50 ring-amber-300/30"
                    : "bg-sky-400/15 text-sky-50 ring-sky-300/30"
              )}
            >
              {announcement.text}
            </div>
          ) : null}

          {registrationClosed ? (
            <p className="mb-4 rounded-2xl bg-white/10 px-4 py-3 text-center text-[11px] font-bold text-sky-100 ring-1 ring-inset ring-white/10">
              إنشاء الحسابات متوقف حاليًا — تواصل مع مسؤول النظام.
            </p>
          ) : null}

          {notice ? (
            <p
              className="mb-4 rounded-2xl bg-emerald-500/15 px-4 py-3 text-center text-xs font-bold text-emerald-50 ring-1 ring-inset ring-emerald-400/30"
              data-testid="auth-notice"
            >
              {notice}
            </p>
          ) : null}

          {/* البطاقة */}
          <div className="rounded-3xl bg-white p-5 shadow-2xl shadow-slate-950/50 ring-1 ring-white/25 sm:p-7 dark:bg-slate-900 dark:ring-slate-700/60">
            <header className="mb-5 text-center">
              <h2 className="text-xl font-black text-slate-900 dark:text-white" data-testid="auth-title">
                {heading.title}
              </h2>
              <p className="mt-1 text-[11px] font-bold text-slate-500 dark:text-slate-300">{heading.subtitle}</p>
            </header>

            {tab === "login" ? (
              <LoginForm
                onDone={() => setNotice("")}
                onGo={go}
                canRegister={!system ? true : system.registration.manager || system.registration.user}
              />
            ) : null}

            {tab === "register" ? (
              <RegisterForm
                onGo={go}
                onDone={() => {
                  /* رد واضح بعد إنشاء الحساب: لا يبدو الزر كأنه لم يستجب */
                  setNotice("تم إنشاء الحساب بنجاح — سجّل الدخول الآن برقم هاتفك وكلمة المرور.");
                  setTab("login");
                }}
              />
            ) : null}

            {tab === "forgot" ? (
              <ForgotForm
                onGo={go}
                onDone={(message) => {
                  setNotice(message);
                  setTab("login");
                }}
              />
            ) : null}
          </div>

          <p className="mt-6 flex items-center justify-center gap-2 text-[11px] font-bold text-sky-100/55">
            <ShieldCheck size={13} />
            دخول آمن — كلمة المرور مُشفَّرة ولا يمكن قراءتها
          </p>
          <p className="mt-2 text-center text-[11px] text-sky-100/60">
            برمجة وتطوير:{" "}
            <a
              href="https://www.linkedin.com/in/abdulmalek-saleh-amer-70057226b"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="صفحة المطوّر عبدالملك عامر على LinkedIn"
              data-testid="developer-linkedin"
              className="font-bold text-sky-100 underline decoration-sky-200/40 underline-offset-2 transition hover:text-white"
            >
              المهندس/ عبدالملك عامر
            </a>
          </p>
        </div>
      </main>
    </div>
  );
}

/** رابط نصّي صغير أسفل البطاقة (الوصول للحساب الجديد/الاستعادة) */
function TextLink({
  onClick,
  children,
  testId,
}: {
  onClick: () => void;
  children: React.ReactNode;
  testId: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className="rounded-lg px-1 font-extrabold text-emerald-700 underline decoration-emerald-600/30 decoration-2 underline-offset-4 transition hover:text-emerald-800"
    >
      {children}
    </button>
  );
}

function ErrorBox({ message }: { message: string }) {
  if (!message) return null;
  return (
    <p
      className="rounded-2xl bg-red-50 px-4 py-3 text-xs font-bold text-red-700 dark:bg-red-900/30 dark:text-red-200"
      data-testid="auth-error"
      role="alert"
    >
      {message}
    </p>
  );
}

/* --------------------------------- دخول -------------------------------- */

function LoginForm({
  onDone,
  onGo,
  canRegister,
}: {
  onDone: () => void;
  onGo: (tab: Tab) => void;
  /** يظهر رابط «إنشاء حساب جديد» فقط إذا كان التسجيل مفتوحًا من إدارة النظام */
  canRegister: boolean;
}) {
  const { login } = useAuth();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError("");
    if (!phone.trim() || !password) {
      setError("اكتب رقم الهاتف وكلمة المرور.");
      return;
    }
    setBusy(true);
    try {
      await login(phone.trim(), password);
      onDone();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <ErrorBox message={error} />
      <Field label="رقم الهاتف">
        <TextInput
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="7xxxxxxxx"
          inputMode="tel"
          autoComplete="tel"
          aria-label="رقم الهاتف"
          data-testid="login-phone"
        />
      </Field>
      <Field label="كلمة المرور">
        <TextInput
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="••••••••"
          autoComplete="current-password"
          aria-label="كلمة المرور"
          data-testid="login-password"
        />
      </Field>
      <Button
        onClick={submit}
        disabled={busy}
        className="w-full py-4 text-base"
        data-testid="login-submit"
      >
        <LogIn size={20} /> {busy ? "جارٍ الدخول…" : "تسجيل الدخول"}
      </Button>

      {/* الوصول إلى الحساب الجديد والاستعادة: نصّ صغير أسفل البطاقة فقط */}
      <div className="border-t border-slate-100 pt-4 text-center text-[11px] font-bold text-slate-500 dark:border-slate-700 dark:text-slate-300">
        {canRegister ? (
          <>
            <span>ليس لديك حساب؟ </span>
            <TextLink onClick={() => onGo("register")} testId="login-goto-register">
              إنشاء حساب جديد
            </TextLink>
            <span className="mx-2 text-slate-300 dark:text-slate-600">·</span>
          </>
        ) : null}
        <TextLink onClick={() => onGo("forgot")} testId="login-goto-forgot">
          نسيت كلمة المرور؟
        </TextLink>
      </div>
    </div>
  );
}

/* ------------------------------ إنشاء حساب ----------------------------- */

function RegisterForm({ onDone, onGo }: { onDone: () => void; onGo: (tab: Tab) => void }) {
  const { register } = useAuth();
  const [form, setForm] = useState({
    name: "",
    phone: "",
    password: "",
    confirmPassword: "",
  });
  const [accountType, setAccountType] = useState<AccountType>("user");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const set = (key: keyof typeof form, value: string) => setForm((f) => ({ ...f, [key]: value }));

  const submit = async () => {
    setError("");
    if (!form.name.trim()) return setError("اكتب اسمك.");
    if (!form.phone.trim()) return setError("اكتب رقم الهاتف.");
    if (form.password.length < 8) return setError("كلمة المرور 8 خانات على الأقل، وتحتوي حرفًا ورقمًا.");
    if (form.password !== form.confirmPassword) return setError("كلمتا المرور غير متطابقتين.");
    setBusy(true);
    try {
      await register({ ...form, accountType });
      onDone();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <ErrorBox message={error} />
      <div>
        <div className="mb-2 text-sm font-bold text-gray-700 dark:text-slate-200">نوع الحساب</div>
        <div className="grid grid-cols-2 gap-3">
          <TypeCard
            active={accountType === "user"}
            onClick={() => setAccountType("user")}
            icon={<UserRound size={20} />}
            title="مستخدم / مساهم"
            description="أطلب الربط بمضخة برقم تعريفها"
          />
          <TypeCard
            active={accountType === "manager"}
            onClick={() => setAccountType("manager")}
            icon={<ShieldCheck size={20} />}
            title="مسؤول مضخة"
            description="أنشئ مضخة وأدِرها ووافق على الطلبات"
          />
        </div>
      </div>

      <Field label="الاسم">
        <TextInput
          value={form.name}
          onChange={(e) => set("name", e.target.value)}
          placeholder="اسمك الكامل"
          aria-label="الاسم"
          data-testid="register-name"
        />
      </Field>
      <Field label="رقم الهاتف" hint="يُستخدم للدخول — لا يتكرر بين حسابين">
        <TextInput
          value={form.phone}
          onChange={(e) => set("phone", e.target.value)}
          placeholder="7xxxxxxxx"
          inputMode="tel"
          autoComplete="tel"
          aria-label="رقم الهاتف"
          data-testid="register-phone"
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="كلمة المرور">
          <TextInput
            type="password"
            value={form.password}
            onChange={(e) => set("password", e.target.value)}
            autoComplete="new-password"
            aria-label="كلمة المرور"
            data-testid="register-password"
          />
        </Field>
        <Field label="تأكيد كلمة المرور">
          <TextInput
            type="password"
            value={form.confirmPassword}
            onChange={(e) => set("confirmPassword", e.target.value)}
            autoComplete="new-password"
            aria-label="تأكيد كلمة المرور"
            data-testid="register-confirm"
          />
        </Field>
      </div>
      <p className="rounded-2xl bg-gray-50 px-4 py-3 text-[11px] leading-relaxed text-gray-500 dark:bg-slate-800 dark:text-slate-300">
        8 خانات على الأقل، وتحتوي حرفًا ورقمًا. تُخزَّن كلمة المرور مُشفَّرة ولا يمكن قراءتها — ولا يمكن
        استخراج كلمة المرور الأصلية حتى من إدارة النظام.
      </p>
      <Button
        onClick={submit}
        disabled={busy}
        className="w-full py-4 text-base"
        data-testid="register-submit"
      >
        <UserPlus size={20} /> {busy ? "جارٍ الإنشاء…" : "إنشاء الحساب"}
      </Button>
      {accountType === "user" ? (
        <p className="rounded-2xl bg-amber-50 px-4 py-3 text-[11px] leading-relaxed text-amber-800 dark:bg-amber-900/25 dark:text-amber-200">
          إنشاء الحساب لا يعني أنك مساهم في أي مضخة: بعد الدخول أدخل رقم تعريف المضخة (Pump Code) وأرسل
          طلب ربط، ثم يوافق المسؤول.
        </p>
      ) : null}

      <div className="border-t border-slate-100 pt-4 text-center text-[11px] font-bold text-slate-500 dark:border-slate-700 dark:text-slate-300">
        <span>لديك حساب؟ </span>
        <TextLink onClick={() => onGo("login")} testId="register-back-login">
          رجوع إلى تسجيل الدخول
        </TextLink>
      </div>
    </div>
  );
}

function TypeCard({
  active,
  onClick,
  icon,
  title,
  description,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={title}
      className={cx(
        "rounded-3xl border-2 p-3 text-right transition",
        active ? "border-emerald-500 bg-emerald-50 shadow-sm dark:bg-emerald-900/30" : "border-gray-200 bg-white dark:border-slate-600 dark:bg-slate-800"
      )}
    >
      <div
        className={cx(
          "mb-2 flex h-10 w-10 items-center justify-center rounded-2xl",
          active ? "bg-emerald-500 text-white" : "bg-gray-100 text-gray-500 dark:bg-slate-700 dark:text-slate-300"
        )}
      >
        {icon}
      </div>
      <div className={cx("text-sm font-extrabold", active ? "text-emerald-700 dark:text-emerald-300" : "text-gray-800 dark:text-slate-100")}>
        {title}
      </div>
      <div className="mt-0.5 text-[11px] text-gray-500 dark:text-slate-300">{description}</div>
    </button>
  );
}

/* --------------------------- نسيت كلمة المرور -------------------------- */

/**
 * الاستعادة صارت على خطوتين:
 *  1) طلب رمز: إن كان الحساب مربوطًا بتيليجرام يصل الرمز إلى محادثة تيليجرام ولا يُعرض على الشاشة.
 *     وإن لم يكن مربوطًا، يظهر الرمز هنا كما كان (مع تنبيه أن الربط أجدر).
 *  2) الرمز + كلمة المرور الجديدة: يُتحقّق من الرمز أولًا ثم تُستهلك «تذكرة» قصيرة لتعيين الكلمة.
 */
function ForgotForm({ onDone, onGo }: { onDone: (message: string) => void; onGo: (tab: Tab) => void }) {
  const { requestOtp, verifyOtp, resetPassword } = useAuth();
  const [step, setStep] = useState<"request" | "reset">("request");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [channel, setChannel] = useState<"telegram" | "screen">("screen");
  const [shownCode, setShownCode] = useState("");
  const [hint, setHint] = useState("");
  const [issue, setIssue] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sameNew, setSameNew] = useState(false);
  const [wait, setWait] = useState(0);

  useEffect(() => {
    if (wait <= 0) return;
    const timer = window.setInterval(() => setWait((v) => (v > 0 ? v - 1 : 0)), 1000);
    return () => window.clearInterval(timer);
  }, [wait]);

  const requestCode = async () => {
    setError("");
    if (!phone.trim()) return setError("اكتب رقم الهاتف المسجَّل في حسابك.");
    setBusy(true);
    try {
      const res = await requestOtp(phone.trim(), name.trim());
      setChannel(res.channel);
      setShownCode(res.code ?? "");
      setHint(res.hint ?? "");
      setIssue(res.warning ?? "");
      setCode(res.channel === "screen" && res.code ? res.code : "");
      setWait(60);
      setStep("reset");
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const doReset = async () => {
    setError("");
    if (!/^\d{6}$/.test(code.trim())) return setError("اكتب رمز التحقّق (6 أرقام).");
    if (newPassword.length < 8) return setError("كلمة المرور الجديدة 8 خانات على الأقل، حرف ورقم.");
    if (newPassword !== confirmPassword) return setError("كلمتا المرور غير متطابقتين.");
    setBusy(true);
    try {
      const verified = await verifyOtp(phone.trim(), code.trim());
      const message = await resetPassword({
        phone: phone.trim(),
        ticket: verified.ticket,
        newPassword,
        confirmPassword,
      });
      onDone(message);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <ErrorBox message={error} />
      <div className="flex items-center gap-2 rounded-2xl bg-sky-50 px-4 py-3 text-[11px] leading-relaxed text-sky-800 dark:bg-sky-900/30 dark:text-sky-200">
        <Send size={16} className="shrink-0" />
        {channel === "telegram" && step === "reset"
          ? "الرمز يصل إلى محادثتك في تيليجرام — لا يظهر على الشاشة."
          : "رمز التحقّق يُرسل إلى محادثتك في تيليجرام للحسابات المربوطة، وصلاحيته 5 دقائق. وإن لم يكن الحساب مربوطًا يظهر الرمز هنا مع تنبيه."}
      </div>

      <Field label="رقم الهاتف">
        <TextInput
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          inputMode="tel"
          placeholder="7xxxxxxxx"
          aria-label="رقم الهاتف للاستعادة"
          data-testid="forgot-phone"
        />
      </Field>
      <Field label="الاسم كما هو مسجَّل (يُطلب فقط إن لم يكن الحساب مربوطًا بتيليجرام)">
        <TextInput
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="الاسم المسجل"
          data-testid="forgot-name"
        />
      </Field>

      {step === "reset" ? (
        <>
          {channel === "telegram" ? (
            <div className="flex items-start gap-2 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-[11px] font-bold leading-relaxed text-sky-900 dark:border-sky-700 dark:bg-sky-900/30 dark:text-sky-100">
              <Send size={16} className="mt-0.5 shrink-0" />
              <span data-testid="otp-telegram-hint">
                {hint || "أرسلنا الرمز إلى محادثتك في تيليجرام."} صلاحية الرمز {5} دقائق.
              </span>
            </div>
          ) : (
            <div className="space-y-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-700/60 dark:bg-amber-900/25">
              <div className="text-[11px] font-bold text-amber-900">رمز التحقّق الخاص بك</div>
              <div className="text-center text-2xl font-black tracking-[0.4em] text-amber-900" data-testid="reset-code">
                {shownCode}
              </div>
              <p className="text-[10px] leading-relaxed text-amber-800">{issue}</p>
            </div>
          )}
          <Field label="رمز التحقّق">
            <TextInput
              value={code}
              onChange={(e) => setCode(e.target.value)}
              inputMode="numeric"
              aria-label="رمز التحقّق"
              data-testid="reset-code-input"
            />
          </Field>
          <button
            type="button"
            onClick={requestCode}
            disabled={busy || wait > 0}
            className="w-full rounded-2xl border border-slate-200 py-2 text-[11px] font-bold text-slate-600 disabled:opacity-50 dark:border-slate-600 dark:text-slate-300"
            data-testid="otp-resend"
          >
            {wait > 0 ? `إعادة الإرسال بعد ${wait} ثانية` : "أرسل رمزًا جديدًا"}
          </button>
          <div className="grid grid-cols-2 gap-3">
            <Field label="كلمة المرور الجديدة">
              <TextInput
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                aria-label="كلمة المرور الجديدة"
                data-testid="reset-new"
              />
            </Field>
            <Field label="تأكيد الجديدة">
              <TextInput
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                aria-label="تأكيد كلمة المرور الجديدة"
                data-testid="reset-confirm"
              />
            </Field>
          </div>
          <label className="flex items-center gap-2 text-[11px] font-bold text-gray-500 dark:text-slate-300">
            <input
              type="checkbox"
              checked={sameNew}
              onChange={(e) => setSameNew(e.target.checked)}
              className="h-4 w-4 accent-sky-600"
            />
            لا أستخدم كلمة المرور هذه في أي حساب آخر
          </label>
          <Button
            onClick={doReset}
            disabled={busy || !sameNew}
            className="w-full py-4"
            data-testid="reset-submit"
          >
            <KeyRound size={18} /> {busy ? "جارٍ التحقّق…" : "تحقّق وعيّن كلمة المرور"}
          </Button>
        </>
      ) : (
        <Button onClick={requestCode} disabled={busy} className="w-full py-4" data-testid="forgot-submit">
          <ArrowRight size={18} /> {busy ? "جارٍ الإرسال…" : "أرسل رمز التحقّق"}
        </Button>
      )}

      <div className="border-t border-slate-100 pt-4 text-center text-[11px] font-bold text-slate-500 dark:border-slate-700 dark:text-slate-300">
        <span>تذكّرت كلمة المرور؟ </span>
        <TextLink onClick={() => onGo("login")} testId="forgot-back-login">
          رجوع إلى تسجيل الدخول
        </TextLink>
      </div>
    </div>
  );
}
