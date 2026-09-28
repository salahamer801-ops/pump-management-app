import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  Info,
  RefreshCw,
  Save,
  Send,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  UserRoundCheck,
  UserRoundX,
} from "lucide-react";
import type { SystemSettings } from "../../auth/types";
import { adminApi, type TelegramAdminStatus } from "../adminApi";
import { useAuth } from "../../auth/AuthProvider";
import { Button, Card, Field, Pill, Select, TextArea, cx } from "../../components/ui";
import { ErrorNote, Loading, ScreenHead, SectionCard } from "../ui";

export default function AdminSettingsScreen() {
  const { refresh } = useAuth();
  const [settings, setSettings] = useState<SystemSettings | null>(null);
  const [admins, setAdmins] = useState<{ id: string; name: string; accountType: string; phoneMasked: string }[]>(
    []
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");
  const [tg, setTg] = useState<TelegramAdminStatus | null>(null);
  const [tgBusy, setTgBusy] = useState("");
  const [tgNote, setTgNote] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await adminApi.settings();
      setSettings(res.settings);
      setAdmins(res.admins);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذّر تحميل الإعدادات.");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadTelegram = useCallback(async () => {
    try {
      setTg(await adminApi.telegramStatus());
    } catch {
      setTg(null);
    }
  }, []);

  useEffect(() => {
    void load();
    void loadTelegram();
  }, [load, loadTelegram]);

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    setError("");
    setSaved("");
    try {
      const res = await adminApi.updateSettings(settings);
      setSettings(res.settings);
      /* تحديث جلسة اللوحة: الإعلان يظهر/يختفي فورًا بلا إعادة تحميل */
      await refresh().catch(() => undefined);
      setSaved("تم حفظ الإعدادات — تسري فورًا على كل المستخدمين.");
      setTimeout(() => setSaved(""), 3500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذّر حفظ الإعدادات.");
    } finally {
      setSaving(false);
    }
  };

  const setLocal = (patch: Partial<SystemSettings>) =>
    setSettings((prev) => (prev ? { ...prev, ...patch } : prev));

  if (loading || !settings) return <Loading label="جارٍ تحميل الإعدادات…" />;

  const toneTone =
    settings.announcement.tone === "danger" ? "red" : settings.announcement.tone === "warn" ? "amber" : "blue";

  return (
    <div className="space-y-4">
      <ScreenHead
        icon={<Settings2 size={20} />}
        title="إعدادات النظام"
        subtitle="إعلان عام لكل المستخدمين، وفتح أو إغلاق إنشاء الحسابات"
        onRefresh={() => void load()}
        actions={
          <Button onClick={() => void save()} disabled={saving} data-testid="admin-settings-save">
            <Save size={15} /> {saving ? "جارٍ الحفظ…" : "حفظ الإعدادات"}
          </Button>
        }
      />
      <ErrorNote message={error} />
      {saved ? (
        <div
          className="rounded-2xl bg-emerald-50 px-3 py-2.5 text-[11px] font-bold text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-200"
          data-testid="admin-settings-saved"
        >
          {saved}
        </div>
      ) : null}

      {/* الإعلان العام */}
      <SectionCard title="إعلان عام للمستخدمين" hint="يظهر في أعلى التطبيق" actions={<Bell size={15} className="text-sky-600 dark:text-sky-300" />}>
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="الحالة">
              <Select
                value={settings.announcement.active ? "on" : "off"}
                onChange={(e) =>
                  setLocal({
                    announcement: { ...settings.announcement, active: e.target.value === "on" },
                  })
                }
                aria-label="تفعيل الإعلان"
                data-testid="admin-announcement-active"
              >
                <option value="off">مُطفأ</option>
                <option value="on">مُفعّل</option>
              </Select>
            </Field>
            <Field label="اللون / الأهمية">
              <Select
                value={settings.announcement.tone}
                onChange={(e) =>
                  setLocal({
                    announcement: {
                      ...settings.announcement,
                      tone: e.target.value as SystemSettings["announcement"]["tone"],
                    },
                  })
                }
                aria-label="أهمية الإعلان"
                data-testid="admin-announcement-tone"
              >
                <option value="info">معلومة</option>
                <option value="warn">تنبيه</option>
                <option value="danger">هام</option>
              </Select>
            </Field>
            <div className="flex items-end">
              <Pill tone={toneTone}>
                <Info size={11} /> معاينة اللون
              </Pill>
            </div>
          </div>
          <Field label="نص الإعلان (حتى ٣٠٠ حرف)">
            <TextArea
              value={settings.announcement.text}
              onChange={(e) =>
                setLocal({ announcement: { ...settings.announcement, text: e.target.value } })
              }
              placeholder="مثال: صيانة مجدولة للمضخة يوم الخميس — التنظيم يبدأ ٦ صباحًا."
              data-testid="admin-announcement-text"
            />
          </Field>
          {settings.announcement.active && settings.announcement.text.trim() ? (
            <div
              className={cx(
                "rounded-2xl border px-3 py-2.5 text-[11px] font-bold",
                settings.announcement.tone === "danger"
                  ? "border-red-100 bg-red-50 text-red-800"
                  : settings.announcement.tone === "warn"
                    ? "border-amber-100 bg-amber-50 text-amber-800"
                    : "border-sky-100 bg-sky-50 text-sky-800"
              )}
            >
              معاينة: {settings.announcement.text}
            </div>
          ) : null}
        </div>
      </SectionCard>

      {/* التسجيل */}
      <SectionCard title="إنشاء الحسابات" hint="شاشة الدخول" actions={<UserRoundCheck size={15} className="text-sky-600 dark:text-sky-300" />}>
        <div className="grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() =>
              setLocal({
                registration: { ...settings.registration, manager: !settings.registration.manager },
              })
            }
            aria-pressed={settings.registration.manager}
            data-testid="admin-reg-manager"
            className={cx(
              "flex items-center gap-3 rounded-2xl border-2 px-4 py-3 text-right transition",
              settings.registration.manager
                ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20"
                : "border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-800"
            )}
          >
            <span
              className={cx(
                "flex h-10 w-10 items-center justify-center rounded-2xl",
                settings.registration.manager ? "bg-emerald-500 text-white" : "bg-gray-100 text-gray-500"
              )}
            >
              {settings.registration.manager ? <UserRoundCheck size={18} /> : <UserRoundX size={18} />}
            </span>
            <span className="flex-1">
              <span className="block text-[12px] font-extrabold text-gray-800 dark:text-white">
                حساب مسؤول مضخة
              </span>
              <span className="block text-[10px] text-gray-400">
                {settings.registration.manager ? "مفتوح" : "مغلق"} — يمكن للمسؤولين الجدد التسجيل
              </span>
            </span>
          </button>

          <button
            type="button"
            onClick={() =>
              setLocal({ registration: { ...settings.registration, user: !settings.registration.user } })
            }
            aria-pressed={settings.registration.user}
            data-testid="admin-reg-user"
            className={cx(
              "flex items-center gap-3 rounded-2xl border-2 px-4 py-3 text-right transition",
              settings.registration.user
                ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20"
                : "border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-800"
            )}
          >
            <span
              className={cx(
                "flex h-10 w-10 items-center justify-center rounded-2xl",
                settings.registration.user ? "bg-emerald-500 text-white" : "bg-gray-100 text-gray-500"
              )}
            >
              {settings.registration.user ? <UserRoundCheck size={18} /> : <UserRoundX size={18} />}
            </span>
            <span className="flex-1">
              <span className="block text-[12px] font-extrabold text-gray-800 dark:text-white">
                حساب مستخدم / مساهم
              </span>
              <span className="block text-[10px] text-gray-400">
                {settings.registration.user ? "مفتوح" : "مغلق"} — إغلاقه يمنع التسجيل الجديد فقط
              </span>
            </span>
          </button>
        </div>
        <p className="mt-3 text-[10px] leading-relaxed text-gray-400 dark:text-slate-400">
          إغلاق التسجيل لا يمسّ الحسابات القائمة: لا تعطيل ولا حذف — الدخول يبقى كما هو.
        </p>
      </SectionCard>

      {/* التحقّق من الأرقام عبر تيليجرام — مجاني بالكامل */}
      <SectionCard
        title="التحقّق من الأرقام (تيليجرام — مجاني)"
        hint={tg?.status?.configured ? `@${tg.status.username}` : "غير مُهيّأ"}
        actions={<Send size={15} className="text-sky-600 dark:text-sky-300" />}
      >
        <div className="space-y-3" data-testid="admin-telegram">
          {tgNote ? (
            <div className="rounded-2xl bg-sky-50 px-3 py-2 text-[11px] font-bold text-sky-800 dark:bg-sky-900/20 dark:text-sky-200" data-testid="admin-telegram-note">
              {tgNote}
            </div>
          ) : null}

          {!tg?.status?.configured ? (
            <div className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-[11px] leading-relaxed text-amber-900 dark:border-amber-700/40 dark:bg-amber-900/20 dark:text-amber-100">
              <ShieldAlert size={15} className="mt-0.5 shrink-0" />
              <span>
                <b>التحقّق غير مُهيّأ بعد — ولا يكلّف أي مبلغ.</b> للتفعيل: افتح تيليجرام →{" "}
                <span className="font-mono">@BotFather</span> → أرسل <span className="font-mono">/newbot</span> →
                انسخ التوكن → أضفه في <b>إعدادات المشروع → الأسرار</b> باسم{" "}
                <span className="font-mono">TELEGRAM_BOT_TOKEN</span>. بعدها أعد النشر واضغط «إعادة تثبيت الاتصال».
                وحتى ذلك الحين يعمل رمز الاستعادة بالطريقة الحالية (يظهر على الشاشة).
              </span>
            </div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              <div className="rounded-2xl bg-emerald-50 px-3 py-2 text-[11px] font-bold text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-200">
                <CheckCircle2 size={13} className="inline" /> البوت: <span className="font-mono">@{tg.status.username}</span>
              </div>
              <div className="rounded-2xl bg-gray-50 px-3 py-2 text-[11px] text-gray-600 dark:bg-slate-700/60 dark:text-slate-200">
                الاتصال بالخادم: {tg.status.webhook ? "مُثبّت ✓" : "غير مُثبّت"}
                {tg.status.webhookError ? ` — آخر خطأ: ${tg.status.webhookError}` : ""}
              </div>
              {tg.status.otherSite && (
                <div className="rounded-2xl bg-amber-50 px-3 py-2 text-[11px] font-bold text-amber-800 sm:col-span-2 dark:bg-amber-900/20 dark:text-amber-200">
                  <AlertTriangle size={13} className="inline" /> الاتصال مثبَّت على عنوان آخر (بيئة معاينة أو نطاق قديم) —
                  اضغط «إعادة تثبيت الاتصال» لربطه بهذا الموقع، وإلا توقّف البوت عن الرد عند إغلاق تلك البيئة.
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { label: "رسائل اليوم", value: tg?.counts?.day_count ?? 0 },
              { label: "هذا الشهر", value: tg?.counts?.month_count ?? 0 },
              { label: "حسابات مربوطة", value: tg?.counts?.linked_users ?? 0 },
              { label: "أرقام مُتحقَّقة", value: tg?.counts?.verified_users ?? 0 },
            ].map((item) => (
              <div key={item.label} className="rounded-2xl bg-gray-50 px-3 py-2 dark:bg-slate-700/60">
                <div className="text-[10px] text-gray-400 dark:text-slate-400">{item.label}</div>
                <div className="text-sm font-black text-gray-800 dark:text-white">{item.value}</div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              variant="ghost"
              onClick={async () => {
                setTgBusy("test");
                setTgNote("");
                try {
                  await adminApi.telegramTest();
                  setTgNote("أُرسلت رسالة تجريبية إلى محادثة تيليجرام المرتبطة بحسابك.");
                } catch (err) {
                  setTgNote(err instanceof Error ? err.message : "تعذّر الإرسال.");
                } finally {
                  setTgBusy("");
                }
              }}
              disabled={!tg?.status?.configured || tgBusy === "test"}
              data-testid="admin-telegram-test"
            >
              <Send size={15} /> {tgBusy === "test" ? "جارٍ الإرسال…" : "أرسل رسالة تجريبية إليّ"}
            </Button>
            <Button
              variant="ghost"
              onClick={async () => {
                setTgBusy("hook");
                setTgNote("");
                try {
                  const res = await adminApi.telegramWebhook();
                  setTgNote(`تم تثبيت الاتصال على ${res.url}`);
                  await loadTelegram();
                } catch (err) {
                  setTgNote(err instanceof Error ? err.message : "تعذّر تثبيت الاتصال.");
                } finally {
                  setTgBusy("");
                }
              }}
              disabled={!tg?.status?.configured || tgBusy === "hook"}
              data-testid="admin-telegram-webhook"
            >
              <RefreshCw size={15} /> {tgBusy === "hook" ? "جارٍ التثبيت…" : "إعادة تثبيت الاتصال"}
            </Button>
            <Button variant="ghost" onClick={() => void loadTelegram()} data-testid="admin-telegram-refresh">
              <RefreshCw size={15} /> تحديث الحالة
            </Button>
          </div>

          <div className="grid gap-2 sm:grid-cols-2">
            {[
              {
                key: "otpOnTelegram" as const,
                title: "أرسل رمز الاستعادة على تيليجرام",
                hint: "للحسابات المربوطة فقط — ولا يظهر الرمز على الشاشة حينها",
              },
              {
                key: "requireVerified" as const,
                title: "لا تُقبل الاستعادة إلا لحساب مُتحقَّق",
                hint: "تشديد اختياري: يمنع الاستعادة لأي حساب لم يُتحقّق من رقمه",
              },
              {
                key: "promptUnverified" as const,
                title: "نبّه المستخدمين غير المُتحقَّقين",
                hint: "شريط داخل التطبيق يدعوه للتحقّق (مجانًا) — يمكنه إخفاؤه",
              },
            ].map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() =>
                  setLocal({
                    verification: {
                      ...settings.verification,
                      [item.key]: !settings.verification[item.key],
                    },
                  })
                }
                aria-pressed={Boolean(settings.verification[item.key])}
                data-testid={`admin-verify-${item.key}`}
                className={cx(
                  "rounded-2xl border-2 px-3 py-2 text-right transition",
                  settings.verification[item.key]
                    ? "border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20"
                    : "border-gray-200 bg-white dark:border-slate-700 dark:bg-slate-800"
                )}
              >
                <span className="block text-[12px] font-extrabold text-gray-800 dark:text-white">
                  {item.title}
                </span>
                <span className="block text-[10px] text-gray-400 dark:text-slate-400">{item.hint}</span>
              </button>
            ))}
            <Field label="سقف الرموز في اليوم (0 = بلا سقف)">
              <input
                type="number"
                min={0}
                max={2000}
                value={settings.verification.dailyLimit}
                onChange={(e) =>
                  setLocal({
                    verification: { ...settings.verification, dailyLimit: Number(e.target.value) || 0 },
                  })
                }
                className="w-full rounded-2xl border border-gray-200 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800 dark:text-white"
                aria-label="سقف الرموز اليومي"
                data-testid="admin-verify-limit"
              />
            </Field>
          </div>

          {tg?.recent?.length ? (
            <div className="overflow-hidden rounded-2xl border border-gray-100 dark:border-slate-700">
              <table className="w-full text-right text-[11px]">
                <thead className="bg-gray-50 text-gray-500 dark:bg-slate-700/60 dark:text-slate-300">
                  <tr>
                    <th className="px-2 py-1.5">الرقم</th>
                    <th className="px-2 py-1.5">القناة</th>
                    <th className="px-2 py-1.5">الحالة</th>
                    <th className="px-2 py-1.5">الوقت</th>
                  </tr>
                </thead>
                <tbody data-testid="admin-telegram-recent">
                  {tg.recent.slice(0, 10).map((row) => (
                    <tr key={row.id} className="border-t border-gray-100 dark:border-slate-700">
                      <td className="px-2 py-1.5 font-mono" dir="ltr">{row.phoneMasked}</td>
                      <td className="px-2 py-1.5">{row.channel === "telegram" ? "تيليجرام" : "الشاشة"}</td>
                      <td className="px-2 py-1.5">{row.status}</td>
                      <td className="px-2 py-1.5 text-gray-400">
                        {new Date(row.createdAt).toLocaleString("ar-EG", { hour12: false })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          <p className="text-[10px] leading-relaxed text-gray-400 dark:text-slate-400">
            تيليجرام مجاني بالكامل: لا مزوّد مدفوع ولا رسم على أي رسالة. الرقم يُتحقَّق منه بزر «شارك رقمي» —
            وتيليجرام نفسه هو من يؤكّد الرقم. الرموز تُخزَّن مُشفَّرة، صلاحيتها 5 دقائق، وتُستهلك مرة واحدة.
          </p>
        </div>
      </SectionCard>

      {/* مسؤولو النظام */}
      <SectionCard title="مسؤولو النظام" hint={`${admins.length}`} actions={<ShieldCheck size={15} className="text-sky-600 dark:text-sky-300" />}>
        <div className="space-y-2" data-testid="admin-admins-list">
          {admins.map((a) => (
            <div
              key={a.id}
              className="flex flex-wrap items-center gap-2 rounded-2xl bg-gray-50 px-3 py-2 dark:bg-slate-700/60"
            >
              <span className="text-[12px] font-extrabold text-gray-800 dark:text-slate-100">{a.name}</span>
              <Pill tone="amber">مسؤول النظام</Pill>
              <span className="font-mono text-[10px] text-gray-400">{a.phoneMasked}</span>
              <span className="text-[10px] text-gray-400">
                {a.accountType === "manager" ? "حساب مسؤول مضخة" : "حساب مستخدم"}
              </span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-[10px] leading-relaxed text-gray-400 dark:text-slate-400">
          أول حساب «مسؤول مضخة» في النظام يصبح مسؤول نظام تلقائيًا. تعيين أو إزالة الصلاحية لبقية الحسابات
          من تبويب «المستخدمون»، ويبقى مسؤول واحد على الأقل دائمًا.
        </p>
      </SectionCard>

      <Card className="p-4">
        <Button className="w-full" onClick={() => void save()} disabled={saving} data-testid="admin-settings-save-bottom">
          <Save size={16} /> {saving ? "جارٍ الحفظ…" : "حفظ الإعدادات"}
        </Button>
      </Card>
    </div>
  );
}
