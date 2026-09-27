/** أدوات HTTP: أخطاء واضحة، تغليف المسارات، ومصادقة/تصريح على الخادم */
import { q } from "./db.js";
import { bearerToken, publicUser, sha256 } from "./security.js";

export class HttpError extends Error {
  constructor(status, message, code = "error") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export const badRequest = (message, code = "invalid_input") => new HttpError(400, message, code);
export const unauthorized = (message = "يجب تسجيل الدخول.", code = "unauthenticated") =>
  new HttpError(401, message, code);
export const forbidden = (message = "لا تملك صلاحية على هذه المضخة.", code = "forbidden") =>
  new HttpError(403, message, code);
export const notFound = (message = "العنصر غير موجود.", code = "not_found") =>
  new HttpError(404, message, code);
export const conflict = (message, code = "conflict") => new HttpError(409, message, code);

export const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** يجعل req.user و req.sessionId — الهوية من الرمز المُرجع إلى القاعدة، لا من الواجهة */
export const requireAuth = wrap(async (req, _res, next) => {
  const token = bearerToken(req);
  if (!token) throw unauthorized();
  const res = await q(
    `SELECT s.id AS session_id, u.*
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1 AND s.revoked_at IS NULL AND s.expires_at > now()`,
    [sha256(token)]
  );
  if (res.rowCount === 0) throw unauthorized("انتهت الجلسة — سجّل الدخول من جديد.", "session_expired");
  const row = res.rows[0];
  if (row.status !== "active") throw forbidden("الحساب موقوف.", "account_suspended");
  req.user = publicUser(row);
  req.sessionId = row.session_id;
  req.userRow = row;
  next();
});

/** لوحة مسؤول النظام: صلاحية من القاعدة فقط */
export const requireAdmin = (req, _res, next) => {
  if (!req.user || !req.user.isAdmin) {
    return next(forbidden("هذه اللوحة لمسؤول النظام فقط.", "admin_only"));
  }
  return next();
};

export const requireManagerAccount = (req, _res, next) => {
  if (!req.user || req.user.accountType !== "manager") {
    return next(forbidden("هذه العملية للمسؤول فقط.", "manager_only"));
  }
  return next();
};

/** المسؤول لا يصل إلا إلى المضخة التي يديرها فعليًا (§23) */
export async function pumpForManager(pumpId, userId) {
  const res = await q(`SELECT * FROM pumps WHERE id = $1`, [pumpId]);
  if (res.rowCount === 0) throw notFound("المضخة غير موجودة.");
  const pump = res.rows[0];
  if (pump.manager_id !== userId) throw forbidden();
  return pump;
}

/** العضوية المعتمدة فقط تمنح الوصول لبيانات المضخة — لا يكفي معرفة الكود (§17) */
export async function membershipForUser(pumpId, userId) {
  const res = await q(
    `SELECT * FROM pump_memberships WHERE pump_id = $1 AND user_id = $2`,
    [pumpId, userId]
  );
  return res.rows[0] ?? null;
}

export async function requirePumpAccess(pumpId, user) {
  const pumpRes = await q(`SELECT * FROM pumps WHERE id = $1`, [pumpId]);
  if (pumpRes.rowCount === 0) throw notFound("المضخة غير موجودة.");
  const pump = pumpRes.rows[0];
  if (pump.manager_id === user.id) {
    return { pump, role: "manager", membership: null };
  }
  const membership = await membershipForUser(pumpId, user.id);
  if (!membership || membership.status !== "approved") throw forbidden();
  return { pump, role: "member", membership };
}

export function pumpPublic(pump) {
  return {
    id: pump.id,
    pumpCode: pump.code,
    name: pump.name,
    description: pump.description,
    location: pump.location,
    managerId: pump.manager_id,
    status: pump.status,
    createdAt: pump.created_at,
    updatedAt: pump.updated_at,
  };
}

export function membershipPublic(row, { withUser = null } = {}) {
  return {
    id: row.id,
    pumpId: row.pump_id,
    userId: row.user_id,
    membershipType: row.membership_type,
    status: row.status,
    personId: row.person_id,
    personName: row.person_name,
    shareRef: row.share_ref,
    note: row.note,
    requestedAt: row.requested_at,
    approvedAt: row.approved_at,
    rejectedAt: row.rejected_at,
    rejectReason: row.reject_reason,
    removedAt: row.removed_at,
    removeReason: row.remove_reason,
    user: withUser,
  };
}
