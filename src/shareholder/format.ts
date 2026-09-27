export function formatMoneyYER(n: number): string {
  const v = Math.round(n || 0);
  const sign = v < 0 ? "-" : "";
  return `${sign}${Math.abs(v).toLocaleString("en-US")} ر.ي`;
}

export function formatNumber(n: number): string {
  return (n || 0).toLocaleString("en-US", { maximumFractionDigits: 2 });
}

export function formatLiters(n: number): string {
  const v = Math.round((n || 0) * 100) / 100;
  return `${v.toLocaleString("en-US", { maximumFractionDigits: 2 })} لتر`;
}

/** الوقت بصيغة ص/م مثل: 06:00 ص */
export function formatTimeAmPm(t: string): string {
  if (!t) return "—";
  const [h, m] = t.split(":").map(Number);
  if (Number.isNaN(h)) return t;
  const period = h < 12 ? "ص" : "م";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m ?? 0).padStart(2, "0")} ${period}`;
}

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
