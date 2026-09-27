import type { Currency } from "../domain/types";
import { formatMoney, formatNumber } from "../format";
import { formatTimeAmPm, formatTimeRange } from "../domain/util";

export { formatNumber, formatTimeAmPm, formatTimeRange };

/** أي كائن يحمل عملة (مضخة السجل الشخصي أو مضخة النظام الرسمي) */
export interface CurrencyHolder {
  currency?: Currency;
}

/** عملة السجل — تُقرأ من المضخة إن كانت معروفة، وإلا الريال اليمني */
export function recordCurrency(source?: CurrencyHolder | null): Currency {
  return source?.currency ?? "YER";
}

/** مبلغ بعملة المضخة (بلا تثبيت الريال اليمني) */
export function formatMoneyFor(n: number, source?: CurrencyHolder | null): string {
  return formatMoney(n, recordCurrency(source));
}

/** مبلغ بالريال اليمني — مُبقى للتوافق مع النداءات القديمة، ويُنفَّذ بمصدر واحد */
export function formatMoneyYER(n: number): string {
  return formatMoney(n, "YER");
}

export function formatLiters(n: number): string {
  const v = Math.round((n || 0) * 100) / 100;
  return `${v.toLocaleString("en-US", { maximumFractionDigits: 2 })} لتر`;
}

/** الوقت بصيغة ص/م — من طبقة المجال (مصدر واحد) */

export function formatHours(n: number): string {
  return `${formatNumber(n)} ساعة`;
}

/** تحويل ساعات عشرية إلى صيغة عربية دقيقة: ساعة ودقيقة */
export function formatDurationHours(h: number): string {
  const totalMin = Math.round((h || 0) * 60);
  const hrs = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  if (hrs === 0 && mins === 0) return "0 دقيقة";
  if (hrs === 0) return `${mins} دقيقة`;
  if (mins === 0) return `${hrs} ساعة`;
  return `${hrs} ساعة و${mins} دقيقة`;
}

export function gregorianToday(): string {
  return new Date().toLocaleDateString("ar", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function hijriToday(): string {
  try {
    return new Intl.DateTimeFormat("ar-SA-u-ca-islamic-umalqura", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(new Date());
  } catch {
    try {
      return new Intl.DateTimeFormat("ar-SA-u-ca-islamic", {
        day: "numeric",
        month: "long",
        year: "numeric",
      }).format(new Date());
    } catch {
      return "";
    }
  }
}

export function formatDateShort(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("ar", { day: "numeric", month: "long", year: "numeric" });
}

export function formatDayDate(date: Date): string {
  return date.toLocaleDateString("ar", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}
