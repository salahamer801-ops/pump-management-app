/**
 * إعدادات النظام العامة — يحفظها مسؤول النظام في لوحته.
 * لا حذف ولا فقدان: المفاتيح غير المعروفة تبقى، والقيم الافتراضية تُدمج.
 */
import { q } from "./db.js";

export const DEFAULT_SETTINGS = {
  /** إعلان يظهر لكل المستخدمين في التطبيقات الثلاثة */
  announcement: { active: false, tone: "info", text: "" },
  /** فتح/إغلاق إنشاء الحسابات من شاشة الدخول */
  registration: { manager: true, user: true },
};

function mergeSettings(rows) {
  const map = new Map(rows.map((r) => [r.key, r.value ?? {}]));
  const announcement = { ...DEFAULT_SETTINGS.announcement, ...(map.get("announcement") ?? {}) };
  const registration = { ...DEFAULT_SETTINGS.registration, ...(map.get("registration") ?? {}) };
  return { announcement, registration };
}

export async function getSettings() {
  const rows = await q(`SELECT key, value FROM app_settings`);
  return mergeSettings(rows.rows);
}

export async function saveSettings(patch, actorId = null) {
  const current = await getSettings();
  const next = {
    announcement: { ...current.announcement, ...(patch.announcement ?? {}) },
    registration: { ...current.registration, ...(patch.registration ?? {}) },
  };
  const upsert = async (key, value) => {
    await q(
      `INSERT INTO app_settings (key, value, updated_at, updated_by)
       VALUES ($1, $2::jsonb, now(), $3)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by`,
      [key, JSON.stringify(value), actorId]
    );
  };
  await upsert("announcement", next.announcement);
  await upsert("registration", next.registration);
  return next;
}
