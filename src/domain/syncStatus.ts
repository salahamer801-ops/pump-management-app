/**
 * حالة المزامنة بين جهاز المساهم والخادم — دوال خالصة (بلا شبكة وبلا تخزين)
 * لتُختبر في `npm run verify` وتُستخدم في كل شاشات المؤشرات.
 *
 * المبدأ: الخادم (PostgreSQL) هو المصدر الرسمي، ونسخة الجهاز للعرض فقط.
 */

export type OfficialSyncStatus = "idle" | "syncing" | "synced" | "offline";

export const SYNC_LABEL: Record<OfficialSyncStatus, string> = {
  idle: "غير مرتبط بمضخة",
  syncing: "جارٍ التحديث…",
  synced: "محدَّث",
  offline: "غير متصل",
};

export const SYNC_HINT: Record<OfficialSyncStatus, string> = {
  idle: "اربط حسابك بمضخة برقم تعريفها ليصل إليك ما يسجّله المسؤول.",
  syncing: "يُحدَّث الآن من الخادم الرسمي…",
  synced: "بياناتك مطابقة لسجل المسؤول على الخادم.",
  offline: "تَعذّر الوصول للخادم — تُعرض آخر نسخة محفوظة على جهازك.",
};

/** نص بسيط بصيغة عربية سليمة: 1 / 2 / 3–10 / 11+ */
function arCount(n: number, single: string, dual: string, few: string, many: string): string {
  if (n === 1) return single;
  if (n === 2) return dual;
  if (n >= 3 && n <= 10) return `${n} ${few}`;
  return `${n} ${many}`;
}

/**
 * «قبل دقيقة» · «قبل دقيقتين» · «قبل ٥ دقائق» · «قبل ساعتين» · «أمس» …
 * الوقت غير المعروف يعيد «—»، والمستقبلي يُعامل كـ«الآن».
 */
export function formatRelativeAr(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return "—";
  const at = new Date(iso);
  const ms = now.getTime() - at.getTime();
  if (!Number.isFinite(ms)) return "—";
  if (ms < 45_000) return "الآن";

  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `قبل ${arCount(minutes, "دقيقة", "دقيقتين", "دقائق", "دقيقة")}`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `قبل ${arCount(hours, "ساعة", "ساعتين", "ساعات", "ساعة")}`;

  const days = Math.floor(hours / 24);
  if (days === 1) return "أمس";
  return `قبل ${arCount(days, "يوم", "يومين", "أيام", "يوم")}`;
}

/** «آخر تحديث: قبل دقيقتين» أو «لم يُحدَّث بعد على هذا الجهاز» */
export function lastUpdateLabel(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return "لم يُحدَّث بعد على هذا الجهاز";
  return `آخر تحديث: ${formatRelativeAr(iso, now)}`;
}

/** هل النسخة المحفوظة على الجهاز أحدث من نسخة الخادم؟ */
export function isStaleSince(
  syncedAt: string | null | undefined,
  minutes: number,
  now: Date = new Date()
): boolean {
  if (!syncedAt) return true;
  const at = new Date(syncedAt).getTime();
  if (!Number.isFinite(at)) return true;
  return now.getTime() - at > minutes * 60_000;
}

export interface NotifiableLike {
  id: string;
  personId?: string | null;
  read?: boolean;
}

/**
 * إشعاراتي غير المقروءة:
 *  - الموجَّهة إليّ شخصيًّا + العامة (بلا شخص معيّن).
 *  - «مقروء» علم شخصي على الخادم (readIds) — ما قرأه غيري لا يُسقط شارتي.
 */
export function unreadNotifications<T extends NotifiableLike>(
  notifications: readonly T[] | null | undefined,
  readIds: Iterable<string>,
  personId: string | null
): T[] {
  const read = new Set(readIds);
  const list = Array.isArray(notifications) ? notifications : [];
  return list.filter((n) => {
    if (!n || !n.id) return false;
    if (read.has(n.id)) return false;
    return !n.personId || n.personId === personId;
  });
}

/** إشعاراتي (مقروءة وغير مقروءة) — نفس تصفية الشخص */
export function myNotifications<T extends NotifiableLike>(
  notifications: readonly T[] | null | undefined,
  personId: string | null
): T[] {
  const list = Array.isArray(notifications) ? notifications : [];
  return list.filter((n) => Boolean(n && n.id) && (!n.personId || n.personId === personId));
}

/** نص حالة الخادم في الإعدادات */
export function serverStatusLabel(online: boolean, ok: boolean | null): string {
  if (!online) return "لا يوجد اتصال بالإنترنت";
  if (ok === null) return "جارٍ فحص الخادم…";
  return ok ? "الخادم الرسمي يعمل" : "الخادم لا يستجيب الآن";
}
