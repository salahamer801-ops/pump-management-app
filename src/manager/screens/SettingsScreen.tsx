import { useRef, useState } from "react";
import {
  CloudOff,
  Database,
  Download,
  Droplets,
  Info,
  KeyRound,
  RefreshCcw,
  Save,
  Pencil,
  Linkedin,
  SlidersHorizontal,
  Trash2,
  Upload,
  Wifi,
} from "lucide-react";
import { useApp } from "../../store";
import type { AppState, Currency, EnergyType } from "../../domain/types";
import { normalizeState } from "../../domain/migrate";
import {formatClock, formatTimeRange, todayISO} from "../../domain/util";
import { Button, Card, Field, Modal, NumberInput, Pill, Select, TextArea, TextInput, TimeInput, cx } from "../../components/ui";
import { InstallAppCard } from "../../components/InstallApp";
import { AppearanceCard } from "../../components/AppearanceCard";
import TelegramVerifyCard from "../../components/TelegramVerify";
import { BRAND_NAME, BrandLogo } from "../../components/Brand";

const currencyLabel = (c: Currency) => (c === "YER" ? "ريال يمني" : c === "SAR" ? "ريال سعودي" : "دولار");

export default function SettingsScreen({
  onLogout,
  onSwitchPump,
}: {
  onLogout: () => void;
  /** مفتاح المضخات: تبديل مضخة أو إنشاء أخرى — من هنا فقط، بزر صغير */
  onSwitchPump?: () => void;
}) {
  const { state, actions, syncState } = useApp();
  const pump = state.pump!;
  const fileRef = useRef<HTMLInputElement>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [message, setMessage] = useState("");

  const [draft, setDraft] = useState(pump);
  /** إعدادات المضخة تُفتح في نافذة منبثقة بدلًا من بطاقة في الصفحة */
  const [pumpOpen, setPumpOpen] = useState(false);
  const set = <K extends keyof typeof draft>(key: K, value: (typeof draft)[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const openPumpSettings = () => {
    setDraft(pump);
    setPumpOpen(true);
  };

  const pending = state.syncQueue.filter((s) => s.status === "pending").length;

  const exportData = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pump-backup-${todayISO()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setMessage("تم تنزيل نسخة احتياطية من كل البيانات.");
  };

  const importData = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as AppState;
      if (!parsed || typeof parsed !== "object") throw new Error("bad");
      /* الاستيراد لا يحذف شيئًا: يُرقّى الملف إلى الإصدار الحالي إن كان أقدم */
      actions.importState(normalizeState({ ...parsed }));
      setMessage("تم استيراد البيانات بنجاح مع الحفاظ على السجلات القديمة.");
    } catch {
      setMessage("تعذّر قراءة الملف — تأكد أنه ملف نسخة احتياطية صحيح.");
    }
  };

  return (
    <div className="space-y-4">
      {/* هوية التطبيق وحالة الحفظ على الخادم — مختصرة كما في الإعدادات المعتادة */}
      <Card className="space-y-3 p-4" data-testid="app-identity">
        <div className="flex items-center gap-3">
          <BrandLogo size={54} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-black text-gray-900 dark:text-white">{BRAND_NAME}</div>
            <div className="mt-0.5 truncate text-[11px] text-gray-400">
              {pump.name}
              {pump.pumpCode ? (
                <>
                  {" · "}
                  <span className="font-mono font-bold text-sky-600 dark:text-sky-400">
                    {pump.pumpCode}
                  </span>
                </>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 rounded-2xl bg-gray-50 px-3 py-2 dark:bg-slate-700">
          <span className="text-[11px] text-gray-400">حالة الحفظ على الخادم</span>
          <span
            data-testid="settings-sync-status"
            className={cx(
              "inline-flex items-center gap-1.5 text-[11px] font-extrabold",
              syncState === "synced"
                ? "text-emerald-700 dark:text-emerald-400"
                : syncState === "connecting"
                  ? "text-gray-500 dark:text-slate-300"
                  : "text-amber-600 dark:text-amber-400"
            )}
          >
            <span
              className={cx(
                "h-2 w-2 rounded-full",
                syncState === "synced"
                  ? "bg-emerald-500"
                  : syncState === "connecting"
                    ? "animate-pulse bg-gray-400"
                    : "bg-amber-500"
              )}
            />
            {syncState === "synced"
              ? "محفوظ على الخادم"
              : syncState === "connecting"
                ? "جارٍ الحفظ…"
                : syncState === "offline"
                  ? "لا يوجد اتصال بالإنترنت"
                  : "على هذا الجهاز فقط"}
          </span>

          {onSwitchPump ? (
            /* مفتاح صغير: تبديل المضخة أو إنشاء مضخة أخرى — مكانه الإعدادات فقط */
            <button
              type="button"
              onClick={onSwitchPump}
              title="مفتاح المضخات: تبديل مضخة أو إنشاء أخرى"
              aria-label="مفتاح المضخات — تبديل أو إنشاء مضخة أخرى"
              data-testid="pump-key"
              className="flex shrink-0 items-center gap-1 rounded-xl border border-gray-200 bg-white px-2 py-1 text-[10px] font-bold text-gray-500 transition hover:border-brand-300 hover:text-brand-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-sky-700 dark:hover:text-sky-300"
            >
              <KeyRound size={12} />
              مضخة أخرى
            </button>
          ) : null}
        </div>
      </Card>
      {/* التطبيق على جوال المسؤول — أيقونة على الشاشة الرئيسية بلا متجر تطبيقات */}
      <InstallAppCard />
      <TelegramVerifyCard />
      <Card className="space-y-3 p-4">
        <div className="flex items-center gap-2">
          <Droplets size={16} className="text-sky-600 dark:text-sky-300" />
          <h2 className="text-sm font-extrabold text-gray-800 dark:text-white">إعدادات المضخة</h2>
          <button
            className="mr-auto flex items-center gap-1 rounded-xl px-2 py-1 text-[11px] font-bold text-emerald-700 hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-900/20"
            onClick={openPumpSettings}
            data-testid="open-pump-settings"
          >
            <Pencil size={12} /> تعديل
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2 text-center text-[10px] font-bold sm:grid-cols-4">
          <div className="rounded-2xl bg-gray-50 px-2 py-2 dark:bg-slate-700">
            <div className="text-gray-400">اسم المضخة</div>
            <div className="truncate text-xs text-gray-800 dark:text-white">{pump.name || "—"}</div>
          </div>
          <div className="rounded-2xl bg-gray-50 px-2 py-2 dark:bg-slate-700">
            <div className="text-gray-400">البئر / المزرعة</div>
            <div className="truncate text-xs text-gray-800 dark:text-white">
              {pump.wells || "—"}{pump.farm ? ` · ${pump.farm}` : ""}
            </div>
          </div>
          <div className="rounded-2xl bg-gray-50 px-2 py-2 dark:bg-slate-700">
            <div className="text-gray-400">ساعات التشغيل</div>
            <div className="text-xs text-gray-800 dark:text-white">
              {formatTimeRange(pump.workStart, pump.workEnd)}
            </div>
          </div>
          <div className="rounded-2xl bg-gray-50 px-2 py-2 dark:bg-slate-700">
            <div className="text-gray-400">سعر اللتر / العملة</div>
            <div className="text-xs text-gray-800 dark:text-white">
              {pump.fuelPrice} · {currencyLabel(pump.currency)}
            </div>
          </div>
        </div>
        <p className="rounded-2xl bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
          التعديل يطبَّق على العمليات الجديدة فقط — العمليات القديمة تحتفظ بقيمها وقت تسجيلها (Snapshot).
        </p>
        <Button variant="secondary" className="w-full" onClick={openPumpSettings} data-testid="open-pump-settings-btn">
          <SlidersHorizontal size={16} /> فتح إعدادات المضخة
        </Button>
      </Card>

      {/* المظهر والكتابة: الوضع · قوة الكتابة · لون التمييز · حجم الخط */}
      <AppearanceCard value={state.settings} onChange={actions.setAppearance} />

      <Card className="space-y-3 p-4">
        <div className="flex items-center gap-2">
          <Wifi size={16} className="text-sky-600 dark:text-sky-300" />
          <h2 className="text-sm font-extrabold text-gray-800 dark:text-white">العمل بدون إنترنت والمزامنة</h2>
          <Pill tone={pending > 0 ? "amber" : "green"}>
            <CloudOff size={11} /> {pending} تغيير بانتظار المزامنة
          </Pill>
        </div>
        <div className="rounded-2xl bg-gray-50 px-3 py-3 text-[11px] dark:bg-slate-700">
          <div className="flex justify-between">
            <span className="text-gray-400">معرّف الجهاز</span>
            <span className="font-bold text-gray-700 dark:text-slate-200">{state.settings.deviceId}</span>
          </div>
          <div className="mt-1 flex justify-between">
            <span className="text-gray-400">آخر مزامنة</span>
            <span className="font-bold text-gray-700 dark:text-slate-200">
              {state.settings.lastSyncAt ? formatClock(state.settings.lastSyncAt) : "لم تحدث بعد"}
            </span>
          </div>
        </div>
        <p className="rounded-2xl bg-sky-50 px-3 py-2 text-[11px] leading-relaxed text-sky-700 dark:bg-sky-900/30 dark:text-sky-300">
          كل تعديل يُحفظ على الجهاز فورًا ويُرفع إلى الخادم خلال ثوانٍ، وتبقى بيانات مضخاتك جاهزة على أي جهاز تدخل
          منه بحسابك. وإن انقطع الإنترنت يعمل التطبيق كما هو وتُرفع التعديلات عند عودة الاتصال.
        </p>
        <Button variant="outline" className="w-full" onClick={() => actions.markSynced()}>
          <RefreshCcw size={16} /> تعليم كل التغييرات كمُزامنة
        </Button>
      </Card>

      <Card className="space-y-3 p-4">
        <div className="flex items-center gap-2">
          <Database size={16} className="text-sky-600 dark:text-sky-300" />
          <h2 className="text-sm font-extrabold text-gray-800 dark:text-white">البيانات</h2>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center text-[10px] font-bold">
          <div className="rounded-2xl bg-gray-50 px-2 py-2 dark:bg-slate-700">
            <div className="text-gray-400">أشخاص</div>
            <div className="text-sm text-gray-800 dark:text-white">{state.persons.length}</div>
          </div>
          <div className="rounded-2xl bg-gray-50 px-2 py-2 dark:bg-slate-700">
            <div className="text-gray-400">أيام</div>
            <div className="text-sm text-gray-800 dark:text-white">{state.days.length}</div>
          </div>
          <div className="rounded-2xl bg-gray-50 px-2 py-2 dark:bg-slate-700">
            <div className="text-gray-400">حركات مالية</div>
            <div className="text-sm text-gray-800 dark:text-white">{state.transactions.length}</div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" className="flex-1" onClick={exportData}>
            <Download size={16} /> نسخة احتياطية
          </Button>
          <Button variant="outline" className="flex-1" onClick={() => fileRef.current?.click()}>
            <Upload size={16} /> استيراد
          </Button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void importData(file);
          }}
        />
        <div className="flex flex-wrap gap-2">
          <Button variant="danger" className="flex-1" onClick={() => setConfirmReset(true)}>
            <Trash2 size={16} /> مسح كل البيانات
          </Button>
        </div>
        {message ? (
          <p className="rounded-2xl bg-emerald-50 px-3 py-2 text-[11px] font-bold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
            {message}
          </p>
        ) : null}
      </Card>

      <Card className="space-y-2 p-4">
        <div className="flex items-center gap-2">
          <Info size={16} className="text-sky-600 dark:text-sky-300" />
          <h2 className="text-sm font-extrabold text-gray-800 dark:text-white">عن النظام</h2>
        </div>
        <p className="text-[11px] leading-relaxed text-gray-500 dark:text-slate-300">
          نسخة 2 — نموذج بيانات يفصل بين: المساهم الأساسي، صاحب الحق الحالي، المستخدم الفعلي للماء، الجدول
          الأساسي، اليوم الفعلي، والسجل الشخصي للمستخدم. كل التعديلات تُسجَّل في سجل تدقيق، والبيانات تُحفظ
          دائمًا (حذف ناعم فقط).
        </p>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[11px] text-gray-500 dark:text-slate-300">
          <span className="font-bold">برمجة وتطوير: عبدالملك عامر</span>
          <a
            href="https://www.linkedin.com/in/abdulmalek-saleh-amer-70057226b"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="صفحة المطوّر عبدالملك عامر على LinkedIn"
            data-testid="developer-linkedin"
            className="flex items-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 px-2.5 py-1 font-bold text-sky-700 transition hover:bg-sky-100 dark:border-sky-700 dark:bg-sky-900/30 dark:text-sky-200"
          >
            <Linkedin size={13} /> LinkedIn
          </a>
        </div>
        <Button variant="ghost" className="w-full" onClick={onLogout}>
          تسجيل الخروج
        </Button>
      </Card>

      {confirmReset ? (
        <Card className="space-y-3 border-red-200 p-4">
          <p className="text-xs font-bold text-red-600">
            سيتم مسح كل بيانات المضخة والتشغيل من هذا الجهاز. يُنصح بتنزيل نسخة احتياطية أولًا.
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" className="flex-1" onClick={() => setConfirmReset(false)}>
              إلغاء
            </Button>
            <Button
              variant="danger"
              className="flex-1"
              onClick={() => {
                actions.reset();
                setConfirmReset(false);
              }}
            >
              تأكيد المسح
            </Button>
          </div>
        </Card>
      ) : null}

      {/* إعدادات المضخة — نافذة منبثقة */}
      <Modal open={pumpOpen} onClose={() => setPumpOpen(false)} title="إعدادات المضخة">
        <div className="space-y-3" data-testid="pump-settings-modal">
          <p className="rounded-2xl bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
            أي تعديل هنا يطبَّق على العمليات الجديدة فقط — العمليات القديمة تحتفظ بالقيم التي كانت وقت تسجيلها
            (Snapshot).
          </p>
          <Field label="اسم المضخة">
            <TextInput value={draft.name} onChange={(e) => set("name", e.target.value)} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="البئر">
              <TextInput value={draft.wells} onChange={(e) => set("wells", e.target.value)} />
            </Field>
            <Field label="المزرعة / المنطقة">
              <TextInput value={draft.farm} onChange={(e) => set("farm", e.target.value)} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="المحرك">
              <TextInput value={draft.engine} onChange={(e) => set("engine", e.target.value)} />
            </Field>
            <Field label="نوع الطاقة">
              <Select value={draft.energyType} onChange={(e) => set("energyType", e.target.value as EnergyType)}>
                <option value="diesel">ديزل عادي</option>
                <option value="solar">ديزل شمسي (طاقة شمسية)</option>
                <option value="hybrid">شمسي + ديزل</option>
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="بداية التشغيل">
              <TimeInput value={draft.workStart} onChange={(e) => set("workStart", e.target.value)} />
            </Field>
            <Field label="نهاية التشغيل">
              <TimeInput value={draft.workEnd} onChange={(e) => set("workEnd", e.target.value)} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="استهلاك لتر/ساعة">
              <NumberInput
                value={draft.fuelConsumptionPerHour}
                onChange={(e) => set("fuelConsumptionPerHour", Number(e.target.value))}
              />
            </Field>
            <Field label="سعر اللتر المرجعي">
              <NumberInput value={draft.fuelPrice} onChange={(e) => set("fuelPrice", Number(e.target.value))} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="اسم الرواس">
              <TextInput value={draft.operatorName} onChange={(e) => set("operatorName", e.target.value)} />
            </Field>
            <Field label="أجر الساعة للرواس">
              <NumberInput
                value={draft.operatorHourlyWage}
                onChange={(e) => set("operatorHourlyWage", Number(e.target.value))}
              />
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="الرواسة لكل ساعة">
              <NumberInput value={draft.royaltyPerHour} onChange={(e) => set("royaltyPerHour", Number(e.target.value))} />
            </Field>
            <Field label="الرواسة لكل ديالة">
              <NumberInput value={draft.royaltyPerCycle} onChange={(e) => set("royaltyPerCycle", Number(e.target.value))} />
            </Field>
            <Field label="العملة">
              <Select value={draft.currency} onChange={(e) => set("currency", e.target.value as Currency)}>
                <option value="YER">ريال يمني</option>
                <option value="SAR">ريال سعودي</option>
                <option value="USD">دولار</option>
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="اسم وحدة الحصة">
              <TextInput value={draft.shareUnit} onChange={(e) => set("shareUnit", e.target.value)} />
            </Field>
            <Field label="طريقة حساب الديزل">
              <Select
                value={draft.fuelCalcMode}
                onChange={(e) => set("fuelCalcMode", e.target.value as "hour" | "cycle")}
              >
                <option value="hour">لكل ساعة</option>
                <option value="cycle">لكل ديالة</option>
              </Select>
            </Field>
          </div>
          <label className="flex items-center justify-between rounded-2xl bg-gray-50 px-3 py-3 dark:bg-slate-700">
            <span className="text-xs font-bold text-gray-700 dark:text-slate-200">رواسة مفعّلة</span>
            <input
              type="checkbox"
              checked={draft.royaltyEnabled}
              onChange={(e) => set("royaltyEnabled", e.target.checked)}
              className="h-5 w-5 accent-sky-600"
            />
          </label>
          <Field label="ملاحظات">
            <TextArea value={draft.notes} onChange={(e) => set("notes", e.target.value)} rows={2} />
          </Field>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setPumpOpen(false)}>
              إلغاء
            </Button>
            <Button
              className="flex-1"
              data-testid="save-pump-settings"
              onClick={() => {
                actions.updatePump(draft);
                setPumpOpen(false);
                setMessage("تم حفظ بيانات المضخة.");
              }}
            >
              <Save size={16} /> حفظ التعديلات
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
