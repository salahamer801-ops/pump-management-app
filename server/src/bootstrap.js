/**
 * تعيين مسؤول النظام الأول (bootstrap):
 * أول حساب «مسؤول مضخة» يُنشأ أو يدخل ولا يوجد مسؤول نظام في القاعدة يصبح مسؤولًا،
 * ويُسجَّل ذلك في سجل التدقيق. بعد وجود مسؤول، التعيين يصير من اللوحة فقط.
 */
import { q } from "./db.js";
import { logAudit } from "./audit.js";

export async function ensureBootstrapAdmin(userRow, req = null) {
  if (!userRow || userRow.account_type !== "manager" || userRow.is_admin) return null;
  try {
    const admins = await q(`SELECT count(*)::int AS n FROM users WHERE is_admin`);
    if (admins.rows[0].n > 0) return null;
    const updated = await q(
      `UPDATE users SET is_admin = true, updated_at = now() WHERE id = $1 RETURNING *`,
      [userRow.id]
    );
    await logAudit(req, {
      actorId: userRow.id,
      actorName: userRow.name,
      actorRole: "admin",
      action: "admin.bootstrap",
      entityType: "user",
      entityId: userRow.id,
      source: "system",
      metadata: {
        entityLabel: userRow.name,
        note: "أول حساب مسؤول في النظام — صار مسؤول النظام تلقائيًا",
      },
    });
    return updated.rows[0] ?? null;
  } catch (err) {
    console.error("[bootstrap] تعذّر تعيين مسؤول النظام الأول:", err.message);
    return null;
  }
}
