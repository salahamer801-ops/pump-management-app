import { fuelCostFor, fuelLitersFor } from "../domain/rules";
import { minutesToTime, timeToMinutes, uid } from "../domain/util";
import type { ShareholderPump } from "./types";

/* المعرّفات والوقت من طبقة القواعد المشتركة — بلا نسخة ثانية هنا */
export { minutesToTime, timeToMinutes, uid };

/** وقت الإطفاء = وقت التشغيل + ساعات التشغيل */
export function endTimeFor(pump: ShareholderPump): string {
  return minutesToTime(timeToMinutes(pump.startTime) + pump.dailyHours * 60);
}

/** الديزل باللتر = الساعات × لتر/ساعة — بنفس معادلة النظام الرسمي */
export function dieselLiters(hours: number, pump: ShareholderPump): number {
  return fuelLitersFor(Math.max(0, hours) * 60, {
    energyType: "diesel",
    fuelCalcMode: "hour",
    fuelConsumptionPerHour: pump.dieselPerHour,
  });
}

/** تكلفة الديزل = اللتر × سعر اللتر — بنفس معادلة النظام الرسمي */
export function dieselCost(hours: number, pump: ShareholderPump, pricePerLiter?: number): number {
  const price = pricePerLiter ?? pump.dieselPricePerLiter;
  return fuelCostFor(dieselLiters(hours, pump), price);
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
