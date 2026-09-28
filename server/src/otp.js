/**
 * منطق رموز التحقّق (OTP) — قاعدة البيانات والإرسال المجاني عبر تيليجرام.
 *
 * قاعدة الأمان: الرمز يُخزَّن مُشفَّرًا (SHA-256) ولا يُقرأ من القاعدة، ويُستهلك مرة واحدة،
 * وبعد نجاح التحقّق تُصدر «تذكرة» قصيرة العمر لتعيين كلمة المرور — فلا يُعاد استخدام الرمز.
 */
import { q } from "./db.js";
import { badRequest, conflict } from "./http.js";
import { getSettings } from "./settings.js";
import { clientIp, rateLimit, sha256 } from "./security.js";
import { sendOtp } from "./telegram.js";
import {
  MAX_ATTEMPTS,
  OTP_MINUTES,

  SCREEN_WARNING,
  TICKET_MINUTES,
  codeShapeProblem,
  cooldownLeft,
  dailyLimitHit,
  newOtpCode,
  newTicket,
} from "./otp-payload.js";

export { codeShapeProblem, SCREEN_WARNING };

/** هل الحساب مربوط بتيليجرام وجاهز لاستقبال الرمز؟ */
export function telegramReady(user, settings, configured) {
  return Boolean(
    settings?.verification?.otpOnTelegram !== false &&
      configured &&
      user?.telegram_chat_id
  );
}

/** آخر رمز أُرسل لنفس الحساب (أي قناة) — لمهلة إعادة الإرسال */
async function lastSentRow(userId, purpose) {
  const res = await q(
    `SELECT created_at FROM otp_codes
      WHERE user_id = $1 AND purpose = $2
      ORDER BY created_at DESC LIMIT 1`,
    [userId, purpose]
  );
  return res.rows[0]?.created_at ?? null;
}

async function sentToday() {
  const res = await q(
    `SELECT count(*)::int AS n FROM otp_codes WHERE created_at > now() - interval '1 day'`
  );
  return res.rows[0]?.n ?? 0;
}

/**
 * إرسال رمز تحقّق لحساب.
 * يعيد: { channel: "telegram" | "screen", code?, messageId?, warning? }
 * ويرفع خطأ واضحًا إن تعذّر الإرسال أو بلغنا الحدود.
 */
export async function issueOtp({ user, purpose = "reset", req = null, telegramConfigured }) {
  const settings = await getSettings();
  const cooldown = cooldownLeft(await lastSentRow(user.id, purpose));
  if (cooldown > 0) {
    throw conflict(`انتظر ${cooldown} ثانية قبل طلب رمز جديد.`, "cooldown");
  }
  if (dailyLimitHit(await sentToday(), settings.verification?.dailyLimit)) {
    throw conflict("بلغنا الحد اليومي لرموز التحقّق — حاول غدًا أو تواصل مع مسؤول النظام.", "daily_limit");
  }

  /* الرمز السابق يُلغى فورًا: رمز واحد صالح في كل مرة */
  await q(
    `UPDATE otp_codes SET used_at = now(), status = 'superseded'
      WHERE user_id = $1 AND purpose = $2 AND used_at IS NULL AND verified_at IS NULL`,
    [user.id, purpose]
  );

  const code = newOtpCode();
  const useTelegram = telegramReady(user, settings, telegramConfigured);
  const ip = clientIp(req) || "";

  const inserted = await q(
    `INSERT INTO otp_codes (user_id, phone, purpose, channel, code_hash, expires_at, ip)
     VALUES ($1, $2, $3, $4, $5, now() + interval '${OTP_MINUTES} minutes', $6)
     RETURNING id`,
    [user.id, user.phone, purpose, useTelegram ? "telegram" : "screen", sha256(code), ip.slice(0, 60)]
  );
  const rowId = inserted.rows[0].id;

  if (!useTelegram) {
    return { id: rowId, channel: "screen", code, warning: SCREEN_WARNING, expiresInMinutes: OTP_MINUTES };
  }

  const sent = await sendOtp(user.telegram_chat_id, code, purpose);
  if (!sent.ok) {
    /* فشل الإرسال لا يحجب المستخدم: نعود للوضع البديل مع تسجيل الحالة */
    await q(
      `UPDATE otp_codes SET channel = 'screen', status = 'failed', delivery_status = $2 WHERE id = $1`,
      [rowId, String(sent.error ?? "send_failed").slice(0, 60)]
    );
    return {
      id: rowId,
      channel: "screen",
      code,
      warning: "تعذّر إرسال الرمز على تيليجرام الآن، لذلك ظهر هنا.",
      expiresInMinutes: OTP_MINUTES,
    };
  }

  await q(
    `UPDATE otp_codes SET provider_message_id = $2, delivery_status = 'sent' WHERE id = $1`,
    [rowId, String(sent.messageId ?? "").slice(0, 40)]
  );
  return { id: rowId, channel: "telegram", expiresInMinutes: OTP_MINUTES };
}

/** التحقّق من الرمز وإصدار تذكرة قصيرة الاستخدام */
export async function verifyOtp({ user, code, purpose = "reset" }) {
  const problem = codeShapeProblem(code);
  if (problem) throw badRequest(problem, "bad_code_shape");

  const res = await q(
    `SELECT * FROM otp_codes
      WHERE user_id = $1 AND purpose = $2 AND used_at IS NULL AND verified_at IS NULL
        AND expires_at > now() AND attempts < ${MAX_ATTEMPTS}
      ORDER BY created_at DESC LIMIT 1`,
    [user.id, purpose]
  );
  const row = res.rows[0];
  if (!row) throw badRequest("الرمز غير صحيح أو انتهت صلاحيته — اطلب رمزًا جديدًا.", "bad_code");

  if (row.code_hash !== sha256(String(code).trim())) {
    await q(`UPDATE otp_codes SET attempts = attempts + 1, status = 'wrong_code' WHERE id = $1`, [row.id]);
    const left = Math.max(0, MAX_ATTEMPTS - (row.attempts + 1));
    throw badRequest(
      left > 0 ? `الرمز غير صحيح — بقي ${left} محاولة.` : "الرمز غير صحيح — اطلب رمزًا جديدًا.",
      "bad_code"
    );
  }

  const ticket = newTicket();
  await q(
    `UPDATE otp_codes
        SET verified_at = now(), status = 'verified', ticket_hash = $2,
            ticket_expires_at = now() + interval '${TICKET_MINUTES} minutes'
      WHERE id = $1`,
    [row.id, sha256(ticket)]
  );
  return { ticket, expiresInMinutes: TICKET_MINUTES, channel: row.channel };
}

/** استهلاك التذكرة عند تعيين كلمة المرور (مرة واحدة فقط) */
export async function redeemTicket(userId, ticket) {
  const value = String(ticket ?? "").trim();
  if (value.length < 20) throw badRequest("انتهت صلاحية التحقّق — أعد المحاولة من البداية.", "bad_ticket");
  const res = await q(
    `UPDATE otp_codes SET used_at = now(), status = 'used'
      WHERE user_id = $1 AND ticket_hash = $2 AND verified_at IS NOT NULL AND used_at IS NULL
        AND ticket_expires_at > now()
      RETURNING id`,
    [userId, sha256(value)]
  );
  if (res.rowCount === 0) {
    throw badRequest("انتهت صلاحية التحقّق — أعد المحاولة من البداية.", "bad_ticket");
  }
  return true;
}

/** حدود إضافية على مسارات الرموز (لكل عنوان شبكة) */
export function otpRateLimit(req, action, limit, windowMs) {
  const ip = clientIp(req) || "unknown";
  return rateLimit(`${action}:ip:${ip}`, { limit, windowMs });
}
