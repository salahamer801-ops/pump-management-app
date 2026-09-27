/**
 * منطق الإشعارات الجديدة (دوال خالصة، بلا مكتبات) — يُستخدم في الخادم ويُختبر آليًا.
 */

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
