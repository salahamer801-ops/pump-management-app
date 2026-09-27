/**
 * لوحة مسؤول النظام — كل مسار هنا يتطلب صلاحية إدارية محقّقة على الخادم (requireAdmin).
 * لا حذف نهائي: الإيقاف والأرشفة والإزالة كلها حالات محفوظة مع سبب موثّق في سجل التدقيق.
 */
import { Router } from "express";
import { q } from "../db.js";
import { logAudit } from "../audit.js";
import {
  badRequest,
  conflict,
  forbidden,
  notFound,
  requireAdmin,
  requireAuth,
  wrap,
} from "../http.js";
import { getSettings, saveSettings } from "../settings.js";
import { hashPassword, maskPhone, revokeAllSessions } from "../security.js";

export const adminRouter = Router();

adminRouter.use(requireAuth, requireAdmin);

/* ------------------------------- نظرة عامة ------------------------------- */

adminRouter.get(
  "/overview",
  wrap(async (_req, res) => {
    const counts = await q(`
      SELECT
        (SELECT count(*)::int FROM users) AS users_total,
        (SELECT count(*)::int FROM users WHERE account_type = 'manager') AS managers,
        (SELECT count(*)::int FROM users WHERE account_type = 'user') AS members,
        (SELECT count(*)::int FROM users WHERE status = 'suspended') AS suspended,
        (SELECT count(*)::int FROM users WHERE is_admin) AS admins,
        (SELECT count(*)::int FROM users WHERE created_at > now() - interval '7 days') AS new_users_7d,
        (SELECT count(*)::int FROM pumps) AS pumps_total,
        (SELECT count(*)::int FROM pumps WHERE status = 'active') AS pumps_active,
        (SELECT count(*)::int FROM pump_memberships WHERE status = 'pending') AS pending_requests,
        (SELECT count(*)::int FROM pump_memberships WHERE status = 'approved') AS approved_memberships,
        (SELECT count(*)::int FROM sessions WHERE revoked_at IS NULL AND expires_at > now()) AS active_sessions,
        (SELECT count(*)::int FROM audit_logs WHERE at > now() - interval '24 hours') AS events_24h,
        (SELECT pg_size_pretty(pg_database_size(current_database()))) AS db_size
    `);

    const series = await q(`
      SELECT to_char(d::date, 'YYYY-MM-DD') AS day,
             (SELECT count(*)::int FROM users u WHERE u.created_at::date = d::date) AS users,
             (SELECT count(*)::int FROM pumps p WHERE p.created_at::date = d::date) AS pumps
        FROM generate_series(current_date - interval '13 days', current_date, interval '1 day') AS d
       ORDER BY day
    `);

    const recent = await q(`
      SELECT a.*, p.name AS pump_name, p.code AS pump_code
        FROM audit_logs a LEFT JOIN pumps p ON p.id = a.pump_id
       ORDER BY a.at DESC LIMIT 12
    `);

    const pending = await q(`
      SELECT m.id, m.person_name, m.requested_at, m.status,
             p.name AS pump_name, p.code AS pump_code, u.name AS user_name, u.account_type
        FROM pump_memberships m
        JOIN pumps p ON p.id = m.pump_id
        JOIN users u ON u.id = m.user_id
       WHERE m.status = 'pending'
       ORDER BY m.requested_at DESC LIMIT 8
    `);

    const topPumps = await q(`
      SELECT p.name, p.code,
             (SELECT count(*)::int FROM pump_memberships m WHERE m.pump_id = p.id AND m.status = 'approved') AS members
        FROM pumps p ORDER BY members DESC, p.created_at DESC LIMIT 5
    `);

    res.json({
      counts: counts.rows[0],
      series: series.rows,
      recent: recent.rows.map(auditRowPublic),
      pending: pending.rows.map((r) => ({
        id: r.id,
        personName: r.person_name,
        userName: r.user_name,
        accountType: r.account_type,
        pumpName: r.pump_name,
        pumpCode: r.pump_code,
        requestedAt: r.requested_at,
      })),
      topPumps: topPumps.rows,
    });
  })
);

/* -------------------------------- المستخدمون ------------------------------- */

adminRouter.get(
  "/users",
  wrap(async (req, res) => {
    const search = String(req.query.q ?? "").trim().slice(0, 60);
    const type = ["manager", "user"].includes(String(req.query.type)) ? String(req.query.type) : "";
    const status = ["active", "suspended"].includes(String(req.query.status))
      ? String(req.query.status)
      : "";
    const adminFilter =
      req.query.admin === "yes" ? true : req.query.admin === "no" ? false : null;
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
    const offset = Math.max(Number(req.query.offset) || 0, 0);

    const where = `
      ($1 = '' OR u.name ILIKE '%' || $1 || '%' OR u.phone LIKE '%' || $1 || '%')
      AND ($2 = '' OR u.account_type = $2)
      AND ($3 = '' OR u.status = $3)
      AND ($4::boolean IS NULL OR u.is_admin = $4::boolean)`;

    const total = await q(`SELECT count(*)::int AS n FROM users u WHERE ${where}`, [
      search,
      type,
      status,
      adminFilter,
    ]);
    const rows = await q(
      `SELECT u.*,
              (SELECT count(*)::int FROM pumps p WHERE p.manager_id = u.id) AS pumps_count,
              (SELECT count(*)::int FROM pump_memberships m WHERE m.user_id = u.id AND m.status = 'approved') AS memberships_count,
              (SELECT count(*)::int FROM pump_memberships m WHERE m.user_id = u.id AND m.status = 'pending') AS pending_count,
              (SELECT count(*)::int FROM sessions s WHERE s.user_id = u.id AND s.revoked_at IS NULL AND s.expires_at > now()) AS sessions_count
         FROM users u
        WHERE ${where}
        ORDER BY u.is_admin DESC, u.created_at DESC
        LIMIT $5 OFFSET $6`,
      [search, type, status, adminFilter, limit, offset]
    );

    res.json({ total: total.rows[0].n, users: rows.rows.map(userRowPublic) });
  })
);

adminRouter.patch(
  "/users/:id",
  wrap(async (req, res) => {
    const target = await userById(req.params.id);
    const { status, isAdmin } = req.body ?? {};
    const patch = {};

    if (status !== undefined) {
      if (!["active", "suspended"].includes(status)) throw badRequest("حالة الحساب غير صحيحة.");
      if (target.id === req.user.id && status !== "active") {
        throw conflict("لا يمكنك إيقاف حسابك أنت.", "self_guard");
      }
      patch.status = status;
    }

    if (isAdmin !== undefined) {
      if (typeof isAdmin !== "boolean") throw badRequest("قيمة الصلاحية غير صحيحة.");
      if (target.id === req.user.id && isAdmin === false) {
        throw conflict("لا يمكنك إزالة صلاحيتك أنت.", "self_guard");
      }
      if (isAdmin === false) {
        const admins = await q(`SELECT count(*)::int AS n FROM users WHERE is_admin`);
        if (admins.rows[0].n <= 1) {
          throw conflict("لا بد من مسؤول نظام واحد على الأقل.", "last_admin");
        }
      }
      patch.is_admin = isAdmin;
    }

    if (Object.keys(patch).length === 0) throw badRequest("لا يوجد تغيير مطلوب.");

    const sets = [];
    const params = [];
    if ("status" in patch) {
      params.push(patch.status);
      sets.push(`status = $${params.length}`);
    }
    if ("is_admin" in patch) {
      params.push(patch.is_admin);
      sets.push(`is_admin = $${params.length}`);
    }
    params.push(target.id);
    const updated = await q(
      `UPDATE users SET ${sets.join(", ")}, updated_at = now() WHERE id = $${params.length} RETURNING *`,
      params
    );

    /* إيقاف الحساب يُنهي جلساته فورًا */
    if (patch.status === "suspended") await revokeAllSessions(target.id);

    await logAudit(req, {
      action: "admin.user_update",
      entityType: "user",
      entityId: target.id,
      actorName: req.user.name,
      actorRole: "admin",
      source: "admin_panel",
      metadata: {
        entityLabel: target.name,
        before: { status: target.status, isAdmin: target.is_admin },
        after: patch,
      },
    });

    res.json({ user: userRowPublic(updated.rows[0]) });
  })
);

/** كشف رقم الهاتف الكامل: عملية حسّاسة تُسجَّل في التدقيق */
adminRouter.post(
  "/users/:id/reveal-phone",
  wrap(async (req, res) => {
    const target = await userById(req.params.id);
    await logAudit(req, {
      action: "admin.phone_view",
      entityType: "user",
      entityId: target.id,
      actorName: req.user.name,
      actorRole: "admin",
      source: "admin_panel",
      metadata: { entityLabel: target.name },
    });
    res.json({ phone: target.phone });
  })
);

/** كلمة مرور مؤقتة: تُعرض مرة واحدة لمسؤول النظام ليبلّغها لصاحب الحساب */
adminRouter.post(
  "/users/:id/reset-password",
  wrap(async (req, res) => {
    const target = await userById(req.params.id);
    if (target.is_admin && target.id !== req.user.id) {
      throw conflict("لا تُعاد كلمة مرور حساب مسؤول نظام آخر — يستخدم «نسيت كلمة المرور».", "admin_target");
    }
    const temporary = tempPassword();
    await q(`UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2`, [
      hashPassword(temporary),
      target.id,
    ]);
    await revokeAllSessions(target.id);
    await logAudit(req, {
      action: "admin.password_reset",
      entityType: "user",
      entityId: target.id,
      actorName: req.user.name,
      actorRole: "admin",
      source: "admin_panel",
      metadata: { entityLabel: target.name, note: "كلمة مرور مؤقتة — الجلسات أُنهيت" },
    });
    res.json({ password: temporary, phoneMasked: maskPhone(target.phone) });
  })
);

/* --------------------------------- المضخات -------------------------------- */

adminRouter.get(
  "/pumps",
  wrap(async (req, res) => {
    const search = String(req.query.q ?? "").trim().slice(0, 60);
    const status = ["active", "archived"].includes(String(req.query.status))
      ? String(req.query.status)
      : "";
    const rows = await q(
      `SELECT p.*, u.name AS manager_name, u.phone AS manager_phone,
              (SELECT count(*)::int FROM pump_memberships m WHERE m.pump_id = p.id AND m.status = 'approved') AS members_count,
              (SELECT count(*)::int FROM pump_memberships m WHERE m.pump_id = p.id AND m.status = 'pending') AS pending_count
         FROM pumps p JOIN users u ON u.id = p.manager_id
        WHERE ($1 = '' OR p.name ILIKE '%' || $1 || '%' OR p.code ILIKE '%' || $1 || '%' OR u.name ILIKE '%' || $1 || '%')
          AND ($2 = '' OR p.status = $2)
        ORDER BY p.created_at DESC LIMIT 200`,
      [search, status]
    );
    res.json({ pumps: rows.rows.map(pumpRowPublic) });
  })
);

adminRouter.patch(
  "/pumps/:id",
  wrap(async (req, res) => {
    const { status } = req.body ?? {};
    if (!["active", "archived"].includes(status)) throw badRequest("حالة المضخة غير صحيحة.");
    const found = await q(`SELECT * FROM pumps WHERE id = $1`, [req.params.id]);
    if (found.rowCount === 0) throw notFound("المضخة غير موجودة.");
    const pump = found.rows[0];
    const updated = await q(
      `UPDATE pumps SET status = $1, updated_at = now() WHERE id = $2 RETURNING *`,
      [status, pump.id]
    );
    await logAudit(req, {
      action: "admin.pump_update",
      entityType: "pump",
      entityId: pump.id,
      pumpId: pump.id,
      actorName: req.user.name,
      actorRole: "admin",
      source: "admin_panel",
      metadata: { entityLabel: pump.name, before: pump.status, after: status },
    });
    res.json({ pump: pumpRowPublic(updated.rows[0]) });
  })
);

/* -------------------------------- العضويات -------------------------------- */

adminRouter.get(
  "/memberships",
  wrap(async (req, res) => {
    const status = ["pending", "approved", "rejected", "removed"].includes(String(req.query.status))
      ? String(req.query.status)
      : "";
    const search = String(req.query.q ?? "").trim().slice(0, 60);
    const rows = await q(
      `SELECT m.*, p.name AS pump_name, p.code AS pump_code,
              u.name AS user_name, u.phone AS user_phone, u.account_type AS user_account_type,
              mg.name AS manager_name
         FROM pump_memberships m
         JOIN pumps p ON p.id = m.pump_id
         JOIN users u ON u.id = m.user_id
         JOIN users mg ON mg.id = p.manager_id
        WHERE ($1 = '' OR m.status = $1)
          AND ($2 = '' OR u.name ILIKE '%' || $2 || '%' OR p.name ILIKE '%' || $2 || '%' OR m.person_name ILIKE '%' || $2 || '%')
        ORDER BY m.requested_at DESC LIMIT 200`,
      [status, search]
    );
    res.json({
      memberships: rows.rows.map((r) => ({
        id: r.id,
        pumpId: r.pump_id,
        pumpName: r.pump_name,
        pumpCode: r.pump_code,
        managerName: r.manager_name,
        userName: r.user_name,
        userPhoneMasked: maskPhone(r.user_phone),
        userAccountType: r.user_account_type,
        membershipType: r.membership_type,
        status: r.status,
        personName: r.person_name,
        shareRef: r.share_ref,
        note: r.note,
        requestedAt: r.requested_at,
        approvedAt: r.approved_at,
        rejectedAt: r.rejected_at,
        rejectReason: r.reject_reason,
        removedAt: r.removed_at,
        removeReason: r.remove_reason,
      })),
    });
  })
);

/** قرار مسؤول النظام على أي طلب — يتجاوز المسؤول مع سبب موثّق */
adminRouter.patch(
  "/memberships/:id",
  wrap(async (req, res) => {
    const { status, reason = "" } = req.body ?? {};
    if (!["approved", "rejected", "removed", "pending"].includes(status)) {
      throw badRequest("حالة العضوية غير صحيحة.");
    }
    const found = await q(`SELECT * FROM pump_memberships WHERE id = $1`, [req.params.id]);
    if (found.rowCount === 0) throw notFound("الطلب غير موجود.");
    const membership = found.rows[0];
    if (membership.status === status) throw conflict("الطلب في هذه الحالة أصلًا.", "no_change");

    const note = String(reason).trim().slice(0, 300);
    const updated = await q(
      `UPDATE pump_memberships SET
         status = $1,
         approved_at = CASE WHEN $1 = 'approved' THEN now() ELSE approved_at END,
         approved_by = CASE WHEN $1 = 'approved' THEN $2 ELSE approved_by END,
         rejected_at = CASE WHEN $1 = 'rejected' THEN now() ELSE rejected_at END,
         rejected_by = CASE WHEN $1 = 'rejected' THEN $2 ELSE rejected_by END,
         reject_reason = CASE WHEN $1 = 'rejected' THEN $3 ELSE reject_reason END,
         removed_at = CASE WHEN $1 = 'removed' THEN now() ELSE removed_at END,
         removed_by = CASE WHEN $1 = 'removed' THEN $2 ELSE removed_by END,
         remove_reason = CASE WHEN $1 = 'removed' THEN $3 ELSE remove_reason END,
         updated_at = now()
       WHERE id = $4 RETURNING *`,
      [status, req.user.id, note, membership.id]
    );

    await logAudit(req, {
      action: "admin.membership_decision",
      entityType: "membership",
      entityId: membership.id,
      pumpId: membership.pump_id,
      actorName: req.user.name,
      actorRole: "admin",
      source: "admin_panel",
      metadata: {
        entityLabel: membership.person_name || membership.user_id,
        before: membership.status,
        after: status,
        reason: note,
      },
    });

    res.json({ membership: { id: membership.id, status: updated.rows[0].status } });
  })
);

/* ------------------------------ سجل التدقيق ------------------------------- */

adminRouter.get(
  "/audit",
  wrap(async (req, res) => {
    const action = String(req.query.action ?? "").trim().slice(0, 60);
    const search = String(req.query.q ?? "").trim().slice(0, 60);
    const limit = Math.min(Math.max(Number(req.query.limit) || 100, 1), 400);
    const rows = await q(
      `SELECT a.*, p.name AS pump_name, p.code AS pump_code
         FROM audit_logs a LEFT JOIN pumps p ON p.id = a.pump_id
        WHERE ($1 = '' OR a.action = $1)
          AND ($2 = '' OR a.actor_name ILIKE '%' || $2 || '%' OR a.action ILIKE '%' || $2 || '%'
               OR a.entity_type ILIKE '%' || $2 || '%' OR p.name ILIKE '%' || $2 || '%')
        ORDER BY a.at DESC LIMIT $3`,
      [action, search, limit]
    );
    const actions = await q(
      `SELECT action, count(*)::int AS n FROM audit_logs GROUP BY action ORDER BY n DESC LIMIT 40`
    );
    res.json({ logs: rows.rows.map(auditRowPublic), actions: actions.rows });
  })
);

/* ------------------------------ إعدادات النظام ----------------------------- */

adminRouter.get(
  "/settings",
  wrap(async (_req, res) => {
    const settings = await getSettings();
    const admins = await q(
      `SELECT id, name, account_type, phone FROM users WHERE is_admin ORDER BY created_at`
    );
    res.json({
      settings,
      admins: admins.rows.map((a) => ({
        id: a.id,
        name: a.name,
        accountType: a.account_type,
        phoneMasked: maskPhone(a.phone),
      })),
    });
  })
);

adminRouter.patch(
  "/settings",
  wrap(async (req, res) => {
    const { announcement, registration } = req.body ?? {};
    const patch = {};

    if (announcement !== undefined) {
      const tone = ["info", "warn", "danger"].includes(announcement.tone)
        ? announcement.tone
        : "info";
      const text = String(announcement.text ?? "").trim().slice(0, 300);
      if (announcement.active && text.length < 3) {
        throw badRequest("اكتب نص الإعلان قبل تفعيله.");
      }
      patch.announcement = { active: Boolean(announcement.active), tone, text };
    }

    if (registration !== undefined) {
      patch.registration = {
        manager: Boolean(registration.manager),
        user: Boolean(registration.user),
      };
    }

    if (Object.keys(patch).length === 0) throw badRequest("لا يوجد تغيير مطلوب.");

    const before = await getSettings();
    const next = await saveSettings(patch, req.user.id);
    await logAudit(req, {
      action: "admin.settings_update",
      entityType: "settings",
      entityId: "system",
      actorName: req.user.name,
      actorRole: "admin",
      source: "admin_panel",
      metadata: { entityLabel: "إعدادات النظام", before, after: next },
    });
    res.json({ settings: next });
  })
);

/* --------------------------------- أدوات --------------------------------- */

async function userById(id) {
  if (!/^[0-9a-f-]{36}$/i.test(String(id))) throw notFound("المستخدم غير موجود.");
  const res = await q(`SELECT * FROM users WHERE id = $1`, [id]);
  if (res.rowCount === 0) throw notFound("المستخدم غير موجود.");
  return res.rows[0];
}

function userRowPublic(u) {
  return {
    id: u.id,
    name: u.name,
    phoneMasked: maskPhone(u.phone),
    accountType: u.account_type,
    status: u.status,
    isAdmin: Boolean(u.is_admin),
    createdAt: u.created_at,
    lastLoginAt: u.last_login_at,
    pumpsCount: u.pumps_count ?? 0,
    membershipsCount: u.memberships_count ?? 0,
    pendingCount: u.pending_count ?? 0,
    sessionsCount: u.sessions_count ?? 0,
  };
}

function pumpRowPublic(p) {
  return {
    id: p.id,
    pumpCode: p.code,
    name: p.name,
    location: p.location,
    status: p.status,
    managerName: p.manager_name ?? "",
    managerPhoneMasked: p.manager_phone ? maskPhone(p.manager_phone) : "",
    membersCount: p.members_count ?? 0,
    pendingCount: p.pending_count ?? 0,
    createdAt: p.created_at,
  };
}

function auditRowPublic(a) {
  return {
    id: a.id,
    at: a.at,
    action: a.action,
    actorName: a.actor_name || "النظام",
    actorRole: a.actor_role,
    entityType: a.entity_type,
    entityId: a.entity_id,
    entityLabel: a.metadata?.entityLabel ?? "",
    pumpId: a.pump_id ?? null,
    pumpName: a.pump_name ?? null,
    pumpCode: a.pump_code ?? null,
    source: a.source,
    metadata: a.metadata ?? {},
  };
}

/** كلمة مرور مؤقتة قوية تُعرض مرة واحدة */
function tempPassword() {
  const letters = "abcdefghjkmnpqrstuvwxyz";
  const digits = "23456789";
  let out = "";
  for (let i = 0; i < 6; i += 1) out += letters[Math.floor(Math.random() * letters.length)];
  for (let i = 0; i < 4; i += 1) out += digits[Math.floor(Math.random() * digits.length)];
  return out;
}
