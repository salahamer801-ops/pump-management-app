/**
 * بطاقة «ثبّت التطبيق على جوالك» — الطريق العملي بلا متجر تطبيقات:
 * أيقونة على الشاشة الرئيسية، وتطبيق يفتح ملء الشاشة بلا شريط متصفح.
 *
 * أندرويد/كروم: زر تثبيت حقيقي (beforeinstallprompt) + خطوتان احتياطيتان.
 * آيفون/سفاري: ثلاث خطوات «مشاركة ← إضافة إلى الشاشة الرئيسية».
 * على الحاسب: خطوات الجوالين معًا + زر نسخ رابط التطبيق لفتحه على الجوال.
 * إن كان مثبَّتًا: تأكيد أخضر بلا أزرار.
 */
import { useState } from "react";
import { Check, Copy, Download, Share2, Smartphone } from "lucide-react";
import { Button, Card, Pill } from "./ui";
import { usePwaState } from "../pwa";

export function InstallAppCard({ className = "" }: { className?: string }) {
  const { canInstall, installed, ios, android, install } = usePwaState();
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [copyState, setCopyState] = useState<"idle" | "ok" | "fail">("idle");

  const runInstall = async () => {
    setError("");
    const outcome = await install();
    if (outcome === "accepted") setDone(true);
    else if (outcome === "unavailable") setError("تعذّر فتح نافذة التثبيت — استخدم قائمة المتصفح: «تثبيت التطبيق».");
  };

  const copyLink = async () => {
    const url = `${window.location.origin}/`;
    try {
      await navigator.clipboard.writeText(url);
      setCopyState("ok");
    } catch {
      setCopyState("fail");
      setError(`انسخ الرابط يدويًا: ${url}`);
    }
  };

  const showIosSteps = ios;
  const showAndroidSteps = !ios && (android || canInstall);
  const showBothSteps = !ios && !android && !canInstall;

  return (
    <Card className={`p-5 ${className}`} data-testid="install-app-card">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200">
          <Smartphone size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-extrabold text-gray-900 dark:text-white">ثبّت التطبيق على جوالك</div>
          <div className="text-xs text-gray-400 dark:text-slate-400">
            {installed
              ? "مثبَّت ويعمل كتطبيق — تفتحه من أيقونته"
              : "أيقونة باسم «تنظيم المضخات» على شاشة جوالك، تفتح ملء الشاشة"}
          </div>
        </div>
        {installed ? (
          <Pill tone="green">
            <Check size={12} /> مثبَّت
          </Pill>
        ) : null}
      </div>

      {installed ? (
        <p className="mt-3 rounded-2xl bg-emerald-50 px-3 py-2 text-[11px] leading-relaxed text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300">
          افتح التطبيق من أيقونة «تنظيم المضخات» في شاشتك الرئيسية — يعمل ملء الشاشة، وبياناتك تُحدَّث
          تلقائيًا من المسؤول عند كل فتح.
        </p>
      ) : (
        <>
          {error ? (
            <p className="mt-3 rounded-2xl bg-red-50 px-3 py-2 text-[11px] font-bold text-red-600 dark:bg-red-900/20 dark:text-red-300" role="alert">
              {error}
            </p>
          ) : null}

          {done ? (
            <p className="mt-3 rounded-2xl bg-emerald-50 px-3 py-2 text-[11px] font-bold text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300" role="status">
              تم — ابحث عن أيقونة «تنظيم المضخات» في شاشة جوالك.
            </p>
          ) : canInstall ? (
            <Button onClick={() => void runInstall()} className="mt-4 w-full" data-testid="install-app-button">
              <Download size={18} /> ثبّت التطبيق على جوالك
            </Button>
          ) : null}

          {!done && showIosSteps ? (
            <div className="mt-4 space-y-2 text-[11px] leading-relaxed text-gray-600 dark:text-slate-300">
              <p className="font-extrabold text-gray-800 dark:text-white">على آيفون/آيباد — ثلاث خطوات:</p>
              <Step n={1} text="افتح التطبيق في متصفح سفاري (وليس داخل تطبيق آخر)." />
              <Step n={2} icon={<Share2 size={12} />} text="اضغط زر المشاركة أسفل الشاشة." />
              <Step n={3} text="اختر «إضافة إلى الشاشة الرئيسية» ثم «إضافة»." />
            </div>
          ) : null}

          {!done && showAndroidSteps ? (
            <div className="mt-4 space-y-2 text-[11px] leading-relaxed text-gray-600 dark:text-slate-300">
              <p className="font-extrabold text-gray-800 dark:text-white">على أندرويد (كروم) — خطوتان:</p>
              <Step n={1} text="اضغط قائمة المتصفح (⋮) أعلى الشاشة." />
              <Step n={2} text="اختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية»." />
              {canInstall ? (
                <p className="text-gray-400 dark:text-slate-400">وإن لم يظهر الزر أعلاه، فالخطوتان تكفيان.</p>
              ) : (
                <p className="text-gray-400 dark:text-slate-400">
                  إن لم يظهر الخيار فافتح التطبيق بمتصفح كروم مباشرة بدل النافذة المدمجة.
                </p>
              )}
            </div>
          ) : null}

          {!done && showBothSteps ? (
            <div className="mt-4 space-y-2 text-[11px] leading-relaxed text-gray-600 dark:text-slate-300">
              <p className="font-extrabold text-gray-800 dark:text-white">افتح رابط التطبيق على جوالك ثم:</p>
              <Step n={1} text="أندرويد (كروم): (⋮) ← «تثبيت التطبيق»." />
              <Step n={2} icon={<Share2 size={12} />} text="آيفون (سفاري): المشاركة ← «إضافة إلى الشاشة الرئيسية»." />
              <Button variant="outline" className="w-full" onClick={() => void copyLink()} data-testid="copy-app-link-button">
                <Copy size={16} /> {copyState === "ok" ? "تم نسخ الرابط ✓" : "انسخ رابط التطبيق"}
              </Button>
            </div>
          ) : null}
        </>
      )}
    </Card>
  );
}

function Step({ n, text, icon }: { n: number; text: string; icon?: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-2xl bg-gray-50 px-3 py-2 dark:bg-slate-700/60">
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-700 text-[10px] font-black text-white">
        {n}
      </span>
      <span className="flex items-center gap-1">
        {icon}
        {text}
      </span>
    </div>
  );
}
