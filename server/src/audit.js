/**
 * سجل التدقيق (§30): كل حدث حسّاس يُكتب في القاعدة.
 * actorId + action + entityType + entityId + timestamp + source + metadata
 */
import { q } from "./db.js";
import { clientIp } from "./security.js";

export async function logAudit(req, {
  action,
  entityType = "",
  entityId = "",
  entityLabel = "",
  pumpId = null,
  actorId = null,
  actorName = "",
  actorRole = "system",
  source = "api",
  metadata = {},
}) {
  const actor = req && req.user ? req.user : null;
  try {
    await q(
      `INSERT INTO audit_logs
        (actor_id, actor_name, actor_role, action, entity_type, entity_id, pump_id, source, metadata, ip)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        actorId ?? (actor ? actor.id : null),
        actorName || (actor ? actor.name : ""),
        actorRole || (actor ? actor.account_type : "system"),
        action,
        entityType,
        String(entityId ?? ""),
        pumpId,
        source,
        JSON.stringify({ ...metadata, entityLabel }),
        req ? clientIp(req) : "",
      ]
    );
  } catch (err) {
    // سجل التدقيق لا يجب أن يُسقط الطلب
    console.error("[audit] تعذّر تسجيل الحدث:", action, err.message);
  }
}

export async function auditForPump(pumpId, limit = 200) {
  const res = await q(
    `SELECT a.* FROM audit_logs a
      WHERE a.pump_id = $1
         OR (a.actor_id IS NOT NULL AND a.actor_id IN (
              SELECT user_id FROM pump_memberships WHERE pump_id = $1
            ))
      ORDER BY a.at DESC
      LIMIT $2`,
    [pumpId, limit]
  );
  return res.rows.map(auditRow);
}

export async function auditForUser(userId, limit = 200) {
  const res = await q(
    `SELECT * FROM audit_logs WHERE actor_id = $1 ORDER BY at DESC LIMIT $2`,
    [userId, limit]
  );
  return res.rows.map(auditRow);
}

export function auditRow(row) {
  return {
    id: row.id,
    at: row.at,
    actorId: row.actor_id,
    actorName: row.actor_name,
    actorRole: row.actor_role,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    pumpId: row.pump_id,
    source: row.source,
    metadata: row.metadata ?? {},
  };
}
