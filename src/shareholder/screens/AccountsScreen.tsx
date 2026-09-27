import { useRef, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Download,
  Droplets,
  Fuel,
  Info,
  Printer,
  Upload,
  Wallet,
} from "lucide-react";
import { useShareholder } from "../store";
import { pumpSummaries, turnViews } from "../selectors";
import { formatDateShort, formatLiters, formatMoneyYER, formatNumber } from "../format";
import type { ShareholderState } from "../types";
import { Button, Card, EmptyState, Pill, StatCard } from "../../components/ui";

export default function AccountsScreen() {
  const { state, actions } = useShareholder();
  const summaries = pumpSummaries(state);
  const views = turnViews(state);
  const fileRef = useRef<HTMLInputElement>(null);
  /** رسالة داخل الواجهة (بدل alert) */
  const [notice, setNotice] = useState("");

  const totals = summaries.reduce(
    (acc, s) => ({
      dieselCost: acc.dieselCost + s.dieselCost,
      dieselLiters: acc.dieselLiters + s.dieselLiters,
      royaltyDue: acc.royaltyDue + s.royaltyDue,
      royaltyPaid: acc.royaltyPaid + s.royaltyPaid,
      lent: acc.lent + s.lent,
      borrowed: acc.borrowed + s.borrowed,
    }),
    { dieselCost: 0, dieselLiters: 0, royaltyDue: 0, royaltyPaid: 0, lent: 0, borrowed: 0 }
  );

  const netBorrowed = totals.borrowed - totals.lent; // موجب = عليّ، سالب = لي
  const royaltyUnpaid = totals.royaltyDue - totals.royaltyPaid;

  const exportBackup = () => {
    const data: ShareholderState = state;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pump-org-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const importBackup = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as ShareholderState;
        if (parsed && typeof parsed === "object") {
          actions.importState(parsed);
        }
      } catch {
        setNotice("ملف غير صالح — تأكد أنه ملف نسخة احتياطية صادر من التطبيق.");
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-4" id="accounts-print-area">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black text-gray-900">الحسابات</h1>
          <p className="mt-0.5 text-xs text-gray-500">
            جميع العمليات والتكاليف والسلفة لكل المضخات.
          </p>
        </div>
        <Button
          variant="secondary"
          className="px-3 py-2 text-xs print:hidden"
          onClick={() => window.print()}
        >
          <Printer size={16} /> طباعة
        </Button>
      </div>

      <div className="hidden print:block">
        <div className="text-lg font-black text-gray-900">تقرير الحسابات</div>
        <div className="text-xs text-gray-500">
          {state.profile.name || "مساهم"} · {new Date().toLocaleDateString("ar")}
        </div>
      </div>

      {/* overall */}
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label="تكلفة الديزل"
          value={formatMoneyYER(totals.dieselCost)}
          tone="blue"
          icon={<Fuel size={16} />}
          hint={formatLiters(totals.dieselLiters)}
        />
        <StatCard
          label="الرواسة غير المسددة"
          value={formatMoneyYER(royaltyUnpaid)}
          tone={royaltyUnpaid > 0 ? "red" : "green"}
          icon={<Droplets size={16} />}
          hint={`مسدد ${formatMoneyYER(totals.royaltyPaid)}`}
        />
        <StatCard
          label="عليّ (تسلفت)"
          value={formatMoneyYER(totals.borrowed)}
          tone={totals.borrowed > 0 ? "red" : "gray"}
          icon={<ArrowDownLeft size={16} />}
        />
        <StatCard
          label="لي (سلفت)"
          value={formatMoneyYER(totals.lent)}
          tone={totals.lent > 0 ? "amber" : "gray"}
          icon={<ArrowUpRight size={16} />}
        />
      </div>

      {/* net */}
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-extrabold text-gray-700">
            <Wallet size={16} className="text-emerald-600" /> صافي السلفة
          </div>
          <div className={`text-lg font-black ${netBorrowed > 0 ? "text-red-600" : "text-emerald-700"}`}>
            {netBorrowed > 0
              ? `عليّ ${formatMoneyYER(netBorrowed)}`
              : netBorrowed < 0
                ? `لي ${formatMoneyYER(Math.abs(netBorrowed))}`
                : "متعادل"}
          </div>
        </div>
        <div className="mt-2 text-xs text-gray-400">
          صافي السلفة = التسلفت (عليّ) − السلفت (لي)
        </div>
      </Card>

      {/* per pump */}
      <div>
        <h2 className="mb-2 px-1 text-base font-extrabold text-gray-800">تفصيل المضخات</h2>
        {summaries.length === 0 ? (
          <EmptyState icon={<Wallet size={26} />} title="لا توجد بيانات" description="أضف مضخات وسجّل أدوارك." />
        ) : (
          <div className="space-y-2">
            {summaries.map((s) => (
              <Card key={s.pump.id} className="p-4">
                <div className="flex items-center justify-between">
                  <div className="font-extrabold text-gray-900">{s.pump.name}</div>
                  <div className="text-xs text-gray-400">{s.turns.length} دور</div>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-gray-400">الديزل: </span>
                    <b className="text-gray-700">{formatMoneyYER(s.dieselCost)}</b>
                    <span className="text-gray-400"> ({formatLiters(s.dieselLiters)})</span>
                  </div>
                  <div>
                    <span className="text-gray-400">الرواسة: </span>
                    <b className="text-gray-700">
                      {formatMoneyYER(s.royaltyPaid)} / {formatMoneyYER(s.royaltyDue)}
                    </b>
                  </div>
                  <div>
                    <span className="text-gray-400">عليّ: </span>
                    <b className="text-red-600">{formatMoneyYER(s.borrowed)}</b>
                  </div>
                  <div>
                    <span className="text-gray-400">لي: </span>
                    <b className="text-amber-600">{formatMoneyYER(s.lent)}</b>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* operations */}
      <div>
        <h2 className="mb-2 px-1 text-base font-extrabold text-gray-800">العمليات</h2>
        {views.length === 0 ? (
          <Card className="p-4 text-center text-sm text-gray-400">لا توجد عمليات مسجلة.</Card>
        ) : (
          <Card className="divide-y divide-gray-50">
            {views.map(({ turn, pump, cycle }) => (
              <div key={turn.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold text-gray-800">
                    {pump?.name ?? "—"} — اليوم {turn.dayIndex}
                  </div>
                  <div className="text-xs text-gray-400">
                    {formatDateShort(turn.date)} · {cycle?.name ?? ""}
                  </div>
                </div>
                <div className="text-left">
                  <div className="text-sm font-bold text-gray-700">
                    {formatMoneyYER(turn.dieselCost)}
                  </div>
                  <div className="text-xs text-gray-400">
                    {formatNumber(turn.hours)} ساعة
                  </div>
                </div>
                {turn.direction ? (
                  <Pill tone={turn.direction === "borrow" ? "red" : "amber"}>
                    {turn.direction === "borrow" ? "تسلفت" : "سلفت"}
                  </Pill>
                ) : (
                  <Pill tone="gray">عادي</Pill>
                )}
              </div>
            ))}
          </Card>
        )}
      </div>

      {/* backup */}
      <Card className="p-5">
        <div className="mb-3 flex items-center gap-2 text-sm font-extrabold text-gray-500">
          <Download size={16} /> النسخ الاحتياطي
        </div>
        <p className="mb-3 text-xs text-gray-500">
          صدّر بياناتك كملف واحتفظ به، أو استعده عند الحاجة.
        </p>
        {notice ? (
          <p
            className="mb-3 rounded-2xl bg-red-50 px-3 py-2 text-[11px] font-bold text-red-700 dark:bg-red-900/20 dark:text-red-300"
            role="alert"
            data-testid="backup-notice"
          >
            {notice}
          </p>
        ) : null}
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button variant="secondary" onClick={() => { setNotice(""); exportBackup(); }} className="flex-1">
            <Download size={16} /> تصدير البيانات
          </Button>
          <Button variant="outline" onClick={() => fileRef.current?.click()} className="flex-1">
            <Upload size={16} /> استيراد البيانات
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) importBackup(f);
              e.target.value = "";
            }}
          />
        </div>
      </Card>

      {/* about */}
      <Card className="p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
            <Info size={20} />
          </div>
          <div>
            <h3 className="font-extrabold text-gray-900">حول التطبيق</h3>
            <p className="mt-1 text-sm leading-relaxed text-gray-500">
              مشروع تنظيم المضخات — دفتر شخصي لإدارة حصص المياه الزراعية.
              <br />
              برمجة وتطوير: المهندس/ عبدالملك عامر
            </p>
          </div>
        </div>
      </Card>
    </div>
  );
}
