import { useCallback, useEffect, useState } from "react";
import { Bell, Info, Save, Settings2, ShieldCheck, UserRoundCheck, UserRoundX } from "lucide-react";
import type { SystemSettings } from "../../auth/types";
import { adminApi } from "../adminApi";
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

  useEffect(() => {
    void load();
  }, [load]);

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
      <SectionCard title="إعلان عام للمستخدمين" hint="يظهر في أعلى التطبيق" actions={<Bell size={15} className="text-emerald-600" />}>
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
      <SectionCard title="إنشاء الحسابات" hint="شاشة الدخول" actions={<UserRoundCheck size={15} className="text-emerald-600" />}>
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

      {/* مسؤولو النظام */}
      <SectionCard title="مسؤولو النظام" hint={`${admins.length}`} actions={<ShieldCheck size={15} className="text-emerald-600" />}>
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
