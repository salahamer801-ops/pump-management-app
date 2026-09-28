/**
 * تيليجرام — قناة التحقّق المجانية (لا مزوّد مدفوع، لا رسوم لكل رسالة).
 *
 * لماذا تعمل مع استضافة تنام عند الخمول:
 *  - الإرسال طلب HTTPS واحد أثناء طلب المستخدم (بلا مهام مجدولة).
 *  - استقبال ردود المستخدم عبر webhook (طلب وارد يُوقظ الخادم).
 *
 * ولا يوجد أي رقم أو رابط مكتوب في الكود: اسم البوت يُقرأ من تيليجرام ويُحفظ في الإعدادات،
 * ورابط الـwebhook يُبنى من عنوان التطبيق الذي توفّره المنصة وقت التشغيل.
 */
import { randomBytes, timingSafeEqual } from "node:crypto";
import { q } from "./db.js";
import {
  ASK_PHONE_MESSAGE,
  HELP_MESSAGE,
  LINKED_ALREADY,
  WELCOME_MESSAGE,
  linkedMessage,
  otpMessage,
  passwordChangedMessage,
  removeKeyboard,
  sharePhoneKeyboard,
  startPayload,
} from "./telegram-payload.js";

export { startPayload, ASK_PHONE_MESSAGE, WELCOME_MESSAGE, HELP_MESSAGE, LINKED_ALREADY };

const API = "https://api.telegram.org";
const TIMEOUT_MS = 9000;

export const botToken = () => String(process.env.TELEGRAM_BOT_TOKEN ?? "").trim();

/** جاهز فقط عند وجود توكن صالح — وإلا يعمل التطبيق بالوضع البديل بلا أي إرسال */
export const isConfigured = () => botToken().length >= 25;

let cachedUsername = null;
let cachedSecret = null;

function keepSetting(key, value) {
  return q(
    `INSERT INTO app_settings (key, value, updated_at) VALUES ($1, $2::jsonb, now())
     ON CONFLICT (key) DO NOTHING`,
    [key, JSON.stringify(value)]
  );
}

function readSetting(key) {
  return q(`SELECT value FROM app_settings WHERE key = $1`, [key]);
}

/** نداء واحد إلى Bot API — بلا إعادة محاولة حتى لا تتكرّر الرسالة على المستخدم */
async function tgCall(method, payload = {}) {
  if (!isConfigured()) return { ok: false, error: "not_configured" };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${API}/bot${botToken()}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.ok) {
      /* لا نطبع التوكن ولا نصوص الطلبات — رسالة تيليجرام نفسها فقط */
      return { ok: false, error: String(json?.description ?? `http_${res.status}`).slice(0, 200) };
    }
    return { ok: true, result: json.result };
  } catch (err) {
    const error = err?.name === "AbortError" ? "timeout" : "network";
    console.error(`[telegram] تعذّر ${method}:`, error);
    return { ok: false, error };
  } finally {
    clearTimeout(timer);
  }
}

/** معلومات البوت (الاسم واليوزر) — تُحفظ مرة واحدة لبناء الرابط المباشر */
export async function botInfo() {
  if (!isConfigured()) return { configured: false };
  if (cachedUsername) return { configured: true, username: cachedUsername };
  const stored = await readSetting("telegram");
  if (stored.rowCount && stored.rows[0].value?.username) {
    cachedUsername = String(stored.rows[0].value.username);
    return { configured: true, username: cachedUsername };
  }
  const me = await tgCall("getMe");
  if (!me.ok) return { configured: false, error: me.error };
  cachedUsername = String(me.result?.username ?? "");
  if (cachedUsername) {
    await keepSetting("telegram", { username: cachedUsername, savedAt: new Date().toISOString() });
  }
  return { configured: Boolean(cachedUsername), username: cachedUsername };
}

/** سرّ الـwebhook: من البيئة إن وُجد، وإلا يُولَّد مرة واحدة ويُحفظ */
export async function webhookSecret() {
  const fromEnv = String(process.env.TELEGRAM_WEBHOOK_SECRET ?? "").trim();
  if (fromEnv) return fromEnv;
  if (cachedSecret) return cachedSecret;
  const stored = await readSetting("telegram_webhook");
  if (stored.rowCount && stored.rows[0].value?.secret) {
    cachedSecret = String(stored.rows[0].value.secret);
    return cachedSecret;
  }
  const secret = randomBytes(24).toString("base64url");
  await keepSetting("telegram_webhook", { secret, savedAt: new Date().toISOString() });
  const again = await readSetting("telegram_webhook");
  cachedSecret = String(again.rows[0]?.value?.secret ?? secret);
  return cachedSecret;
}

/** مقارنة ترويسة تيليجرام بمقارنة زمنية ثابتة */
export function secretMatches(given, expected) {
  const a = Buffer.from(String(given ?? ""));
  const b = Buffer.from(String(expected ?? ""));
  return a.length > 0 && a.length === b.length && timingSafeEqual(a, b);
}

/** رابط البوت المباشر لرمز ربط */
export async function deepLink(code) {
  const info = await botInfo();
  if (!info.username) return null;
  return `https://t.me/${info.username}?start=${encodeURIComponent(code)}`;
}

/**
 * أصل الموقع العام — **من البيئة فقط، ولا يُكتب أي نطاق في الكود** (يمكن ربط دومين في أي وقت).
 *  - Mythex: MYTHEX_WEB_ORIGIN
 *  - Railway: RAILWAY_PUBLIC_DOMAIN أو RAILWAY_STATIC_URL (يوفّرهما المزوّد تلقائيًا)
 *  - أي استضافة أخرى: PUBLIC_ORIGIN
 */
export function publicOrigin() {
  const explicit = String(process.env.MYTHEX_WEB_ORIGIN ?? process.env.PUBLIC_ORIGIN ?? "")
    .trim()
    .replace(/\/+$/, "");
  if (/^https:\/\//i.test(explicit)) return explicit;

  const railway = String(process.env.RAILWAY_PUBLIC_DOMAIN ?? process.env.RAILWAY_STATIC_URL ?? "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/, "");
  if (railway && !railway.includes(" ")) return `https://${railway}`;

  return "";
}

/**
 * عنوان مولَّد من المنصة (معاينة مؤقتة) — نميّزه بجزئه الأول العشوائي الطويل.
 * لا نعلّق البوت على عنوان مؤقت: لو انتهت المعاينة توقّف البوت عن الرد بلا سبب ظاهر.
 */
const EPHEMERAL_HOST = /^[a-z0-9]{20,}\./i;

function hostOf(url) {
  return String(url ?? "")
    .replace(/^https?:\/\//i, "")
    .split("/")[0]
    .toLowerCase();
}

export function isEphemeralOrigin(origin) {
  return EPHEMERAL_HOST.test(hostOf(origin));
}

/**
 * يُثبّت الـwebhook على عنوان التطبيق الحقيقي (يُستدعى عند الإقلاع وبطلب من اللوحة).
 * القواعد (بلا كتابة أي نطاق في الكود):
 *  - عنوان المعاينة المؤقتة: لا يُثبَّت عليه تلقائيًا حتى لا يخطف الاتصال من الموقع المنشور.
 *  - عنوان ثابت: يُثبَّت إن لم يكن هناك اتصال، أو كان الاتصال عليه، أو كان الاتصال مثبَّتًا
 *    على عنوان معاينة مؤقتة (فيستعيده الموقع الحقيقي). ولا يُسرق اتصال عنوان ثابت آخر.
 *  - الزر اليدوي في اللوحة يثبّت دائمًا (force).
 */
export async function ensureWebhook({ force = false } = {}) {
  if (!isConfigured()) return { ok: false, error: "not_configured" };
  const origin = publicOrigin();
  if (!/^https:\/\//.test(origin)) return { ok: false, error: "no_public_origin" };

  if (!force) {
    const info = await tgCall("getWebhookInfo");
    const installed = info.ok ? String(info.result?.url ?? "") : "";
    if (isEphemeralOrigin(origin)) {
      return { ok: false, error: "ephemeral_origin", current: installed };
    }
    if (installed && !installed.startsWith(`${origin}/`) && !isEphemeralOrigin(installed)) {
      return { ok: false, error: "other_origin", current: installed };
    }
  }

  const secret = await webhookSecret();
  const url = `${origin}/api/telegram/webhook`;
  const res = await tgCall("setWebhook", {
    url,
    secret_token: secret,
    allowed_updates: ["message"],
    drop_pending_updates: true,
  });
  return res.ok ? { ok: true, url } : { ok: false, error: res.error };
}

/** حالة الاتصال للوحة المسؤول (بلا كشف أي سرّ) */
export async function connectionStatus() {
  if (!isConfigured()) return { configured: false, state: "off" };
  const info = await botInfo();
  const hook = await tgCall("getWebhookInfo");
  const site = publicOrigin();
  const installed = hook.ok ? String(hook.result?.url ?? "") : "";
  return {
    configured: Boolean(info.username),
    state: info.username ? "ready" : "error",
    username: info.username ?? "",
    webhook: installed,
    webhookError: hook.ok ? String(hook.result?.last_error_message ?? "") : String(hook.error ?? ""),
    pending: hook.ok ? Number(hook.result?.pending_update_count ?? 0) : 0,
    /* عنوان هذا الموقع + هل الاتصال مثبَّت على عنوان آخر (تحذير في اللوحة) */
    site,
    otherSite: Boolean(installed && site && hostOf(installed) !== hostOf(site)),
  };
}

/* ------------------------------ الإرسال ------------------------------ */

export const sendText = (chatId, text, extra = {}) =>
  tgCall("sendMessage", { chat_id: chatId, text, parse_mode: "HTML", ...extra });

export const sendWelcome = (chatId) =>
  sendText(chatId, WELCOME_MESSAGE, { reply_markup: sharePhoneKeyboard() });

export const askForPhone = (chatId) =>
  sendText(chatId, ASK_PHONE_MESSAGE, { reply_markup: sharePhoneKeyboard() });

export const sendHelp = (chatId) =>
  sendText(chatId, HELP_MESSAGE, { reply_markup: removeKeyboard() });

export const alreadyLinked = (chatId) => sendText(chatId, LINKED_ALREADY);

export const sendLinkedResult = (chatId, info) =>
  sendText(chatId, linkedMessage(info), { reply_markup: removeKeyboard() });

/** رمز التحقّق — يُرسل فقط لمحادثة مربوطة بحساب */
export async function sendOtp(chatId, code, purpose) {
  const res = await sendText(chatId, otpMessage(code, purpose));
  return res.ok
    ? { ok: true, messageId: String(res.result?.message_id ?? "").slice(0, 40) }
    : { ok: false, error: res.error };
}

export const sendPasswordChanged = (chatId, accountName) =>
  sendText(chatId, passwordChangedMessage(accountName));

/** رسالة ترحيب أولى عند الربط برمز صحيح */
export const sendLinkWelcome = (chatId) => sendWelcome(chatId);
