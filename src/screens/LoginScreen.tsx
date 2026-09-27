import { useEffect, useState } from "react";
import {
  ArrowRight,
  Droplets,
  KeyRound,
  LogIn,
  ShieldCheck,
  Smartphone,
  UserPlus,
  UserRound,
} from "lucide-react";
import { useAuth } from "../auth/AuthProvider";
import type { AccountType } from "../auth/types";
import { ApiError } from "../auth/api";
import { Button, Field, TextInput, cx } from "../components/ui";

type Tab = "login" | "register" | "forgot";

interface PublicSettings {
  announcement: { active: boolean; tone: "info" | "warn" | "danger"; text: string };
  registration: { manager: boolean; user: boolean };
}

const errorText = (err: unknown) =>
  err instanceof ApiError ? err.message : "تعذّر تنفيذ العملية — حاول مرة أخرى.";

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

  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col px-4 py-8">
      <div className="mb-6 mt-2 text-center">
        <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-[2rem] bg-gradient-to-br from-emerald-500 to-emerald-700 text-white shadow-xl shadow-emerald-600/30">
          <Droplets size={38} />
        </div>
        <h1 className="text-3xl font-black text-gray-900">مشروع تنظيم المضخات</h1>
        <p className="mt-2 text-sm text-gray-500">
          حسابك الشخصي يحمي بياناتك — الدخول برقم الهاتف وكلمة المرور
        </p>
      </div>

      {announcement?.active && announcement.text.trim() ? (
        <div
          data-testid="login-announcement"
          className={`mb-4 rounded-2xl border px-4 py-3 text-[11px] font-bold leading-relaxed ${
            announcement.tone === "danger"
              ? "border-red-100 bg-red-50 text-red-800"
              : announcement.tone === "warn"
                ? "border-amber-100 bg-amber-50 text-amber-800"
                : "border-sky-100 bg-sky-50 text-sky-800"
          }`}
        >
          {announcement.text}
        </div>
      ) : null}

      {registrationClosed ? (
        <p className="mb-4 rounded-2xl bg-gray-100 px-4 py-3 text-center text-[11px] font-bold text-gray-600">
          إنشاء الحسابات متوقف حاليًا — تواصل مع مسؤول النظام.
        </p>
      ) : null}

      <div className="mb-5 grid grid-cols-3 gap-1 rounded-2xl bg-gray-100 p-1">
        <TabButton active={tab === "login"} onClick={() => setTab("login")} label="دخول" />
        <TabButton active={tab === "register"} onClick={() => setTab("register")} label="حساب جديد" />
        <TabButton active={tab === "forgot"} onClick={() => setTab("forgot")} label="نسيت كلمة المرور" />
      </div>

      {notice ? (
        <p
          className="mb-4 rounded-2xl bg-emerald-50 px-4 py-3 text-center text-xs font-bold text-emerald-800"
          data-testid="auth-notice"
        >
          {notice}
        </p>
      ) : null}

      {tab === "login" ? (
        <LoginForm
          onDone={() => setNotice("")}
          onForgot={() => {
            setNotice("");
            setTab("forgot");
          }}
          onRegister={() => {
            setNotice("");
            setTab("register");
          }}
        />
      ) : null}

      {tab === "register" ? (
        <RegisterForm
          onDone={() => {
            /* رد واضح بعد إنشاء الحساب: لا يبدو الزر كأنه لم يستجب */
            setNotice("تم إنشاء الحساب بنجاح — سجّل الدخول الآن برقم هاتفك وكلمة المرور.");
            setTab("login");
          }}
        />
      ) : null}

      {tab === "forgot" ? (
        <ForgotForm
          onDone={(message) => {
            setNotice(message);
            setTab("login");
          }}
        />
      ) : null}

      <div className="mt-auto pt-8 text-center text-xs text-gray-400">
        برمجة وتطوير: المهندس/ عبدالملك عامر
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cx(
        "rounded-xl py-2 text-[11px] font-extrabold transition",
        active ? "bg-white text-emerald-700 shadow-sm" : "text-gray-500 hover:text-gray-700"
      )}
    >
      {label}
    </button>
  );
}

function ErrorBox({ message }: { message: string }) {
  if (!message) return null;
  return (
    <p
      className="rounded-2xl bg-red-50 px-4 py-3 text-xs font-bold text-red-700"
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
  onForgot,
  onRegister,
}: {
  onDone: () => void;
  onForgot: () => void;
  onRegister: () => void;
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
      <div className="flex items-center justify-between text-xs font-bold">
        <button type="button" onClick={onRegister} className="text-emerald-700">
          إنشاء حساب جديد
        </button>
        <button type="button" onClick={onForgot} className="text-gray-500">
          نسيت كلمة المرور؟
        </button>
      </div>
      <p className="rounded-2xl bg-gray-50 px-4 py-3 text-[11px] leading-relaxed text-gray-500">
        الحساب خاص بصاحبه: لا يمكن الدخول إلى حساب شخص آخر. بعد الدخول تُطبَّق صلاحيات حسابك تلقائيًا.
      </p>
    </div>
  );
}

/* ------------------------------ إنشاء حساب ----------------------------- */

function RegisterForm({ onDone }: { onDone: () => void }) {
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
        <div className="mb-2 text-sm font-bold text-gray-700">نوع الحساب</div>
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
      <p className="rounded-2xl bg-gray-50 px-4 py-3 text-[11px] leading-relaxed text-gray-500">
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
        <p className="rounded-2xl bg-amber-50 px-4 py-3 text-[11px] leading-relaxed text-amber-800">
          إنشاء الحساب لا يعني أنك مساهم في أي مضخة: بعد الدخول أدخل رقم تعريف المضخة (Pump Code) وأرسل
          طلب ربط، ثم يوافق المسؤول.
        </p>
      ) : null}
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
        active ? "border-emerald-500 bg-emerald-50 shadow-sm" : "border-gray-200 bg-white"
      )}
    >
      <div
        className={cx(
          "mb-2 flex h-10 w-10 items-center justify-center rounded-2xl",
          active ? "bg-emerald-500 text-white" : "bg-gray-100 text-gray-500"
        )}
      >
        {icon}
      </div>
      <div className={cx("text-sm font-extrabold", active ? "text-emerald-700" : "text-gray-800")}>
        {title}
      </div>
      <div className="mt-0.5 text-[11px] text-gray-500">{description}</div>
    </button>
  );
}

/* --------------------------- نسيت كلمة المرور -------------------------- */

function ForgotForm({ onDone }: { onDone: (message: string) => void }) {
  const { forgotPassword, resetPassword } = useAuth();
  const [step, setStep] = useState<"request" | "reset">("request");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [issue, setIssue] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sameNew, setSameNew] = useState(false);

  const requestCode = async () => {
    setError("");
    if (!phone.trim() || !name.trim()) return setError("اكتب رقم الهاتف والاسم كما هما في حسابك.");
    setBusy(true);
    try {
      const res = await forgotPassword(phone.trim(), name.trim());
      setCode(res.code);
      setIssue(res.warning ?? "");
      setStep("reset");
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const doReset = async () => {
    setError("");
    if (!/^\d{6}$/.test(code.trim())) return setError("اكتب رمز الاستعادة (6 أرقام).");
    if (newPassword.length < 8) return setError("كلمة المرور الجديدة 8 خانات على الأقل، حرف ورقم.");
    if (newPassword !== confirmPassword) return setError("كلمتا المرور غير متطابقتين.");
    setBusy(true);
    try {
      const message = await resetPassword({
        phone: phone.trim(),
        code: code.trim(),
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
      <div className="flex items-center gap-2 rounded-2xl bg-sky-50 px-4 py-3 text-[11px] leading-relaxed text-sky-800">
        <Smartphone size={16} className="shrink-0" />
        الاستعادة تعتمد على رقم الهاتف والاسم المسجَّل، ويُلغى رمز الجلسة القديم بعد التعيين.
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
      <Field label="الاسم كما هو مسجَّل في الحساب">
        <TextInput
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="الاسم المسجل"
          data-testid="forgot-name"
        />
      </Field>

      {step === "reset" ? (
        <>
          <div className="space-y-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
            <div className="text-[11px] font-bold text-amber-900">رمز الاستعادة الخاص بك</div>
            <div className="text-center text-2xl font-black tracking-[0.4em] text-amber-900" data-testid="reset-code">
              {code}
            </div>
            <p className="text-[10px] leading-relaxed text-amber-800">{issue}</p>
          </div>
          <Field label="رمز الاستعادة">
            <TextInput
              value={code}
              onChange={(e) => setCode(e.target.value)}
              inputMode="numeric"
              aria-label="رمز الاستعادة"
              data-testid="reset-code-input"
            />
          </Field>
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
          <label className="flex items-center gap-2 text-[11px] font-bold text-gray-500">
            <input
              type="checkbox"
              checked={sameNew}
              onChange={(e) => setSameNew(e.target.checked)}
              className="h-4 w-4 accent-emerald-600"
            />
            لا أستخدم كلمة المرور هذه في أي حساب آخر
          </label>
          <Button
            onClick={doReset}
            disabled={busy || !sameNew}
            className="w-full py-4"
            data-testid="reset-submit"
          >
            <KeyRound size={18} /> تعيين كلمة المرور الجديدة
          </Button>
        </>
      ) : (
        <Button onClick={requestCode} disabled={busy} className="w-full py-4" data-testid="forgot-submit">
          <ArrowRight size={18} /> {busy ? "جارٍ التحقق…" : "تحقّق وأظهر رمز الاستعادة"}
        </Button>
      )}
    </div>
  );
}
