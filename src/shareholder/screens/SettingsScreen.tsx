import { useState } from "react";
import {
  Check,
  FileText,
  Globe,
  Info,
  LogOut,
  Save,
  ShieldCheck,
  UserRound,
  History,
} from "lucide-react";
import { useShareholder } from "../store";
import { tr } from "../i18n";
import type { ShareholderProfile } from "../types";
import { cx } from "../../components/ui";
import {
  Button,
  Card,
  Field,
  Pill,
  TextArea,
  TextInput,
} from "../../components/ui";
import { formatDateTime } from "../../format";
import { InstallAppCard } from "../../components/InstallApp";
import { AppearanceCard } from "../../components/AppearanceCard";
import { SyncSettingsCard } from "../SyncPanel";
import PushCard from "../PushCard";
import TelegramVerifyCard from "../../components/TelegramVerify";

export default function SettingsScreen({ onLogout }: { onLogout: () => void }) {
  const { state, actions } = useShareholder();
  const lang = state.settings.language;
  const t = (ar: string, en: string) => tr(lang, ar, en);

  const [profile, setProfile] = useState<ShareholderProfile>(state.profile);
  const [saved, setSaved] = useState(false);

  const saveProfile = () => {
    actions.setProfile({ ...profile, name: profile.name.trim() });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-black text-gray-900 dark:text-white">
          {t("الإعدادات", "Settings")}
        </h1>
      </div>

      {/* المزامنة مع المسؤول + التطبيق على الجوال + الإشعارات */}
      <SyncSettingsCard />
      <InstallAppCard />
      <PushCard />
      <TelegramVerifyCard />

      {/* الملف الشخصي */}
      <Card className="p-5">
        <SectionTitle
          icon={<UserRound size={18} />}
          title={t("الملف الشخصي", "Profile")}
          subtitle={t("معلوماتك الشخصية", "Your personal info")}
        />
        <div className="mt-4 space-y-4">
          <Field label={t("الاسم", "Name")}>
            <TextInput
              value={profile.name}
              onChange={(e) => setProfile({ ...profile, name: e.target.value })}
              placeholder={t("اسمك الكامل", "Your full name")}
            />
          </Field>
          <Field label={t("رقم الهاتف", "Phone")}>
            <TextInput
              dir="ltr"
              value={profile.phone}
              onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
              placeholder="7xxxxxxxx"
            />
          </Field>
          <Field label={t("المزرعة / المنطقة", "Farm / Area")}>
            <TextInput
              value={profile.farm}
              onChange={(e) => setProfile({ ...profile, farm: e.target.value })}
              placeholder={t("مثال: وادي الحمراء", "e.g. Wadi Al-Hamra")}
            />
          </Field>
          <Field label={t("ملاحظات", "Notes")}>
            <TextArea
              value={profile.notes}
              onChange={(e) => setProfile({ ...profile, notes: e.target.value })}
            />
          </Field>
          <Button onClick={saveProfile} className="w-full">
            {saved ? (
              <>
                <Check size={18} /> {t("تم الحفظ", "Saved")}
              </>
            ) : (
              <>
                <Save size={18} /> {t("حفظ الملف الشخصي", "Save profile")}
              </>
            )}
          </Button>
        </div>
      </Card>

      {/* المظهر والكتابة: الوضع · قوة الكتابة · لون التمييز · حجم الخط */}
      <AppearanceCard value={state.settings} onChange={actions.setAppearance} t={t} />

      {/* اللغة */}
      <Card className="p-5">
        <SectionTitle
          icon={<Globe size={18} />}
          title={t("اللغة", "Language")}
          subtitle={t("لغة واجهة التطبيق", "Interface language")}
        />
        <div className="mt-4 grid grid-cols-2 gap-3">
          <LangButton
            active={state.settings.language === "ar"}
            onClick={() => actions.setLanguage("ar")}
            title="العربية"
            subtitle={t("الافتراضية", "Default")}
          />
          <LangButton
            active={state.settings.language === "en"}
            onClick={() => actions.setLanguage("en")}
            title="English"
            subtitle={t("الإنجليزية", "English")}
          />
        </div>
        <p className="mt-3 text-xs text-gray-400 dark:text-slate-400">
          {t(
            "الواجهة الرئيسية عربية بالكامل؛ التبديل إلى الإنجليزية يترجم القوائم والإعدادات.",
            "The core interface is Arabic; switching to English translates menus and settings."
          )}
        </p>
      </Card>

      {/* حول + الشروط */}
      <Card className="p-5">
        <SectionTitle
          icon={<Info size={18} />}
          title={t("حول التطبيق", "About")}
          subtitle={t("معلومات عن المشروع", "Project info")}
        />
        <div className="mt-4 space-y-3 text-sm leading-relaxed text-gray-600 dark:text-slate-300">
          <p>
            {t(
              "مشروع تنظيم المضخات — نظام دفتر شخصي لإدارة حصص المياه الزراعية.",
              "Pump Organization Project — a personal ledger for managing agricultural water shares."
            )}
          </p>
          <p className="font-bold text-gray-800 dark:text-white">
            {t("برمجة وتطوير: ", "Developed by: ")}
            <a
              href="https://www.linkedin.com/in/abdulmalek-saleh-amer-70057226b"
              target="_blank"
              rel="noopener noreferrer"
              aria-label={t("صفحة المطوّر على LinkedIn", "Developer profile on LinkedIn")}
              data-testid="developer-linkedin"
              className="text-sky-700 underline decoration-sky-600/40 underline-offset-2 transition hover:text-sky-800 dark:text-sky-300"
            >
              {t("المهندس/ عبدالملك عامر", "Engineer Abdulmalik Amer")}
            </a>
          </p>
        </div>
      </Card>

      <Card className="p-5">
        <SectionTitle
          icon={<ShieldCheck size={18} />}
          title={t("الشروط وسياسة الخصوصية", "Terms & Privacy")}
        />
        <div className="mt-3 flex items-start gap-3 rounded-2xl bg-gray-50 p-4 text-sm leading-relaxed text-gray-600 dark:bg-slate-700/50 dark:text-slate-300">
          <FileText size={18} className="mt-0.5 shrink-0 text-sky-600 dark:text-sky-300" />
          <div className="space-y-2">
            <p>
              {t(
                "بيانات المضخات المرتبطة بحسابك محفوظة على الخادم الرسمي للمشروع (قاعدة بياناته) حتى يراك ما يسجّله المسؤول من أي جهاز — وأنت لا تعدّل شيئًا من سجله. سجلك الشخصي وملفك يبقيان على جهازك، ولا تُشارك بياناتك مع أي طرف ثالث.",
                "Data for the pumps linked to your account is stored on the project's official server so you see what the manager records from any device — you cannot change their records. Your personal ledger stays on your device, and your data is never shared with third parties."
              )}
            </p>
            <p>
              {t(
                "احرص على تصدير نسخة احتياطية من قسم الحسابات للحفاظ على بياناتك عند تغيير الجهاز أو مسح بيانات المتصفح.",
                "Make sure to export a backup from the Accounts section to keep your data safe when changing devices or clearing browser data."
              )}
            </p>
            <p>
              {t(
                "استخدام التطبيق يقتصر على تنظيم الحصص والدورات المائية، وتظل مسؤولية صحة الأرقام على المستخدم.",
                "The app is for organizing water shares and cycles; the user remains responsible for the accuracy of the figures."
              )}
            </p>
          </div>
        </div>
      </Card>

      {/* سجل التغييرات: كل تغيير يُسجَّل، والحذف ناعم (لا يُحذف أي سجل) */}
      <Card className="p-5">
        <SectionTitle
          icon={<History size={18} />}
          title={t("سجل التغييرات", "Change log")}
          subtitle={t("كل إضافة أو تعديل أو إزالة تُسجَّل هنا", "Every add, edit and removal is recorded")}
        />
        {state.history.length === 0 ? (
          <p className="mt-3 text-xs text-gray-400 dark:text-slate-400">
            {t("لا توجد تغييرات مسجّلة بعد.", "No changes recorded yet.")}
          </p>
        ) : (
          <div className="mt-3 max-h-80 space-y-1.5 overflow-y-auto" data-testid="user-history">
            {state.history.slice(0, 60).map((h) => (
              <div
                key={h.id}
                className="rounded-2xl bg-gray-50 px-3 py-2 dark:bg-slate-700"
              >
                <div className="flex items-start gap-2">
                  <Pill
                    tone={
                      h.kind === "archive"
                        ? "amber"
                        : h.kind === "create"
                          ? "green"
                          : h.kind === "data"
                            ? "blue"
                            : "gray"
                    }
                  >
                    {h.kind === "archive"
                      ? t("إزالة", "Removed")
                      : h.kind === "create"
                        ? t("إضافة", "Added")
                        : h.kind === "data"
                          ? t("بيانات", "Data")
                          : h.kind === "settings"
                            ? t("إعداد", "Setting")
                            : t("تعديل", "Edit")}
                  </Pill>
                  <span className="flex-1 text-[11px] font-bold leading-relaxed text-gray-700 dark:text-slate-200">
                    {h.text}
                  </span>
                </div>
                <div className="mt-1 text-[10px] text-gray-400">{formatDateTime(h.at)}</div>
              </div>
            ))}
          </div>
        )}
        <p className="mt-3 rounded-2xl bg-emerald-50 px-3 py-2 text-[10px] leading-relaxed text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300">
          {t(
            "الحذف هنا ناعم: السجل يبقى محفوظًا مع سبب الإزالة ووقته ولا يُحذف نهائيًا.",
            "Deletion here is soft: records stay stored with the reason and time."
          )}
        </p>
      </Card>

      {/* الخروج */}
      <Card className="p-5">
        <Button variant="danger" className="w-full" onClick={onLogout}>
          <LogOut size={18} /> {t("تسجيل الخروج", "Log out")}
        </Button>
        <p className="mt-3 text-center text-xs text-gray-400 dark:text-slate-400">
          {t(
            "بياناتك تبقى محفوظة على جهازك بعد الخروج.",
            "Your data stays saved on your device after logging out."
          )}
        </p>
      </Card>
    </div>
  );
}

function SectionTitle({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
        {icon}
      </div>
      <div>
        <div className="font-extrabold text-gray-900 dark:text-white">{title}</div>
        {subtitle ? (
          <div className="text-xs text-gray-400 dark:text-slate-400">{subtitle}</div>
        ) : null}
      </div>
    </div>
  );
}

function LangButton({
  active,
  onClick,
  title,
  subtitle,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  subtitle: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cx(
        "flex flex-col items-center gap-1 rounded-2xl border-2 p-4 transition",
        active
          ? "border-emerald-500 bg-emerald-50 dark:border-emerald-500 dark:bg-emerald-900/30"
          : "border-gray-200 bg-white hover:border-emerald-200 dark:border-slate-600 dark:bg-slate-800"
      )}
    >
      <span className={cx("text-base font-black", active ? "text-emerald-700 dark:text-emerald-300" : "text-gray-700 dark:text-slate-200")}>
        {title}
      </span>
      <span className="text-xs text-gray-400 dark:text-slate-400">{subtitle}</span>
    </button>
  );
}
