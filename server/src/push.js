/**
 * الإشعارات الفورية (Web Push) — إخطار جوال المساهم لحظة حفظ المسؤول لتعديل.
 *
 * القواعد:
 *  - لا مهام مجدولة ولا إرسال بتوقيت: الإرسال يحدث داخل الطلب الوارد نفسه
 *    (حفظ المسؤول) — فإن لم يعدل المسؤول شيئًا فلا إشعارات أصلًا.
 *  - مفاتيح VAPID تُولَّد مرة واحدة لهذا المشروع وتُحفظ في قاعدة بياناته
 *    (جدول app_settings) — لا تُكتب في الكود ولا في المستودع.
 *  - فشل الإرسال لا يُفشل أي طلب: الاشتراكات الميتة (404/410) تُنظَّف وتُتجاهل.
 */
import webpush from "web-push";
import { q } from "./db.js";
import { newNotifications, pushEndpointProblem } from "./push-payload.js";

/* الدوال الخالصة مُعادة التصدير من وحدة قابلة للاختبار بلا مكتبات */
export { newNotifications, pushEndpointProblem };

const SETTINGS_KEY = "webpush_vapid";

let cached = null;

/** مفاتيح VAPID لهذا المشروع (تُولَّد مرة واحدة وتُحفظ في القاعدة) */
export async function getVapidKeys() {
  if (cached) return cached;
  const existing = await q(`SELECT value FROM app_settings WHERE key = $1`, [SETTINGS_KEY]);
  const value = existing.rows[0]?.value;
  if (value && typeof value.publicKey === "string" && typeof value.privateKey === "string") {
    cached = { publicKey: value.publicKey, privateKey: value.privateKey };
    return cached;
  }

  const generated = webpush.generateVAPIDKeys();
  /* ON CONFLICT: إن ولّدها طلب آخر في اللحظة نفسها نأخذ المحفوظ (مصدر واحد) */
  await q(
    `INSERT INTO app_settings (key, value, updated_at) VALUES ($1, $2::jsonb, now())
     ON CONFLICT (key) DO NOTHING`,
    [SETTINGS_KEY, JSON.stringify({ publicKey: generated.publicKey, privateKey: generated.privateKey })]
  );
  const saved = await q(`SELECT value FROM app_settings WHERE key = $1`, [SETTINGS_KEY]);
  const row = saved.rows[0]?.value;
  cached = { publicKey: String(row?.publicKey ?? generated.publicKey), privateKey: String(row?.privateKey ?? generated.privateKey) };
  return cached;
}

export async function getPublicKey() {
  const keys = await getVapidKeys();
  return keys.publicKey;
}

function configure(keys) {
  webpush.setVapidDetails("mailto:support@mythex.ai", keys.publicKey, keys.privateKey);
}

/** حفظ اشتراك جهاز المستخدم على هذه المضخة (نفس الجهاز يُحدَّث لا يُكرَّر) */
export async function saveSubscription(pumpId, userId, subscription) {
  const endpoint = String(subscription?.endpoint ?? "").slice(0, 600);
  const p256dh = String(subscription?.keys?.p256dh ?? "").slice(0, 300);
  const auth = String(subscription?.keys?.auth ?? "").slice(0, 300);
  if (!endpoint || !p256dh || !auth) return false;
  if (pushEndpointProblem(endpoint)) return false;

  await q(
    `INSERT INTO push_subscriptions (pump_id, user_id, endpoint, p256dh, auth, updated_at)
     VALUES ($1, $2, $3, $4, $5, now())
     ON CONFLICT (endpoint) DO UPDATE
       SET pump_id = EXCLUDED.pump_id, user_id = EXCLUDED.user_id,
           p256dh = EXCLUDED.p256dh, auth = EXCLUDED.auth,
           failures = 0, updated_at = now()`,
    [pumpId, userId, endpoint, p256dh, auth]
  );
  return true;
}

export async function removeSubscription(userId, endpoint) {
  if (endpoint) {
    await q(`DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2`, [userId, endpoint]);
    return;
  }
  /* بلا نقطة نهاية: إلغاء كل اشتراكات هذا المستخدم على المضخة */
  await q(`DELETE FROM push_subscriptions WHERE user_id = $1`, [userId]);
}

async function dropSubscription(endpoint) {
  try {
    await q(`DELETE FROM push_subscriptions WHERE endpoint = $1`, [endpoint]);
  } catch {
    /* ignore */
  }
}

async function bumpFailure(endpoint) {
  try {
    await q(`UPDATE push_subscriptions SET failures = failures + 1 WHERE endpoint = $1`, [endpoint]);
  } catch {
    /* ignore */
  }
}

/**
 * إرسال إشعار لحساب مستخدم بعينه (كل أجهزته المشتركة في أي مضخة).
 * يُستخدم لتنبيه صاحب الحساب عند طلب استعادة كلمة المرور مثلًا.
 */
export async function notifyUser(userId, payload) {
  let keys;
  let list;
  try {
    keys = await getVapidKeys();
    list = await q(
      `SELECT DISTINCT ON (endpoint) endpoint, p256dh, auth FROM push_subscriptions
       WHERE user_id = $1 ORDER BY endpoint, updated_at DESC LIMIT 50`,
      [userId]
    );
  } catch {
    return { sent: 0, failed: 0 };
  }
  if (!list.rows.length) return { sent: 0, failed: 0 };

  configure(keys);
  const body = JSON.stringify(payload);
  let sent = 0;
  let failed = 0;
  await Promise.allSettled(
    list.rows.map(async (row) => {
      try {
        await webpush.sendNotification(
          { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
          body,
          { TTL: 3600, urgency: "high" }
        );
        sent += 1;
      } catch (err) {
        failed += 1;
        const code = err?.statusCode;
        if (code === 404 || code === 410) await dropSubscription(row.endpoint);
        else await bumpFailure(row.endpoint);
      }
    })
  );
  return { sent, failed };
}

/** إرسال إشعار لمساهمي المضخة (بلا المُرسِل نفسه) — يفشل بهدوء ولا يُعطّل الحفظ */
export async function notifyPumpMembers(pumpId, payload, exceptUserId) {
  let keys;
  let list;
  try {
    keys = await getVapidKeys();
    list = await q(
      `SELECT DISTINCT ON (endpoint) endpoint, p256dh, auth FROM push_subscriptions
       WHERE pump_id = $1 AND ($2::uuid IS NULL OR user_id <> $2::uuid)
       ORDER BY endpoint, updated_at DESC
       LIMIT 200`,
      [pumpId, exceptUserId ?? null]
    );
  } catch {
    return { sent: 0, failed: 0 };
  }
  if (!list.rows.length) return { sent: 0, failed: 0 };

  configure(keys);
  const body = JSON.stringify(payload);
  let sent = 0;
  let failed = 0;

  await Promise.allSettled(
    list.rows.map(async (row) => {
      try {
        await webpush.sendNotification(
          { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
          body,
          { TTL: 3600, urgency: payload.level === "danger" ? "high" : "normal" }
        );
        sent += 1;
      } catch (err) {
        failed += 1;
        const code = err?.statusCode;
        if (code === 404 || code === 410) await dropSubscription(row.endpoint);
        else await bumpFailure(row.endpoint);
      }
    })
  );

  return { sent, failed };
}
