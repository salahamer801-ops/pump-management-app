/**
 * مسارات تيليجرام: الربط والتحقّق من الرقم (مجاني بالكامل) + استقبال ردود البوت.
 *
 * الأمان:
 *  - الـwebhook عام لكنه لا يُقبل إلا بترويسة تيليجرام السرّية (مقارنة زمنية ثابتة).
 *  - الربط يحتاج جلسة دخول: الرمز لا يُطلب إلا من داخل حسابك.
 *  - حساب تيليجرام واحد لا يُربط بحسابين (فهرس فريد على chat_id).
 */
import { Router } from "express";
import { q } from "../db.js";
import { logAudit } from "../audit.js";
import {
  badRequest,
  conflict,
  requireAdmin,
  requireAuth,
  wrap,
} from "../http.js";
import { maskPhone, rateLimit, sha256 } from "../security.js";
import { getSettings } from "../settings.js";
import {
  askForPhone,
  botInfo,
  connectionStatus,
  deepLink,
  ensureWebhook,
  isConfigured,
  secretMatches,
  sendHelp,
  sendLinkedResult,
  sendText,
  webhookSecret,
} from "../telegram.js";
import {
  BAD_LINK_CODE,
  CHAT_TAKEN,
  NO_ACCOUNT_CHAT,
  contactPhone,
  isValidLinkCode,
  newLinkCode,
  samePhone,
  startPayload,
} from "../telegram-payload.js";

export const telegramRouter = Router();

const LINK_MINUTES = 15;

/* ------------------------------- الربط (بجلسة) ------------------------------- */

telegramRouter.post(
  "/link",
  requireAuth,
  wrap(async (req, res) => {
    if (!isConfigured()) {
      throw badRequest(
        "التحقّق عبر تيليجرام غير مُهيّأ بعد — يُضيفه مسؤول النظام مجانًا.",
        "telegram_not_configured"
      );
    }
    if (!rateLimit(`tg-link:${req.user.id}`, { limit: 5, windowMs: 60 * 60 * 1000 })) {
      throw conflict("محاولات كثيرة — حاول بعد قليل.", "rate_limited");
    }

    await q(
      `UPDATE telegram_links SET status = 'expired', updated_at = now()
        WHERE user_id = $1 AND status = 'pending'`,
      [req.user.id]
    );

    const code = newLinkCode();
    await q(
      `INSERT INTO telegram_links (user_id, link_code_hash, expires_at)
       VALUES ($1, $2, now() + interval '${LINK_MINUTES} minutes')`,
      [req.user.id, sha256(code)]
    );

    const url = await deepLink(code);
    if (!url) throw badRequest("تعذّر الحصول على رابط البوت — حاول لاحقًا.", "telegram_unavailable");

    await logAudit(req, {
      action: "telegram.link_request",
      entityType: "user",
      entityId: req.user.id,
      metadata: { entityLabel: req.user.name },
    });

    res.json({ ok: true, code, deepLink: url, expiresInMinutes: LINK_MINUTES });
  })
);

telegramRouter.get(
  "/status",
  requireAuth,
  wrap(async (req, res) => {
    const info = await botInfo();
    const settings = await getSettings();
    const row = await q(
      `SELECT telegram_chat_id, telegram_username, telegram_linked_at, phone_verified_at, telegram_alerts
         FROM users WHERE id = $1`,
      [req.user.id]
    );
    const user = row.rows[0] ?? {};
    res.json({
      configured: isConfigured() && Boolean(info.username),
      botUsername: info.username ?? "",
      linked: Boolean(user.telegram_chat_id),
      verified: Boolean(user.phone_verified_at),
      verifiedAt: user.phone_verified_at ?? null,
      linkedAt: user.telegram_linked_at ?? null,
      username: user.telegram_username ?? "",
      alerts: user.telegram_alerts !== false,
      prompt: Boolean(settings.verification?.promptUnverified),
      phoneMasked: maskPhone(req.userRow?.phone ?? req.user.phone),
    });
  })
);

telegramRouter.delete(
  "/link",
  requireAuth,
  wrap(async (req, res) => {
    await q(
      `UPDATE telegram_links SET status = 'expired', updated_at = now()
        WHERE user_id = $1 AND status IN ('pending','awaiting_phone')`,
      [req.user.id]
    );
    await q(
      `UPDATE users SET telegram_chat_id = NULL, telegram_username = '', telegram_linked_at = NULL,
              updated_at = now()
        WHERE id = $1`,
      [req.user.id]
    );
    await logAudit(req, {
      action: "telegram.unlink",
      entityType: "user",
      entityId: req.user.id,
      metadata: { entityLabel: req.user.name, note: "أُبقي وسم التحقّق السابق كما هو" },
    });
    res.json({ ok: true, message: "تم إلغاء ربط تيليجرام." });
  })
);

telegramRouter.patch(
  "/alerts",
  requireAuth,
  wrap(async (req, res) => {
    const alerts = Boolean(req.body?.alerts);
    await q(`UPDATE users SET telegram_alerts = $1, updated_at = now() WHERE id = $2`, [
      alerts,
      req.user.id,
    ]);
    res.json({ ok: true, alerts });
  })
);

/* ------------------------------ لوحة المسؤول ------------------------------ */

telegramRouter.get(
  "/admin/status",
  requireAuth,
  requireAdmin,
  wrap(async (_req, res) => {
    const status = await connectionStatus();
    const counts = await q(
      `SELECT
         (SELECT count(*)::int FROM otp_codes WHERE created_at > now() - interval '1 day') AS day_count,
         (SELECT count(*)::int FROM otp_codes WHERE created_at > now() - interval '30 days') AS month_count,
         (SELECT count(*)::int FROM users WHERE telegram_chat_id IS NOT NULL) AS linked_users,
         (SELECT count(*)::int FROM users WHERE phone_verified_at IS NOT NULL) AS verified_users,
         (SELECT count(*)::int FROM users) AS total_users`
    );
    const recent = await q(
      `SELECT id, purpose, channel, status, delivery_status, attempts, created_at, phone
         FROM otp_codes ORDER BY created_at DESC LIMIT 20`
    );
    const settings = await getSettings();
    res.json({
      status,
      counts: counts.rows[0],
      settings: settings.verification,
      recent: recent.rows.map((r) => ({
        id: r.id,
        purpose: r.purpose,
        channel: r.channel,
        status: r.status,
        deliveryStatus: r.delivery_status,
        attempts: r.attempts,
        createdAt: r.created_at,
        phoneMasked: maskPhone(r.phone),
      })),
    });
  })
);

telegramRouter.post(
  "/admin/webhook",
  requireAuth,
  requireAdmin,
  wrap(async (req, res) => {
    /* زر اللوحة: تثبيت صريح بلا شروط */
    const result = await ensureWebhook({ force: true });
    await logAudit(req, {
      action: "telegram.webhook_setup",
      entityType: "settings",
      entityId: "telegram",
      actorRole: "admin",
      source: "admin_panel",
      metadata: { ok: Boolean(result.ok), error: result.error ?? "" },
    });
    if (!result.ok) throw badRequest(`تعذّر تثبيت الاتصال: ${result.error}`, "webhook_failed");
    res.json({ ok: true, url: result.url });
  })
);

/** إرسال رسالة تجريبية إلى محادثة المسؤول نفسه (للتأكد أن كل شيء يعمل) */
telegramRouter.post(
  "/admin/test",
  requireAuth,
  requireAdmin,
  wrap(async (req, res) => {
    const row = await q(`SELECT telegram_chat_id FROM users WHERE id = $1`, [req.user.id]);
    const chatId = row.rows[0]?.telegram_chat_id;
    if (!chatId) {
      throw badRequest(
        "اربط تيليجرام بحسابك أولًا من «تحقّق من رقمي» ثم أعد المحاولة.",
        "telegram_not_linked"
      );
    }
    const sent = await sendText(
      chatId,
      "✅ <b>رسالة تجريبية</b>\nإن وصلتك هذه الرسالة فالاتصال بتيليجرام يعمل — والإرسال مجاني بالكامل."
    );
    if (!sent.ok) throw badRequest(`تعذّر الإرسال: ${sent.error}`, "send_failed");
    res.json({ ok: true });
  })
);

/* --------------------------- استقبال ردود البوت --------------------------- */

/** يربط المحادثة بحساب صاحب رمز الربط */
async function handleStart(chatId, from, code) {
  if (!isValidLinkCode(code)) {
    await sendText(chatId, BAD_LINK_CODE);
    await sendHelp(chatId);
    return;
  }
  const found = await q(
    `SELECT * FROM telegram_links
      WHERE link_code_hash = $1 AND status = 'pending' AND expires_at > now()
      ORDER BY created_at DESC LIMIT 1`,
    [sha256(code)]
  );
  const link = found.rows[0];
  if (!link) {
    await sendText(chatId, BAD_LINK_CODE);
    return;
  }
  const owner = await q(`SELECT * FROM users WHERE id = $1`, [link.user_id]);
  const user = owner.rows[0];
  if (!user) {
    await sendText(chatId, NO_ACCOUNT_CHAT);
    return;
  }
  const taken = await q(
    `SELECT id FROM users WHERE telegram_chat_id = $1 AND id <> $2 LIMIT 1`,
    [String(chatId), user.id]
  );
  if (taken.rowCount > 0) {
    await sendText(chatId, CHAT_TAKEN);
    return;
  }

  await q(
    `UPDATE users SET telegram_chat_id = $1, telegram_username = $2, telegram_linked_at = now(),
            updated_at = now()
      WHERE id = $3`,
    [String(chatId), String(from?.username ?? "").slice(0, 60), user.id]
  );
  await q(`UPDATE telegram_links SET chat_id = $1, username = $2, status = 'awaiting_phone', updated_at = now() WHERE id = $3`, [
    String(chatId),
    String(from?.username ?? "").slice(0, 60),
    link.id,
  ]);

  if (user.phone_verified_at) {
    await sendText(chatId, "تم التحقّق من حسابك مسبقًا ✅ — ولكنه مرتبط الآن بهذه المحادثة.");
    return;
  }
  await askForPhone(chatId);
}

/** يتحقّق من الرقم المُشارَك من تيليجرام نفسه ويوسم الحساب */
async function handleContact(req, chatId, phone) {
  const found = await q(`SELECT * FROM users WHERE telegram_chat_id = $1 LIMIT 1`, [String(chatId)]);
  const user = found.rows[0];
  if (!user) {
    await sendText(chatId, NO_ACCOUNT_CHAT);
    return;
  }
  const matched = samePhone(phone, user.phone);
  if (matched) {
    await q(`UPDATE users SET phone_verified_at = now(), updated_at = now() WHERE id = $1`, [user.id]);
  }
  await q(
    `UPDATE telegram_links
        SET shared_phone = $1, status = $2, linked_at = now(), updated_at = now()
      WHERE user_id = $3 AND status = 'awaiting_phone'`,
    [maskPhone(phone), matched ? "linked" : "mismatch", user.id]
  );
  await sendLinkedResult(chatId, {
    matched,
    accountName: String(user.name ?? "").slice(0, 60),
    maskedPhone: maskPhone(user.phone),
  });
  await logAudit(req, {
    actorId: user.id,
    actorName: user.name,
    actorRole: user.account_type,
    action: matched ? "telegram.verified" : "telegram.verify_mismatch",
    entityType: "user",
    entityId: user.id,
    source: "telegram",
    metadata: { entityLabel: user.name, phone: maskPhone(phone), chat: String(chatId).slice(0, 20) },
  });
}

async function processUpdate(req, update) {
  const message = update?.message;
  if (!message) return;
  const chatId = message.chat?.id;
  if (!chatId) return;

  const phone = contactPhone(message);
  if (phone) {
    await handleContact(req, chatId, phone);
    return;
  }

  const payload = startPayload(message.text);
  if (payload !== null) {
    if (!payload) await sendHelp(chatId);
    else await handleStart(chatId, message.from, payload);
    return;
  }

  await sendHelp(chatId);
}

telegramRouter.post(
  "/webhook",
  wrap(async (req, res) => {
    const expected = await webhookSecret();
    const given = req.headers["x-telegram-bot-api-secret-token"];
    if (!secretMatches(given, expected)) {
      /* لا نكشف السبب: أي طلب غير موقَّع لا يُعالج */
      return res.status(401).json({ ok: false });
    }
    try {
      await processUpdate(req, req.body);
    } catch (err) {
      console.error("[telegram] تعذّر معالجة تحديث:", err.message);
    }
    res.json({ ok: true });
  })
);
