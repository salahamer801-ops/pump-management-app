/**
 * المضخات والعضوية والصلاحيات.
 * القواعد المُطبَّقة هنا (لا في الواجهة):
 *  - Pump Code مُعرّف ثابت فريد، لا يعتمد على الاسم ولا يتغيّر.
 *  - معرفة الكود لا تمنح أي صلاحية: تُنشئ طلب انضمام بحالة pending فقط.
 *  - المسؤول لا يصل إلا إلى المضخات التي يديرها.
 *  - العضو لا يرى إلا المضخة التي ارتبط بها بموافقة معتمدة.
 *  - الإزالة تغيّر الحالة إلى removed ولا تحذف أي تاريخ.
 */
import { Router } from "express";
import { randomInt } from "node:crypto";
import { q } from "../db.js";
import { logAudit, auditForPump, auditRow } from "../audit.js";
import {
  badRequest,
  conflict,
  forbidden,
  membershipPublic,
  notFound,
  pumpPublic,
  requireAuth,
  requirePumpAccess,
  wrap,
} from "../http.js";
import { maskPhone, nameProblem } from "../security.js";
import { pumpsAndMemberships } from "./auth.js";

export const pumpsRouter = Router();

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const MEMBERSHIP_TYPES = [
  "shareholder",
  "rightHolder",
  "actualUser",
  "viewer",
  "accountant",
  "pumpOperator",
];

/** رقم تعريف المضخة: فريد وثابت ولا يتغيّر عند تغيير الاسم (§11، §12) */
async function generatePumpCode() {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    let body = "";
    for (let i = 0; i < 6; i += 1) body += CODE_ALPHABET[randomInt(0, CODE_ALPHABET.length)];
    const code = `PMP-${body}`;
    const exists = await q(`SELECT 1 FROM pumps WHERE code = $1`, [code]);
    if (exists.rowCount === 0) return code;
  }
  throw conflict("تعذّر توليد رقم تعريف فريد — حاول مجددًا.", "code_generation_failed");
}

const normalizeCode = (value) =>
  String(value ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/^PUMP-?/i, "PMP-");

/* ------------------------------- المضخات ------------------------------- */

pumpsRouter.post(
  "/",
  requireAuth,
  wrap(async (req, res) => {
    if (req.user.accountType !== "manager") {
      throw forbidden("إنشاء مضخة متاح لحساب المسؤول فقط.", "manager_only");
    }
    const { name, description, location } = req.body ?? {};
    if (nameProblem(name)) throw badRequest("اسم المضخة مطلوب.");
    const code = await generatePumpCode();
    const inserted = await q(
      `INSERT INTO pumps (code, name, description, location, manager_id)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [code, String(name).trim(), String(description ?? "").trim(), String(location ?? "").trim(), req.user.id]
    );
    const pump = inserted.rows[0];
    await logAudit(req, {
      action: "pump.create",
      entityType: "pump",
      entityId: pump.id,
      entityLabel: pump.name,
      pumpId: pump.id,
      metadata: { code: pump.code, location: pump.location },
    });
    res.status(201).json({ pump: pumpPublic(pump) });
  })
);

pumpsRouter.get(
  "/",
  requireAuth,
  wrap(async (req, res) => {
    res.json(await pumpsAndMemberships(req.user.id));
  })
);

pumpsRouter.get(
  "/:pumpId",
  requireAuth,
  wrap(async (req, res) => {
    const { pump, role, membership } = await requirePumpAccess(req.params.pumpId, req.user);
    const manager = await q(`SELECT id, name FROM users WHERE id = $1`, [pump.manager_id]);
    res.json({
      pump: role === "manager" ? pumpPublic(pump) : { ...pumpPublic(pump), managerId: undefined },
      role,
      manager: role === "manager" ? undefined : { name: manager.rows[0]?.name ?? "" },
      membership: membership ? membershipPublic(membership) : null,
    });
  })
);

pumpsRouter.patch(
  "/:pumpId",
  requireAuth,
  wrap(async (req, res) => {
    const pumpRes = await q(`SELECT * FROM pumps WHERE id = $1`, [req.params.pumpId]);
    if (pumpRes.rowCount === 0) throw notFound("المضخة غير موجودة.");
    const pump = pumpRes.rows[0];
    if (pump.manager_id !== req.user.id) throw forbidden();
    const { name, description, location } = req.body ?? {};
    if (name !== undefined && nameProblem(name)) throw badRequest("اسم المضخة غير صالح.");
    const updated = await q(
      `UPDATE pumps SET name = COALESCE($1, name), description = COALESCE($2, description),
              location = COALESCE($3, location), updated_at = now()
        WHERE id = $4 RETURNING *`,
      [
        name === undefined ? null : String(name).trim(),
        description === undefined ? null : String(description).trim(),
        location === undefined ? null : String(location).trim(),
        pump.id,
      ]
    );
    await logAudit(req, {
      action: "pump.update",
      entityType: "pump",
      entityId: pump.id,
      entityLabel: updated.rows[0].name,
      pumpId: pump.id,
      metadata: { before: pump.name, after: updated.rows[0].name, code: pump.code },
    });
    res.json({ pump: pumpPublic(updated.rows[0]) });
  })
);

/* --------------------- طلب الانضمام (من حساب المستخدم) -------------------- */

pumpsRouter.post(
  "/join",
  requireAuth,
  wrap(async (req, res) => {
    const code = normalizeCode(req.body?.pumpCode);
    if (!/^PMP-[A-Z0-9]{4,12}$/.test(code)) {
      throw badRequest("رقم تعريف المضخة غير صحيح. مثال: PMP-8F42K7", "bad_pump_code");
    }
    if (!requireAuthLimit(req.user.id)) {
      throw conflict("طلبات كثيرة — حاول بعد قليل.", "rate_limited");
    }
    const found = await q(`SELECT * FROM pumps WHERE code = $1`, [code]);
    if (found.rowCount === 0) throw notFound("لا توجد مضخة بهذا الرقم.", "unknown_pump_code");
    const pump = found.rows[0];
    if (pump.manager_id === req.user.id) {
      throw conflict("هذه المضخة أنت مسؤولها بالفعل.", "already_manager");
    }
    const existing = await q(
      `SELECT * FROM pump_memberships WHERE pump_id = $1 AND user_id = $2`,
      [pump.id, req.user.id]
    );
    if (existing.rowCount > 0) {
      const row = existing.rows[0];
      if (row.status === "approved") throw conflict("أنت مرتبط بهذه المضخة بالفعل.", "already_member");
      if (row.status === "pending") throw conflict("طلبك قيد مراجعة المسؤول.", "already_pending");
      const revived = await q(
        `UPDATE pump_memberships
            SET status = 'pending', requested_at = now(), updated_at = now(),
                rejected_at = NULL, rejected_by = NULL, reject_reason = '',
                removed_at = NULL, removed_by = NULL, remove_reason = '', note = $2
          WHERE id = $1 RETURNING *`,
        [row.id, String(req.body?.note ?? "").slice(0, 300)]
      );
      await logAudit(req, {
        action: "membership.request",
        entityType: "pump_membership",
        entityId: row.id,
        entityLabel: code,
        pumpId: pump.id,
        metadata: { after: "pending", again: true },
      });
      // لا تُعاد أي بيانات عن المضخة قبل قبول المسؤول (§17)
      return res.status(201).json({ request: { id: revived.rows[0].id, status: "pending" } });
    }

    const inserted = await q(
      `INSERT INTO pump_memberships (pump_id, user_id, membership_type, status, note)
       VALUES ($1,$2,'viewer','pending',$3) RETURNING *`,
      [pump.id, req.user.id, String(req.body?.note ?? "").slice(0, 300)]
    );
    await logAudit(req, {
      action: "membership.request",
      entityType: "pump_membership",
      entityId: inserted.rows[0].id,
      entityLabel: code,
      pumpId: pump.id,
      metadata: { after: "pending" },
    });
    res.status(201).json({ request: { id: inserted.rows[0].id, status: "pending" } });
  })
);

const joinBuckets = new Map();
function requireAuthLimit(userId) {
  const now = Date.now();
  const list = (joinBuckets.get(userId) ?? []).filter((t) => now - t < 60 * 60 * 1000);
  if (list.length >= 15) {
    joinBuckets.set(userId, list);
    return false;
  }
  list.push(now);
  joinBuckets.set(userId, list);
  return true;
}

/* ------------------------- لوحة المسؤول للمضخة ------------------------- */

pumpsRouter.get(
  "/:pumpId/requests",
  requireAuth,
  wrap(async (req, res) => {
    await managerOwnsPump(req);
    const rows = await q(
      `SELECT m.*, u.name AS user_name, u.phone AS user_phone
         FROM pump_memberships m JOIN users u ON u.id = m.user_id
        WHERE m.pump_id = $1 AND m.status = 'pending'
        ORDER BY m.requested_at`,
      [req.params.pumpId]
    );
    res.json({
      requests: rows.rows.map((row) => ({
        ...membershipPublic(row),
        user: { id: row.user_id, name: row.user_name, phoneMasked: maskPhone(row.user_phone) },
      })),
    });
  })
);

pumpsRouter.get(
  "/:pumpId/members",
  requireAuth,
  wrap(async (req, res) => {
    await managerOwnsPump(req);
    const rows = await q(
      `SELECT m.*, u.name AS user_name, u.phone AS user_phone, u.account_type AS user_account_type
         FROM pump_memberships m JOIN users u ON u.id = m.user_id
        WHERE m.pump_id = $1
        ORDER BY m.requested_at`,
      [req.params.pumpId]
    );
    res.json({
      members: rows.rows.map((row) => ({
        ...membershipPublic(row),
        user: {
          id: row.user_id,
          name: row.user_name,
          phoneMasked: maskPhone(row.user_phone),
          accountType: row.user_account_type,
        },
      })),
    });
  })
);

pumpsRouter.post(
  "/:pumpId/requests/:membershipId/decision",
  requireAuth,
  wrap(async (req, res) => {
    const pump = await managerOwnsPump(req);
    const action = String(req.body?.action ?? "");
    if (action !== "approve" && action !== "reject") throw badRequest("القرار غير صالح.");
    const membership = await membershipOfPump(req.params.membershipId, pump.id);
    if (membership.status !== "pending") {
      throw conflict("هذا الطلب لم يكن قيد المراجعة.", "not_pending");
    }

    if (action === "approve") {
      const type = String(req.body?.membershipType ?? "viewer");
      if (!MEMBERSHIP_TYPES.includes(type)) throw badRequest("نوع العضوية غير صالح.");
      const personId = req.body?.personId ? String(req.body.personId).slice(0, 80) : null;
      const personName = String(req.body?.personName ?? "").slice(0, 120);
      const shareRef = String(req.body?.shareRef ?? "").slice(0, 120);
      const updated = await q(
        `UPDATE pump_memberships
            SET status = 'approved', membership_type = $1, person_id = $2, person_name = $3,
                share_ref = $4, note = $5, approved_at = now(), approved_by = $6, updated_at = now()
          WHERE id = $7 RETURNING *`,
        [
          type,
          personId,
          personName,
          shareRef,
          String(req.body?.note ?? membership.note ?? "").slice(0, 300),
          req.user.id,
          membership.id,
        ]
      );
      await logAudit(req, {
        action: "membership.approve",
        entityType: "pump_membership",
        entityId: membership.id,
        entityLabel: pump.name,
        pumpId: pump.id,
        metadata: {
          userId: membership.user_id,
          membershipType: type,
          personId,
          personName,
          shareRef,
        },
      });
      return res.json({ membership: membershipPublic(updated.rows[0]) });
    }

    const reason = String(req.body?.reason ?? "").slice(0, 300);
    const updated = await q(
      `UPDATE pump_memberships
          SET status = 'rejected', rejected_at = now(), rejected_by = $1, reject_reason = $2, updated_at = now()
        WHERE id = $3 RETURNING *`,
      [req.user.id, reason, membership.id]
    );
    await logAudit(req, {
      action: "membership.reject",
      entityType: "pump_membership",
      entityId: membership.id,
      entityLabel: pump.name,
      pumpId: pump.id,
      metadata: { userId: membership.user_id, reason },
    });
    return res.json({ membership: membershipPublic(updated.rows[0]) });
  })
);

/** تغيير نوع العضوية/ربط الشخص — تغيير صلاحيات يُسجَّل في التدقيق */
pumpsRouter.patch(
  "/:pumpId/members/:membershipId",
  requireAuth,
  wrap(async (req, res) => {
    const pump = await managerOwnsPump(req);
    const membership = await membershipOfPump(req.params.membershipId, pump.id);
    if (membership.status !== "approved") throw conflict("العضوية غير معتمدة.", "not_approved");
    const type = req.body?.membershipType === undefined ? null : String(req.body.membershipType);
    if (type && !MEMBERSHIP_TYPES.includes(type)) throw badRequest("نوع العضوية غير صالح.");
    const personId = req.body?.personId === undefined ? membership.person_id : String(req.body.personId ?? "");
    const personName =
      req.body?.personName === undefined ? membership.person_name : String(req.body.personName ?? "").slice(0, 120);
    const shareRef =
      req.body?.shareRef === undefined ? membership.share_ref : String(req.body.shareRef ?? "").slice(0, 120);
    const updated = await q(
      `UPDATE pump_memberships
          SET membership_type = COALESCE($1, membership_type), person_id = $2, person_name = $3,
              share_ref = $4, note = $5, updated_at = now()
        WHERE id = $6 RETURNING *`,
      [
        type,
        personId || null,
        personName,
        shareRef,
        String(req.body?.note ?? membership.note ?? "").slice(0, 300),
        membership.id,
      ]
    );
    await logAudit(req, {
      action: "membership.update",
      entityType: "pump_membership",
      entityId: membership.id,
      entityLabel: pump.name,
      pumpId: pump.id,
      source: "screen",
      metadata: {
        before: { type: membership.membership_type, personId: membership.person_id, shareRef: membership.share_ref },
        after: { type: updated.rows[0].membership_type, personId: updated.rows[0].person_id, shareRef },
        reason: String(req.body?.reason ?? "").slice(0, 300),
      },
    });
    res.json({ membership: membershipPublic(updated.rows[0]) });
  })
);

/** الإزالة: الحالة تصبح removed ويبقى كل التاريخ محفوظًا (§36) */
pumpsRouter.post(
  "/:pumpId/members/:membershipId/remove",
  requireAuth,
  wrap(async (req, res) => {
    const pump = await managerOwnsPump(req);
    const membership = await membershipOfPump(req.params.membershipId, pump.id);
    if (membership.status !== "approved") throw conflict("العضوية غير معتمدة.", "not_approved");
    const reason = String(req.body?.reason ?? "").slice(0, 300);
    const updated = await q(
      `UPDATE pump_memberships
          SET status = 'removed', removed_at = now(), removed_by = $1, remove_reason = $2, updated_at = now()
        WHERE id = $3 RETURNING *`,
      [req.user.id, reason, membership.id]
    );
    await logAudit(req, {
      action: "membership.remove",
      entityType: "pump_membership",
      entityId: membership.id,
      entityLabel: pump.name,
      pumpId: pump.id,
      source: "screen",
      metadata: { userId: membership.user_id, reason, note: "التاريخ محفوظ ولم يُحذف" },
    });
    res.json({ membership: membershipPublic(updated.rows[0]) });
  })
);

pumpsRouter.get(
  "/:pumpId/audit",
  requireAuth,
  wrap(async (req, res) => {
    await managerOwnsPump(req);
    res.json({ logs: await auditForPump(req.params.pumpId, 200) });
  })
);

export const auditRouter = Router();

auditRouter.get(
  "/me",
  requireAuth,
  wrap(async (req, res) => {
    const rows = await q(`SELECT * FROM audit_logs WHERE actor_id = $1 ORDER BY at DESC LIMIT 100`, [
      req.user.id,
    ]);
    res.json({ logs: rows.rows.map(auditRow) });
  })
);

async function managerOwnsPump(req) {
  const pumpRes = await q(`SELECT * FROM pumps WHERE id = $1`, [req.params.pumpId]);
  if (pumpRes.rowCount === 0) throw notFound("المضخة غير موجودة.");
  const pump = pumpRes.rows[0];
  if (pump.manager_id !== req.user.id) throw forbidden();
  return pump;
}

async function membershipOfPump(membershipId, pumpId) {
  const res = await q(`SELECT * FROM pump_memberships WHERE id = $1 AND pump_id = $2`, [
    membershipId,
    pumpId,
  ]);
  if (res.rowCount === 0) throw notFound("الطلب غير موجود.");
  return res.rows[0];
}
