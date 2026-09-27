/**
 * محرّر التسديد الموحّد — مصدر واحد لتفصيل الديزل والرواسة في كل الشاشات.
 *
 * يُستخدم في: إضافة مشارك · تعديل الاستخدام · تسجيل نقص الديزل · الأزرار السريعة
 * في صف اليوم. كل خيار يُمرّر معه مبالغه (المدفوع من الديزل، والجزء النقدي من
 * الرواسة) فلا يفقد أي تعديل تقسيمًا مسجَّلًا سابقًا، ولا يظهر نص غير معرَّف.
 */
import { AlertTriangle } from "lucide-react";
import {
  DIESEL_SETTLEMENT_OPTIONS,
  ROYALTY_MODE_OPTIONS,
  dieselPaidPartOf,
  royaltyCashPartOf,
} from "../../domain/rules";
import type { Currency, DieselSettlement, RoyaltyPayMode } from "../../domain/types";
import { formatMoney, formatNumber } from "../../format";
import { cx, Field, MiniRow, NumberInput } from "../../components/ui";

/** تفصيل التسديد كما يُحفظ في العملية */
export interface SettlementDraft {
  dieselSettlement: DieselSettlement;
  dieselShortageLiters: number;
  /** المدفوع فعلًا من قيمة الديزل (0 = يُحسب من الحالة) */
  dieselPaidAmount: number;
  royaltyPayMode: RoyaltyPayMode;
  /** عند «جزء نقد وجزء أجل» */
  royaltyCashAmount: number;
}

export const EMPTY_SETTLEMENT: SettlementDraft = {
  dieselSettlement: "unpaid",
  dieselShortageLiters: 0,
  dieselPaidAmount: 0,
  royaltyPayMode: "credit",
  royaltyCashAmount: 0,
};

/** حالة التسديد المخزَّنة في عملية قائمة — تُقرأ كما هي بلا فقدان */
export function settlementFromUsage(usage: {
  dieselSettlement?: DieselSettlement;
  dieselShortageLiters?: number;
  dieselPaidAmount?: number;
  royaltyPayMode?: RoyaltyPayMode;
  royaltyCashAmount?: number;
}): SettlementDraft {
  return {
    dieselSettlement: usage.dieselSettlement ?? "unpaid",
    dieselShortageLiters: Math.max(0, usage.dieselShortageLiters || 0),
    dieselPaidAmount: Math.max(0, usage.dieselPaidAmount || 0),
    royaltyPayMode: usage.royaltyPayMode ?? "credit",
    royaltyCashAmount: Math.max(0, usage.royaltyCashAmount || 0),
  };
}

/** المبالغ النهائية للتسديد محسوبة من الحالة والمستحق */
export function settlementAmounts(
  draft: SettlementDraft,
  due: { fuelDue: number; royaltyDue: number; usedPrice: number }
): {
  fuelDue: number;
  dieselPaid: number;
  dieselShortageLiters: number;
  dieselOwed: number;
  royaltyDue: number;
  royaltyCash: number;
  royaltyDeferred: number;
} {
  const fuelDue = Math.max(0, Math.round(due.fuelDue));
  const royaltyDue = Math.max(0, Math.round(due.royaltyDue));
  const dieselPaid = dieselPaidPartOf({
    fuelAmountDue: fuelDue,
    dieselSettlement: draft.dieselSettlement,
    dieselShortageLiters: draft.dieselShortageLiters,
    dieselPaidAmount: draft.dieselPaidAmount,
    fuelPriceSnapshot: due.usedPrice,
  });
  const dieselOwed = Math.max(0, fuelDue - dieselPaid);
  const royaltyCash = royaltyCashPartOf({
    royaltyAmountDue: royaltyDue,
    royaltyPayMode: draft.royaltyPayMode,
    royaltyCashAmount: draft.royaltyCashAmount,
  });
  return {
    fuelDue,
    dieselPaid,
    dieselShortageLiters:
      due.usedPrice > 0 ? Math.round((dieselOwed / due.usedPrice) * 100) / 100 : draft.dieselShortageLiters,
    dieselOwed,
    royaltyDue,
    royaltyCash,
    royaltyDeferred: Math.max(0, royaltyDue - royaltyCash),
  };
}

/** مبلغ برمز عملة التطبيق (ر.ي · ر.س · $) */
export function money(n: number, currency: Currency): string {
  return formatMoney(n, currency);
}

export default function SettlementEditor({
  value,
  onChange,
  fuelDue,
  royaltyDue,
  usedPrice,
  currency,
  fuelLiters = 0,
  showSummary = true,
  compact = false,
}: {
  value: SettlementDraft;
  onChange: (next: SettlementDraft) => void;
  fuelDue: number;
  royaltyDue: number;
  /** سعر اللتر المستخدم في هذه العملية (لتحويل اللترات إلى مبلغ) */
  usedPrice: number;
  /** اللترات المحسوبة من الساعات × الاستهلاك (للتقدير الأوّلي عند النقص) */
  fuelLiters?: number;
  currency: Currency;
  showSummary?: boolean;
  compact?: boolean;
}) {
  const amounts = settlementAmounts(value, { fuelDue, royaltyDue, usedPrice });
  const set = (patch: Partial<SettlementDraft>) => onChange({ ...value, ...patch });

  return (
    <div className="space-y-3" data-testid="settlement-editor">
      {/* الديزل */}
      <Field label="تسديد الديزل">
        <div className="grid grid-cols-3 gap-1.5">
          {DIESEL_SETTLEMENT_OPTIONS.map((o) => (
            <button
              key={o.id}
              type="button"
              title={o.action}
              onClick={() => {
                /*
                 * عند اختيار «نقص» بلا رقم مسجَّل نضع تقديرًا أوّليًا (عُشر اللترات)
                 * ليبقى المستحق/المدفوع/النقص منطقيًا حتى يعدّله المسؤول.
                 */
                const defaultLiters =
                  o.id === "shortage" && value.dieselShortageLiters === 0 && fuelLiters > 0
                    ? Math.max(0.5, Math.round(fuelLiters * 0.1 * 100) / 100)
                    : value.dieselShortageLiters;
                set({
                  dieselSettlement: o.id,
                  dieselShortageLiters: o.id === "shortage" ? defaultLiters : 0,
                  dieselPaidAmount: o.id === "shortage" ? value.dieselPaidAmount : 0,
                });
              }}
              className={cx(
                compact ? "rounded-xl px-2 py-1.5 text-[10px]" : "rounded-2xl px-2 py-2 text-[11px]",
                "border font-bold transition",
                value.dieselSettlement === o.id
                  ? o.id === "paid"
                    ? "border-emerald-400 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                    : o.id === "shortage"
                      ? "border-amber-400 bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                      : "border-red-300 bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-300"
                  : "border-gray-200 text-gray-500 dark:border-slate-600 dark:text-slate-300"
              )}
              aria-label={`تسديد الديزل: ${o.label}`}
            >
              {o.label}
              {o.id === "shortage" && value.dieselSettlement === "shortage" && amounts.dieselShortageLiters > 0
                ? ` (${formatNumber(amounts.dieselShortageLiters)} ل)`
                : ""}
            </button>
          ))}
        </div>
      </Field>

      {value.dieselSettlement === "shortage" ? (
        <div className="grid grid-cols-2 gap-3">
          <Field label="اللترات الناقصة" hint="يُسجَّل النقص دَينًا والباقي سداد">
            <NumberInput
              value={amounts.dieselShortageLiters}
              onChange={(e) => {
                const liters = Math.max(0, Number(e.target.value));
                set({
                  dieselShortageLiters: liters,
                  dieselPaidAmount: Math.max(0, amounts.fuelDue - Math.round(liters * usedPrice)),
                });
              }}
              aria-label="لترات نقص الديزل"
            />
          </Field>
          <Field label="المدفوع من الديزل">
            <NumberInput
              value={amounts.dieselPaid}
              onChange={(e) => {
                const paid = Math.max(0, Math.min(amounts.fuelDue, Number(e.target.value)));
                set({
                  dieselPaidAmount: paid,
                  dieselShortageLiters:
                    usedPrice > 0 ? Math.round(((amounts.fuelDue - paid) / usedPrice) * 100) / 100 : 0,
                });
              }}
              aria-label="المبلغ المدفوع من الديزل"
            />
          </Field>
        </div>
      ) : null}

      {showSummary ? (
        <div className="grid grid-cols-3 gap-2 rounded-2xl bg-gray-50 p-3 text-[11px] dark:bg-slate-700">
          <MiniRow label="الديزل المستحق" value={money(amounts.fuelDue, currency)} />
          <MiniRow label="المدفوع" value={money(amounts.dieselPaid, currency)} tone="green" />
          <MiniRow
            label="نقص الديزل"
            value={money(amounts.dieselOwed, currency)}
            tone={amounts.dieselOwed > 0 ? "amber" : "gray"}
          />
        </div>
      ) : null}

      {/* الرواسة */}
      <Field label="رسوم الرواسة">
        <div className="grid grid-cols-3 gap-1.5">
          {ROYALTY_MODE_OPTIONS.map((o) => (
            <button
              key={o.id}
              type="button"
              title={o.action}
              onClick={() =>
                set({
                  royaltyPayMode: o.id,
                  royaltyCashAmount: o.id === "partial" ? value.royaltyCashAmount : 0,
                })
              }
              className={cx(
                compact ? "rounded-xl px-2 py-1.5 text-[10px]" : "rounded-2xl px-2 py-2 text-[10px]",
                "border font-bold transition",
                value.royaltyPayMode === o.id
                  ? o.id === "cash"
                    ? "border-emerald-400 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                    : o.id === "partial"
                      ? "border-sky-400 bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300"
                      : "border-amber-400 bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                  : "border-gray-200 text-gray-500 dark:border-slate-600 dark:text-slate-300"
              )}
              aria-label={`سداد الرواسة: ${o.label}`}
            >
              {o.label}
            </button>
          ))}
        </div>
      </Field>

      {value.royaltyPayMode === "partial" ? (
        <div className="grid grid-cols-2 gap-3">
          <Field label="الجزء النقدي">
            <NumberInput
              value={amounts.royaltyCash}
              onChange={(e) =>
                set({ royaltyCashAmount: Math.max(0, Math.min(amounts.royaltyDue, Number(e.target.value))) })
              }
              aria-label="الجزء النقدي من الرواسة"
            />
          </Field>
          <Field label="الباقي أجلًا (دَين)">
            <div className="rounded-2xl bg-gray-50 px-3 py-3 text-sm font-extrabold text-amber-700 dark:bg-slate-700 dark:text-amber-300">
              {money(amounts.royaltyDeferred, currency)}
            </div>
          </Field>
        </div>
      ) : null}

      {showSummary ? (
        <div className="grid grid-cols-3 gap-2 rounded-2xl bg-gray-50 p-3 text-[11px] dark:bg-slate-700">
          <MiniRow label="الرواسة المستحقة" value={money(amounts.royaltyDue, currency)} />
          <MiniRow label="نقد" value={money(amounts.royaltyCash, currency)} tone="green" />
          <MiniRow
            label="أجل (دَين)"
            value={money(amounts.royaltyDeferred, currency)}
            tone={amounts.royaltyDeferred > 0 ? "amber" : "gray"}
          />
        </div>
      ) : null}

      {!compact ? (
        <p className="flex items-start gap-1.5 rounded-2xl bg-gray-50 px-3 py-2 text-[10px] leading-relaxed text-gray-500 dark:bg-slate-700 dark:text-slate-300">
          <AlertTriangle size={11} className="mt-0.5 shrink-0" />
          يُحفظ التسديد مع العملية كما هو (لقطة): الديزل المستحق = اللترات × سعر اللتر، والباقي غير المدفوع يبقى دَينًا.
        </p>
      ) : null}
    </div>
  );
}

