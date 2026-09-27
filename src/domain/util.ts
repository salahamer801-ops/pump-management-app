import type { ID } from "./types";

/* -------------------------------- معرّفات ------------------------------- */

export function uid(prefix = ""): ID {
  const rand = Math.random().toString(36).slice(2, 9);
  const time = Date.now().toString(36).slice(-5);
  return `${prefix}${prefix ? "_" : ""}${time}${rand}`;
}

/* --------------------------------- الوقت -------------------------------- */

export function timeToMinutes(t: string): number {
  if (!t) return 0;
  const [h, m] = t.split(":").map((n) => Number(n) || 0);
  return h * 60 + m;
}

export function minutesToTime(min: number): string {
  const total = ((Math.round(min) % 1440) + 1440) % 1440;
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** هل يعبر الوقت منتصف الليل؟ */
export function isOvernight(start: string, end: string): boolean {
  return timeToMinutes(end) <= timeToMinutes(start);
}

/** المدة بالدقائق مع دعم عبور منتصف الليل (23:00 → 02:00 = 3 ساعات) */
export function durationMin(start: string, end: string): number {
  if (!start || !end) return 0;
  let d = timeToMinutes(end) - timeToMinutes(start);
  if (d <= 0) d += 1440;
  return d;
}

/** المدة الصريحة (قد تكون سالبة) — للتحقق من الأخطاء */
export function rawDurationMin(start: string, end: string): number {
  return timeToMinutes(end) - timeToMinutes(start);
}

export function formatDuration(min: number): string {
  const total = Math.round(min || 0);
  const sign = total < 0 ? "-" : "";
  const abs = Math.abs(total);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  if (h === 0 && m === 0) return "0";
  if (h === 0) return `${sign}${m} دقيقة`;
  if (m === 0) return `${sign}${h} ساعة`;
  return `${sign}${h} س ${m} د`;
}

export function toHours(min: number): number {
  return Math.round(((min || 0) / 60) * 100) / 100;
}

/** ترتيب فترتين زمنيتين: [بداية، نهاية] بالدقائق من بداية النهار مع تمديد العبور */
export function timeInterval(
  start: string,
  end: string,
  anchorMin = 0
): { from: number; to: number } {
  let from = timeToMinutes(start);
  let to = timeToMinutes(end);
  if (to <= from) to += 1440;
  // نُقرّب الفترة إلى نفس نافذة اليوم إن أمكن
  while (from - 1440 >= anchorMin) {
    from -= 1440;
    to -= 1440;
  }
  while (from < anchorMin - 720) {
    from += 1440;
    to += 1440;
  }
  return { from, to };
}

export function rangesOverlap(
  a: { from: number; to: number },
  b: { from: number; to: number }
): number {
  return Math.max(0, Math.min(a.to, b.to) - Math.max(a.from, b.from));
}

/* -------------------------------- التواريخ ------------------------------ */

export function todayISO(): string {
  return toISODate(new Date());
}

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseISODate(iso: string): Date {
  const [y, m, d] = (iso || "").split("-").map(Number);
  if (!y || !m || !d) return new Date();
  return new Date(y, m - 1, d);
}

export function addDaysISO(iso: string, days: number): string {
  const d = parseISODate(iso);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

export function isoToDisplay(iso: string): string {
  if (!iso) return "—";
  try {
    return parseISODate(iso).toLocaleDateString("ar", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export function isoToShort(iso: string): string {
  if (!iso) return "—";
  try {
    return parseISODate(iso).toLocaleDateString("ar", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export function isoToWeekday(iso: string): string {
  if (!iso) return "—";
  try {
    return parseISODate(iso).toLocaleDateString("ar", { weekday: "long" });
  } catch {
    return "—";
  }
}

/** التاريخ الهجري (أم القرى) */
export function hijriDate(iso?: string): string {
  try {
    const d = iso ? parseISODate(iso) : new Date();
    return d.toLocaleDateString("ar-SA-u-ca-islamic-umalqura", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

export function formatClock(iso: string): string {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString("ar", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

export function monthKey(iso: string): string {
  return (iso || "").slice(0, 7);
}

export function monthLabel(key: string): string {
  if (!key) return "—";
  try {
    return parseISODate(`${key}-01`).toLocaleDateString("ar", {
      month: "long",
      year: "numeric",
    });
  } catch {
    return key;
  }
}

export function nowTime(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function round(n: number): number {
  return Math.round(n || 0);
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function sum(list: number[]): number {
  return list.reduce((a, b) => a + (b || 0), 0);
}
