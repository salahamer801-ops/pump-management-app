/** الحسابات: إنشاء، دخول، خروج، ملفي، تغيير كلمة المرور، نسيت كلمة المرور */
import { Router } from "express";
import { q, withTransaction } from "../db.js";
import { logAudit } from "../audit.js";
import {
  badRequest,
  conflict,
  forbidden,
  notFound,
  requireAuth,
  unauthorized,
  wrap,
} from "../http.js";
import {
  accountTypeProblem,
  clientIp,
  createSession,
  hashPassword,
  maskPhone,
  nameProblem,
  newResetCode,
  normalizePhone,
  passwordProblem,
  publicUser,
  rateLimit,
  revokeAllSessions,
  revokeSession,
  sha256,
  verifyPassword,
} from "../security.js";
import { isValidPhone } from "../security.js";
import { notifyUser } from "../push.js";
import { issueOtp, telegramReady, verifyOtp, redeemTicket, otpRateLimit } from "../otp.js";
import { isConfigured as telegramConfigured, sendPasswordChanged } from "../telegram.js";
import { getSettings } from "../settings.js";
import { ensureBootstrapAdmin } from "../bootstrap.js";

export const authRouter = Router();

/**
 * حدّ عام لكل عنوان شبكة على مسارات الحساب — يحمي من التخمين الموزّع
 * (كثير من الأرقام من نفس الجهاز) دون أن يضايق مستخدمي شبكة واحدة.
 */
function ipLimit(req, action, limit, windowMs) {
  const ip = clientIp(req) || "unknown";
  return rateLimit(`${action}:ip:${ip}`, { limit, windowMs });
}

const IP_LIMIT_MESSAGE = "محاولات كثيرة من هذا الاتصال — حاول بعد قليل.";

/** المضخات التي يملكها أو ينتمي إليها المستخدم — مع حالة كل علاقة */
export async function pumpsAndMemberships(userId) {
  const owned = await q(
    `SELECT p.*,
            (SELECT count(*)::int FROM pump_memberships m WHERE m.pump_id = p.id AND m.status = 'approved') AS members_count,
            (SELECT count(*)::int FROM pump_memberships m WHERE m.pump_id = p.id AND m.status = 'pending') AS pending_count
       FROM pumps p WHERE p.manager_id = $1 ORDER BY p.created_at`,
    [userId]
  );
  const joined = await q(
    `SELECT m.*, p.code AS pump_code, p.name AS pump_name, p.description AS pump_description,
            p.location AS pump_location, p.status AS pump_status, p.manager_id AS pump_manager_id,
            u.name AS manager_name,
            (SELECT count(*)::int FROM pump_memberships x WHERE x.pump_id = p.id AND x.status = 'pending') AS pending_count
       FROM pump_memberships m
       JOIN pumps p ON p.id = m.pump_id
       JOIN users u ON u.id = p.manager_id
      WHERE m.user_id = $1
      ORDER BY m.requested_at DESC`,
    [userId]
  );

  return {
    managedPumps: owned.rows.map((p) => ({
      id: p.id,
      pumpCode: p.code,
      managerId: p.manager_id,
      name: p.name,
      description: p.description,
      location: p.location,
      status: p.status,
      createdAt: p.created_at,
      membersCount: p.members_count,
      pendingCount: p.pending_count,
    })),
    memberships: joined.rows.map((m) => ({
      id: m.id,
      pumpId: m.pump_id,
      pumpCode: m.pump_code,
      pumpName: m.status === "approved" ? m.pump_name : null,
      pumpLocation: m.status === "approved" ? m.pump_location : null,
      managerName: m.status === "approved" ? m.manager_name : null,
      membershipType: m.membership_type,
      status: m.status,
      personId: m.person_id,
      personName: m.person_name,
      shareRef: m.share_ref,
      requestedAt: m.requested_at,
      approvedAt: m.approved_at,
      rejectedAt: m.rejected_at,
      rejectReason: m.reject_reason,
      removedAt: m.removed_at,
      removeReason: m.remove_reason,
    })),
  };
}

async function sessionPayload(userRow) {
  const { managedPumps, memberships } = await pumpsAndMemberships(userRow.id);
  const settings = await getSettings();
  return {
    user: publicUser(userRow),
    /* الإعلان العام يصل مع كل دخول — لا يحتاج نداءً إضافيًا */
    announcement: settings.announcement,
    managedPumps,
    memberships,
    pendingRequests: managedPumps.reduce((sum, p) => sum + p.pendingCount, 0),
  };
}

authRouter.post(
  "/register",
  wrap(async (req, res) => {
    const { name, phone, password, confirmPassword, accountType } = req.body ?? {};
    const type = accountType === "manager" ? "manager" : accountType === "user" ? "user" : null;
    if (accountTypeProblem(type)) throw badRequest("اختر نوع الحساب: مسؤول مضخة أو مستخدم.");
    if (nameProblem(name)) throw badRequest("الاسم غير صالح.");
    const cleanPhone = normalizePhone(phone);
    if (!isValidPhone(cleanPhone)) throw badRequest("رقم الهاتف غير صحيح.");
    const pwProblem = passwordProblem(password);
    if (pwProblem) throw badRequest(pwProblem);
    if (String(password) !== String(confirmPassword ?? "")) {
      throw badRequest("كلمتا المرور غير متطابقتين.", "confirm_mismatch");
    }

    const systemSettings = await getSettings();
    const registrationOpen =
      type === "manager" ? systemSettings.registration.manager : systemSettings.registration.user;
    if (!registrationOpen) {
      throw forbidden("إنشاء الحسابات متوقف حاليًا — تواصل مع مسؤول النظام.", "registration_closed");
    }

    if (!rateLimit(`register:${clientIp(req) || "ip"}`, { limit: 20, windowMs: 60 * 60 * 1000 })) {
      throw conflict("محاولات كثيرة — حاول بعد قليل.", "rate_limited");
    }
    if (!ipLimit(req, "register", 60, 60 * 60 * 1000)) throw conflict(IP_LIMIT_MESSAGE, "rate_limited");
    const existing = await q(`SELECT id FROM users WHERE phone = $1`, [cleanPhone]);
    if (existing.rowCount > 0) {
      throw conflict("رقم الهاتف مستخدم مسبقًا — سجّل الدخول أو استعد كلمة المرور.", "phone_taken");
    }

    const inserted = await q(
      `INSERT INTO users (name, phone, password_hash, account_type)
       VALUES ($1,$2,$3,$4)
       RETURNING *`,
      [String(name).trim(), cleanPhone, hashPassword(String(password)), type]
    );
    const userRow = inserted.rows[0];

    const promoted = await ensureBootstrapAdmin(userRow, req);
    if (promoted) Object.assign(userRow, promoted);

    await logAudit(req, {
      actorId: userRow.id,
      actorName: userRow.name,
      actorRole: userRow.account_type,
      action: "account.create",
      entityType: "user",
      entityId: userRow.id,
      metadata: { accountType: userRow.account_type, phone: maskPhone(cleanPhone) },
    });

    const token = await createSession(userRow.id);
    const payload = await sessionPayload(userRow);
    await logAudit(req, {
      actorId: userRow.id,
      actorName: userRow.name,
      actorRole: userRow.account_type,
      action: "auth.login",
      entityType: "session",
      entityId: userRow.id,
      metadata: { after: "register" },
    });
    res.status(201).json({ token, ...payload });
  })
);

authRouter.post(
  "/login",
  wrap(async (req, res) => {
    const { phone, password } = req.body ?? {};
    const cleanPhone = normalizePhone(phone);
    if (!isValidPhone(cleanPhone) || !password) throw badRequest("رقم الهاتف وكلمة المرور مطلوبان.");

    if (!rateLimit(`login:${cleanPhone}`, { limit: 10, windowMs: 10 * 60 * 1000 })) {
      throw new HttpError429();
    }
    /* حدّ عام للاتصال: يوقف التخمين الموزّع على أرقام كثيرة من جهاز واحد */
    if (!ipLimit(req, "login", 60, 10 * 60 * 1000)) throw new HttpError429();

    const found = await q(`SELECT * FROM users WHERE phone = $1`, [cleanPhone]);
    const userRow = found.rows[0];
    if (!userRow || !verifyPassword(String(password), userRow.password_hash)) {
      await logAudit(req, {
        action: "auth.login_failed",
        entityType: "user",
        entityId: userRow ? userRow.id : "",
        actorRole: "system",
        metadata: { phone: maskPhone(cleanPhone) },
      });
      throw unauthorized("رقم الهاتف أو كلمة المرور غير صحيحة.", "bad_credentials");
    }
    if (userRow.status !== "active") throw forbidden("الحساب موقوف — تواصل مع إدارة النظام.");

    /* أول حساب مسؤول يدخل يصبح مسؤول النظام إن لم يوجد مسؤول بعد */
    const promotedRow = await ensureBootstrapAdmin(userRow, req);
    Object.assign(userRow, promotedRow ?? {});

    await q(`UPDATE users SET last_login_at = now() WHERE id = $1`, [userRow.id]);
    const token = await createSession(userRow.id);
    await logAudit(req, {
      actorId: userRow.id,
      actorName: userRow.name,
      actorRole: userRow.account_type,
      action: "auth.login",
      entityType: "session",
      entityId: userRow.id,
    });
    const payload = await sessionPayload(userRow);
    res.json({ token, ...payload });
  })
);

function HttpError429() {
  return conflict("محاولات دخول كثيرة — انتظر قليلًا ثم حاول مجددًا.", "rate_limited");
}

authRouter.post(
  "/logout",
  requireAuth,
  wrap(async (req, res) => {
    const token = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
    await revokeSession(token);
    await logAudit(req, {
      action: "auth.logout",
      entityType: "session",
      entityId: req.sessionId,
    });
    res.json({ ok: true });
  })
);

authRouter.get(
  "/me",
  requireAuth,
  wrap(async (req, res) => {
    const row = await q(`SELECT * FROM users WHERE id = $1`, [req.user.id]);
    if (row.rowCount === 0) throw unauthorized();
    res.json(await sessionPayload(row.rows[0]));
  })
);

authRouter.patch(
  "/me",
  requireAuth,
  wrap(async (req, res) => {
    const { name } = req.body ?? {};
    if (nameProblem(name)) throw badRequest("الاسم غير صالح.");
    await q(`UPDATE users SET name = $1, updated_at = now() WHERE id = $2`, [
      String(name).trim(),
      req.user.id,
    ]);
    await logAudit(req, {
      action: "account.update",
      entityType: "user",
      entityId: req.user.id,
      metadata: { field: "name", before: req.user.name, after: String(name).trim() },
    });
    const row = await q(`SELECT * FROM users WHERE id = $1`, [req.user.id]);
    res.json(await sessionPayload(row.rows[0]));
  })
);

authRouter.post(
  "/change-password",
  requireAuth,
  wrap(async (req, res) => {
    const { currentPassword, newPassword, confirmPassword } = req.body ?? {};
    if (!rateLimit(`pw-change:${req.user.id}`, { limit: 10, windowMs: 60 * 60 * 1000 })) {
      throw conflict("محاولات كثيرة — حاول بعد قليل.", "rate_limited");
    }
    const row = await q(`SELECT * FROM users WHERE id = $1`, [req.user.id]);
    const userRow = row.rows[0];
    if (!userRow || !verifyPassword(String(currentPassword ?? ""), userRow.password_hash)) {
      throw unauthorized("كلمة المرور الحالية غير صحيحة.", "bad_current_password");
    }
    const pwProblem = passwordProblem(newPassword);
    if (pwProblem) throw badRequest(pwProblem);
    if (String(newPassword) !== String(confirmPassword ?? "")) {
      throw badRequest("كلمتا المرور غير متطابقتين.", "confirm_mismatch");
    }
    if (String(newPassword) === String(currentPassword)) {
      throw badRequest("كلمة المرور الجديدة مطابقة للحالية.");
    }
    await withTransaction(async (tx) => {
      await tx(`UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2`, [
        hashPassword(String(newPassword)),
        req.user.id,
      ]);
    });
    await revokeAllSessions(req.user.id);
    await logAudit(req, {
      action: "password.change",
      entityType: "user",
      entityId: req.user.id,
      metadata: { note: "أُلغيت كل الجلسات بعد التغيير" },
    });
    res.json({ ok: true, message: "تم تغيير كلمة المرور — سجّل الدخول من جديد." });
  })
);

/**
 * رموز التحقّق (مجانية بالكامل):
 *  - الحساب المربوط بتيليجرام: يصل الرمز إلى محادثة تيليجرام ولا يُعاد في الردّ إطلاقًا.
 *  - غير المربوط: يُطلب الاسم كما هو مسجَّل ثم يظهر الرمز على الشاشة (الوضع البديل).
 * الرمز يُخزَّن مُشفَّرًا (SHA-256)، صلاحيته 5 دقائق، 5 محاولات، ويُستهلك مرة واحدة.
 */
async function handleOtpRequest(req, res) {
  const { phone, name } = req.body ?? {};
  const cleanPhone = normalizePhone(phone);
  if (!isValidPhone(cleanPhone)) throw badRequest("رقم الهاتف غير صحيح.");
  if (!rateLimit(`forgot:${cleanPhone}`, { limit: 3, windowMs: 60 * 60 * 1000 })) {
    throw conflict("طلبات كثيرة لاستعادة كلمة المرور — حاول بعد ساعة.", "rate_limited");
  }
  if (!ipLimit(req, "forgot", 12, 60 * 60 * 1000)) throw conflict(IP_LIMIT_MESSAGE, "rate_limited");

  const found = await q(`SELECT * FROM users WHERE phone = $1`, [cleanPhone]);
  const userRow = found.rows[0];
  if (!userRow) throw notFound("لا يوجد حساب بهذا الرقم — تأكّد من الرقم.", "no_match");

  const settings = await getSettings();
  const viaTelegram = telegramReady(userRow, settings, telegramConfigured());

  /* تشديد اختياري (مفتاح في لوحة المسؤول): لا استعادة إلا لحساب مُتحقَّق من رقمه */
  if (settings.verification?.requireVerified && !userRow.phone_verified_at) {
    await logAudit(req, {
      actorId: userRow.id,
      actorName: userRow.name,
      actorRole: userRow.account_type,
      action: "password.reset_blocked_unverified",
      entityType: "user",
      entityId: userRow.id,
      source: "auth_screen",
      metadata: { phone: maskPhone(cleanPhone), note: "الحساب غير مُتحقَّق والمفتاح مُفعَّل" },
    });
    throw forbidden(
      "حسابك غير مُتحقَّق من رقمه — اربط تيليجرام من الإعدادات → «تحقّق من رقمي» ثم أعد المحاولة، أو اطلب من مسؤول النظام مساعدتك في الاستعادة.",
      "unverified_account"
    );
  }

  if (!viaTelegram) {
    /* الوضع البديل فقط: الاسم كما هو مسجَّل قبل ظهور الرمز على الشاشة */
    const sameName =
      userRow.name.trim().replace(/\s+/g, " ") === String(name ?? "").trim().replace(/\s+/g, " ");
    if (!sameName) {
      await logAudit(req, {
        action: "password.reset_request_failed",
        entityType: "user",
        entityId: userRow.id,
        actorRole: "system",
        metadata: { phone: maskPhone(cleanPhone) },
      });
      throw notFound("الاسم لا يطابق صاحب هذا الرقم.", "no_match");
    }
  }

  const issued = await issueOtp({
    user: userRow,
    purpose: "reset",
    req,
    telegramConfigured: telegramConfigured(),
  });
  await logAudit(req, {
    actorId: userRow.id,
    actorName: userRow.name,
    actorRole: userRow.account_type,
    action: "password.reset_request",
    entityType: "user",
    entityId: userRow.id,
    source: issued.channel === "telegram" ? "telegram" : "auth_screen",
    metadata: { channel: issued.channel, phone: maskPhone(cleanPhone) },
  });
  if (issued.channel === "screen") {
    try {
      await notifyUser(userRow.id, {
        title: "طلب استعادة كلمة مرور حسابك",
        body: "طُلب تعيين كلمة مرور جديدة لحسابك من شاشة الدخول. إن لم يكن هذا طلبك، غيّر كلمة مرورك فورًا.",
        level: "danger",
        url: "/",
        tag: `pwreset-${userRow.id}`,
      });
    } catch {
      /* التنبيه إضافة — لا يُفشل الاستعادة */
    }
  }
  res.json({
    ok: true,
    channel: issued.channel,
    expiresInMinutes: issued.expiresInMinutes,
    warning: issued.warning ?? "",
    code: issued.code ?? null,
    hint:
      issued.channel === "telegram"
        ? "أرسلنا الرمز إلى محادثتك في تيليجرام."
        : "اكتب الرمز الظاهر هنا ثم حدّد كلمة مرور جديدة.",
  });
}

/** الوضع القديم (للتوافق) — نفس المنطق تمامًا */
authRouter.post("/forgot-password", wrap(handleOtpRequest));
/** الواجهة الجديدة */
authRouter.post("/otp/request", wrap(handleOtpRequest));

authRouter.post(
  "/otp/verify",
  wrap(async (req, res) => {
    const { phone, code } = req.body ?? {};
    const cleanPhone = normalizePhone(phone);
    if (!isValidPhone(cleanPhone)) throw badRequest("رقم الهاتف غير صحيح.");
    if (!rateLimit(`otp-verify:${cleanPhone}`, { limit: 10, windowMs: 60 * 60 * 1000 })) {
      throw conflict("محاولات كثيرة — حاول بعد قليل.", "rate_limited");
    }
    if (!otpRateLimit(req, "otp-verify", 40, 60 * 60 * 1000)) {
      throw conflict(IP_LIMIT_MESSAGE, "rate_limited");
    }
    const found = await q(`SELECT * FROM users WHERE phone = $1`, [cleanPhone]);
    const userRow = found.rows[0];
    if (!userRow) throw notFound("لا يوجد حساب بهذا الرقم.", "no_match");

    const result = await verifyOtp({ user: userRow, code, purpose: "reset" });
    await logAudit(req, {
      actorId: userRow.id,
      actorName: userRow.name,
      actorRole: userRow.account_type,
      action: "password.otp_verified",
      entityType: "user",
      entityId: userRow.id,
      metadata: { channel: result.channel },
    });
    res.json({
      ok: true,
      ticket: result.ticket,
      expiresInMinutes: result.expiresInMinutes,
      channel: result.channel,
    });
  })
);

authRouter.post(
  "/reset-password",
  wrap(async (req, res) => {
    const { phone, code, ticket, newPassword, confirmPassword } = req.body ?? {};
    const cleanPhone = normalizePhone(phone);
    if (!isValidPhone(cleanPhone)) throw badRequest("رقم الهاتف غير صحيح.");
    const pwProblem = passwordProblem(newPassword);
    if (pwProblem) throw badRequest(pwProblem);
    if (String(newPassword) !== String(confirmPassword ?? "")) {
      throw badRequest("كلمتا المرور غير متطابقتين.", "confirm_mismatch");
    }
    if (!rateLimit(`reset:${cleanPhone}`, { limit: 10, windowMs: 60 * 60 * 1000 })) {
      throw conflict("محاولات كثيرة — حاول بعد قليل.", "rate_limited");
    }
    if (!ipLimit(req, "reset", 30, 60 * 60 * 1000)) throw conflict(IP_LIMIT_MESSAGE, "rate_limited");

    const found = await q(`SELECT * FROM users WHERE phone = $1`, [cleanPhone]);
    const userRow = found.rows[0];
    if (!userRow) throw notFound("لا يوجد حساب مطابق لهذا الرقم.", "no_match");

    if (ticket) {
      /* المسار المعتمد: تذكرة صادرة بعد تحقّق ناجح — تُستهلك مرة واحدة فقط */
      await redeemTicket(userRow.id, ticket);
    } else {
      /* توافق مع الواجهة القديمة: رمز مباشر من الشاشة أو من الجدول القديم */
      if (!/^\d{6}$/.test(String(code ?? "").trim())) throw badRequest("رمز الاستعادة غير صحيح.");
      const legacy = await q(
        `SELECT * FROM password_resets
          WHERE user_id = $1 AND used_at IS NULL AND expires_at > now() AND attempts < 5
          ORDER BY created_at DESC LIMIT 1`,
        [userRow.id]
      );
      const row = legacy.rows[0];
      if (row && row.code_hash === sha256(String(code).trim())) {
        await q(`UPDATE password_resets SET used_at = now() WHERE id = $1`, [row.id]);
      } else {
        if (row) await q(`UPDATE password_resets SET attempts = attempts + 1 WHERE id = $1`, [row.id]);
        const verified = await verifyOtp({ user: userRow, code, purpose: "reset" });
        await redeemTicket(userRow.id, verified.ticket);
      }
    }

    await q(`UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2`, [
      hashPassword(String(newPassword)),
      userRow.id,
    ]);
    await revokeAllSessions(userRow.id);
    await logAudit(req, {
      actorId: userRow.id,
      actorName: userRow.name,
      actorRole: userRow.account_type,
      action: "password.reset",
      entityType: "user",
      entityId: userRow.id,
      metadata: { note: "أُلغيت كل الجلسات بعد الاستعادة" },
    });

    /* تنبيه أمني مجاني على تيليجرام (إن كان الحساب مربوطًا) */
    try {
      const fresh = await q(
        `SELECT telegram_chat_id, telegram_alerts, name FROM users WHERE id = $1`,
        [userRow.id]
      );
      const link = fresh.rows[0];
      if (link?.telegram_chat_id && link.telegram_alerts !== false) {
        await sendPasswordChanged(link.telegram_chat_id, link.name);
      }
    } catch {
      /* التنبيه إضافة لا تُفشل العملية */
    }

    res.json({ ok: true, message: "تم تعيين كلمة مرور جديدة — سجّل الدخول بها." });
  })
);;
