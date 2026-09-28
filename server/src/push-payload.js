/**
 * منطق الإشعارات الجديدة (دوال خالصة، بلا مكتبات) — يُستخدم في الخادم ويُختبر آليًا.
 */

/* نطاقات خدمات الإشعارات التي تستخدمها المتصفحات فعليًا */
const PUSH_HOSTS = [
  "fcm.googleapis.com", // كروم · إيدج · سامسونج · أوبرا
  "push.apple.com", // سفاري (آيفون/آيباد/ماك)
  "push.services.mozilla.com", // فايرفوكس
  "notify.windows.com", // ويندوز (Edge)
];

/**
 * التحقق من نقطة نهاية اشتراك الإشعارات:
 * يمنع أن يُسجّل مستخدم عنوانًا داخليًا أو خدمة أخرى فيُرسل الخادم طلبات إليها (SSRF).
 * يُعيد نصّ المشكلة أو null إن كانت مقبولة.
 */
export function pushEndpointProblem(endpoint) {
  const value = String(endpoint ?? "").trim();
  if (!value) return "اشتراك الإشعارات غير صالح.";
  let url;
  try {
    url = new URL(value);
  } catch {
    return "اشتراك الإشعارات غير صالح.";
  }
  if (url.protocol !== "https:") return "اشتراك الإشعارات يجب أن يكون عبر HTTPS.";
  const host = url.hostname.toLowerCase();
  const allowed = PUSH_HOSTS.some((known) => host === known || host.endsWith(`.${known}`));
  if (!allowed) return "خدمة الإشعارات غير معروفة — حدّث المتصفح أو استخدم كروم/سفاري.";
  return null;
}

/**
 * أي إشعارات جديدة وصلت مع هذا الحفظ؟ (مقارنة بمعرّفات الإشعارات المحفوظة سابقًا)
 */
export function newNotifications(previousExtra, nextExtra, limit = 3) {
  const before = new Set(
    Array.isArray(previousExtra?.notifications)
      ? previousExtra.notifications.map((n) => String((n && n.id) || ""))
      : []
  );
  const now = Array.isArray(nextExtra?.notifications) ? nextExtra.notifications : [];
  return now
    .filter((n) => n && n.id && !before.has(String(n.id)))
    .slice(0, limit)
    .map((n) => ({
      id: String(n.id),
      title: String(n.title ?? "تنبيه من مسؤول المضخة"),
      body: String(n.body ?? ""),
      level: String(n.level ?? "info"),
      personId: n.personId ?? null,
    }));
}
