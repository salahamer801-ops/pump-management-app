import type { ShareholderPump } from "./types";

export function uid(): string {
  return (
    Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4)
  );
}

export function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function minutesToTime(min: number): string {
  const total = ((Math.round(min) % 1440) + 1440) % 1440;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** وقت الإطفاء = وقت التشغيل + ساعات التشغيل */
export function endTimeFor(pump: ShareholderPump): string {
  return minutesToTime(timeToMinutes(pump.startTime) + pump.dailyHours * 60);
}

export function roundMoney(n: number): number {
  return Math.round(n);
}

/** الديزل باللتر = الساعات × لتر/ساعة */
export function dieselLiters(hours: number, pump: ShareholderPump): number {
  return roundMoney(hours * pump.dieselPerHour * 100) / 100;
}

/** تكلفة الديزل = اللتر × سعر اللتر */
export function dieselCost(hours: number, pump: ShareholderPump, pricePerLiter?: number): number {
  const price = pricePerLiter ?? pump.dieselPricePerLiter;
  return roundMoney(hours * pump.dieselPerHour * price);
}

/** قيمة السلفة/التسلفة حسب الوحدة والكمية */
export function lendCost(
  pump: ShareholderPump,
  unit: "hour" | "cycle" | null,
  qty: number,
  pricePerLiter?: number
): number {
  if (!unit || qty <= 0) return 0;
  const hours = unit === "hour" ? qty : qty * pump.dailyHours;
  return dieselCost(hours, pump, pricePerLiter);
}

/** اسم الدياله التلقائي: من 1 ديسمبر إلى 17 ديسمبر */
export function cycleName(startDate: string, days: number): string {
  const start = new Date(startDate);
  const end = new Date(start.getTime());
  end.setDate(end.getDate() + Math.max(0, days - 1));
  const fmt = (d: Date) =>
    d.toLocaleDateString("ar", { day: "numeric", month: "long" });
  return `من ${fmt(start)} إلى ${fmt(end)}`;
}

/** تاريخ يوم معين داخل الدياله */
export function cycleDayDate(startDate: string, dayIndex: number): Date {
  const d = new Date(startDate);
  d.setDate(d.getDate() + Math.max(0, dayIndex - 1));
  return d;
}

/** تقسيم ساعات عشرية إلى ساعات ودقائق */
export function splitDuration(hours: number): { h: number; m: number } {
  const totalMin = Math.round((hours || 0) * 60);
  return { h: Math.floor(totalMin / 60), m: totalMin % 60 };
}

/** جمع ساعات ودقائق إلى ساعات عشرية */
export function durationToHours(h: number, m: number): number {
  return (Number(h) || 0) + (Number(m) || 0) / 60;
}
