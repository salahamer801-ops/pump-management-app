/**
 * بيانات التشغيل الرسمية للمضخة (المرحلة الثانية):
 * إعدادات المضخة، الأشخاص، المساهمون، الديالات، كشف الدوام الأساسي،
 * أيام الديالة، الدوام الفعلي، الاستخدام، التوقفات، الوقود، الرواسة،
 * والسجلات المالية — كلها في PostgreSQL، وكل صلاحية تُفحص هنا لا في الواجهة.
 *
 * قواعد ثابتة في هذا الملف:
 * - لا حذف نهائي: الإزالة "حذف ناعم" مع من أزال ومتى ولماذا.
 * - كشف الدوام الأساسي لا يتجاوز ساعات تشغيل المضخة (حارس على الخادم).
 * - الكشف المثبَّت لا يُعدَّل إلا بفك تثبيت بسبب موثّق يُسجَّل قبل/بعد.
 * - الدوام الفعلي جداوله مستقلة تمامًا ولا تمسّ كشف الدوام الأساسي.
 * - السجلات الشخصية للمستخدم لا تُقرأ ولا تُكتب إلا لصاحبها.
 */
import { Router } from "express";
import { q, withTransaction } from "../db.js";
import { logAudit } from "../audit.js";
import {
  badRequest,
  conflict,
  forbidden,
  notFound,
  requireAuth,
  wrap,
} from "../http.js";

export const operatingRouter = Router();

operatingRouter.use(requireAuth);

/* ------------------------------- أدوات عامة ------------------------------- */

const nowIso = () => new Date().toISOString();

/** معرّف الكيان نصي مولَّد في الواجهة — نتحقق من شكله فقط */
function validEntityId(id) {
  return typeof id === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(id);
}

const asText = (v, max = 400) => (v === undefined || v === null ? "" : String(v).slice(0, max));
const asNum = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const asBool = (v) => v === true || v === "true" || v === 1;
const asDate = (v) => {
  const t = asText(v, 40);
  if (!t) return null;
  const m = t.match(/^\d{4}-\d{2}-\d{2}/);
  return m ? m[0] : null;
};

/** نفس دالة الواجهة durationMin: إن كان الفرق ≤ 0 نضيف 24 ساعة */
function durationMin(start, end) {
  const toMin = (t) => {
    const [h, m] = String(t || "").split(":").map((n) => Number(n) || 0);
    return h * 60 + m;
  };
  if (!start || !end) return 0;
  let d = toMin(end) - toMin(start);
  if (d <= 0) d += 1440;
  return d;
}

async function pumpOr404(pumpId) {
  if (!/^[0-9a-f-]{36}$/i.test(String(pumpId))) throw notFound("المضخة غير موجودة.");
  const res = await q(`SELECT * FROM pumps WHERE id = $1`, [pumpId]);
  if (res.rowCount === 0) throw notFound("المضخة غير موجودة.");
  return res.rows[0];
}

/** قراءة: مسؤول المضخة أو عضو معتمد — غير ذلك ممنوع */
export async function requireOperatingRead(pumpId, user) {
  const pump = await pumpOr404(pumpId);
  if (pump.manager_id === user.id) return { pump, role: "manager", membership: null };
  const m = await q(`SELECT * FROM pump_memberships WHERE pump_id = $1 AND user_id = $2`, [
    pump.id,
    user.id,
  ]);
  const membership = m.rows[0];
  if (!membership || membership.status !== "approved") {
    throw forbidden("لا تملك صلاحية على هذه المضخة.", "no_pump_access");
  }
  return { pump, role: "member", membership };
}

/** كتابة: مسؤول المضخة فقط (§16 من قواعد المرحلة) */
export async function requireOperatingWrite(pumpId, user) {
  const pump = await pumpOr404(pumpId);
  if (pump.manager_id !== user.id) {
    throw forbidden("تعديل بيانات المضخة متاح لمسؤولها فقط.", "manager_only");
  }
  return { pump, role: "manager" };
}

/* ------------------------- مواصفات الجداول والكتابة ------------------------- */

const SPECS = {
  people: {
    table: "pump_people",
    cols: {
      name: asText,
      phone: asText,
      nationalId: asText,
      notes: asText,
      guest: asBool,
      archived: asBool,
    },
    dates: [],
  },
  shareholders: {
    table: "pump_shareholders",
    cols: {
      personId: asText,
      shareNo: asNum,
      units: asNum,
      baseHoursMin: asNum,
      baseOrder: asNum,
      status: asText,
      useStatus: asText,
      counterpartPersonId: asText,
      counterpartPhone: asText,
      useStatusNote: asText,
      notes: asText,
      archived: asBool,
    },
    dates: [
      ["startDate", "start_date"],
      ["endDate", "end_date"],
      ["useStatusAt", "use_status_at"],
    ],
  },
  dialas: {
    table: "dialas",
    cols: {
      number: asNum,
      days: asNum,
      status: asText,
      locked: asBool,
      notes: asText,
      rosterUnlockReason: asText,
    },
    dates: [
      ["startDate", "start_date"],
      ["endDate", "end_date"],
    ],
  },
  roster: {
    table: "diala_roster",
    cols: {
      dialaId: asText,
      personId: asText,
      personName: asText,
      role: asText,
      shareMin: asNum,
      order: asNum,
      notes: asText,
      archived: asBool,
    },
    dates: [],
  },
  days: {
    table: "diala_days",
    cols: {
      dialaId: asText,
      dayIndex: asNum,
      status: asText,
      workStart: asText,
      workEnd: asText,
      capacityMin: asNum,
      plannedWorkStart: asText,
      plannedWorkEnd: asText,
      plannedCapacityMin: asNum,
      notes: asText,
      revision: asNum,
      reopenReason: asText,
    },
    dates: [["date", "date"]],
  },
  entries: {
    table: "day_entries",
    cols: {
      dayId: asText,
      orderIndex: asNum,
      personId: asText,
      personName: asText,
      role: asText,
      shareholderId: asText,
      rightId: asText,
      startTime: asText,
      endTime: asText,
      plannedMin: asNum,
      actualPersonId: asText,
      status: asText,
      postponeToDayId: asText,
      reason: asText,
      notes: asText,
      entryType: asText,
    },
    dates: [],
  },
  usages: {
    table: "actual_usages",
    cols: {
      dayId: asText,
      entryId: asText,
      personId: asText,
      shareholderId: asText,
      startTime: asText,
      endTime: asText,
      minutes: asNum,
      usageType: asText,
      fuelLiters: asNum,
      fuelCost: asNum,
      royaltyAmountDue: asNum,
      stoppageMin: asNum,
      dieselSettlement: asText,
      dieselShortageLiters: asNum,
    },
    dates: [["date", "date"]],
  },
  stops: {
    table: "pump_stops",
    cols: {
      dayId: asText,
      dialaId: asText,
      personId: asText,
      reason: asText,
      minutes: asNum,
      startsAt: asText,
      endsAt: asText,
      notes: asText,
    },
    dates: [["recordDate", "record_date"], ["date", "record_date"]],
  },
  fuelRecords: {
    table: "fuel_records",
    cols: {
      dayId: asText,
      dialaId: asText,
      fuelType: asText,
      liters: asNum,
      price: asNum,
      shortage: asNum,
      notes: asText,
    },
    dates: [["recordDate", "record_date"], ["date", "record_date"]],
  },
  operatorRecords: {
    table: "operator_records",
    cols: {
      dayId: asText,
      dialaId: asText,
      personName: asText,
      mode: asText,
      amount: asNum,
      hourlyWageSnapshot: asNum,
      perCycleSnapshot: asNum,
      minutes: asNum,
      payMode: asText,
      notes: asText,
    },
    dates: [["recordDate", "record_date"], ["date", "record_date"]],
  },
  financeRecords: {
    table: "finance_records",
    cols: {
      kind: asText,
      dayId: asText,
      dialaId: asText,
      personId: asText,
      personName: asText,
      amount: asNum,
      currency: asText,
      direction: asText,
      status: asText,
      payMethod: asText,
      note: asText,
    },
    dates: [["recordDate", "record_date"], ["date", "record_date"], ["paidAt", "record_date"]],
  },
};

const camel = (s) => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());

/** بعض الخصائص أسماء أعمدتها مختلفة (order كلمة محجوزة في SQL) */
const COLUMN_OVERRIDES = { order: "order_index" };

/** يرفع صفوف مجموعة واحدة: upsert بالمعرّف + حذف ناعم لمن غاب */
async function upsertCollection(tx, key, pumpId, rows, actorId) {
  const spec = SPECS[key];
  if (!spec) return { key, upserted: 0, removed: 0 };
  const list = Array.isArray(rows) ? rows : [];
  const ids = [];
  for (const raw of list) {
    if (!raw || !validEntityId(raw.id)) continue;
    const cols = ["id", "pump_id"];
    const vals = [raw.id, pumpId];
    for (const [prop, fn] of Object.entries(spec.cols)) {
      cols.push(COLUMN_OVERRIDES[prop] ?? camelToSnake(prop));
      vals.push(fn(raw[prop]));
    }
    for (const [prop, column] of spec.dates) {
      cols.push(COLUMN_OVERRIDES[column] ?? column);
      vals.push(asDate(raw[prop]));
    }
    cols.push("payload");
    vals.push(JSON.stringify(raw));
    /* updated_at يُكتب بـ now() في SQL — بلا وسيط */
    cols.push("updated_at");

    const placeholders = vals.map((_, i) => `$${i + 1}`);
    /* updated_at = now() */
    const updatedIdx = cols.indexOf("updated_at") + 1;
    placeholders[updatedIdx - 1] = "now()";
    /* أسماء الأعمدة تُقتبس دائمًا: بعضها كلمات محجوزة (order) */
    const quoted = cols.map((c) => `"${c}"`);
    const quotedPlaceholders = placeholders.map((p) => (p === "now()" ? p : `$${Number(p.slice(1))}`));
    const updates = cols
      .filter((c) => c !== "id" && c !== "pump_id" && c !== "updated_at")
      .map((c) => `"${c}" = EXCLUDED."${c}"`)
      .concat([
        '"updated_at" = now()',
        '"deleted_at" = NULL',
        '"deleted_by" = NULL',
        '"deletion_reason" = \'\'',
      ]);

    await tx(
      `INSERT INTO ${spec.table} (${quoted.join(", ")})
       VALUES (${quotedPlaceholders.join(", ")})
       ON CONFLICT ("id") DO UPDATE SET ${updates.join(", ")}`,
      vals
    );
    ids.push(raw.id);
  }

  const removed = await tx(
    `UPDATE ${spec.table}
        SET deleted_at = now(), deleted_by = $2, deletion_reason = 'sync-superseded', updated_at = now()
      WHERE pump_id = $1 AND deleted_at IS NULL AND NOT (id = ANY($3::text[]))`,
    [pumpId, actorId, ids]
  );
  return { key, upserted: ids.length, removed: removed.rowCount ?? 0 };
}

function camelToSnake(s) {
  return s.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

/* --------------------------- التحقق قبل الكتابة --------------------------- */

/** حارس ساعات الكشف الأساسي: المجموع لا يتجاوز ساعات تشغيل المضخة */
function assertRosterCapacity(roster, capacityMin) {
  if (capacityMin <= 0) return;
  const byDiala = new Map();
  for (const row of roster) {
    if (!row || row.archived || row.deletedAt) continue;
    const id = asText(row.dialaId);
    if (!id) continue;
    byDiala.set(id, (byDiala.get(id) || 0) + asNum(row.shareMin));
  }
  for (const [dialaId, sum] of byDiala) {
    if (sum > capacityMin) {
      throw conflict(
        `مجموع نصيب كشف الدوام الأساسي (${Math.round(sum)} دقيقة) يتجاوز ساعات تشغيل المضخة (${Math.round(
          capacityMin
        )} دقيقة) — رُفض الحفظ.`,
        "roster_over_capacity"
      );
    }
  }
}

/** الكشف المثبَّت: يُرفض أي تغيير إلا بفك تثبيت بسبب موثّق */
function assertRosterUnlock(dialsIncoming, lockedDials, incomingRoster, existingRoster, actorId) {
  const unlocks = [];
  for (const dialaId of lockedDials) {
    const incoming = dialsIncoming.find((d) => asText(d.id) === dialaId);
    if (!incoming) continue;
    const rowsIn = incomingRoster
      .filter((r) => asText(r.dialaId) === dialaId && validEntityId(r.id))
      .map((r) => `${r.id}:${asNum(r.shareMin)}:${asNum(r.order)}:${asBool(r.archived) ? 1 : 0}`)
      .sort();
    if (rowsIn.join("|") === existingRoster.get(dialaId)) continue; /* لا تغيير في الكشف */
    const stillLocked = incoming.rosterLocked !== false;
    const reason = asText(incoming.rosterUnlockReason, 300);
    if (stillLocked || reason.length < 3) {
      throw conflict(
        "كشف الدوام الأساسي مثبَّت — فكّ التثبيت بسبب موثّق قبل التعديل.",
        "roster_locked"
      );
    }
    unlocks.push({ dialaId, reason, actorId });
  }
  return unlocks;
}

/** يبني بصمة صفوف الكشف الحالية في القاعدة لكل ديالة */
async function rosterFingerprint(pumpId) {
  const rows = await q(
    `SELECT diala_id, id, share_min, order_index, archived
       FROM diala_roster WHERE pump_id = $1 AND deleted_at IS NULL`,
    [pumpId]
  );
  const map = new Map();
  for (const r of rows.rows) {
    const key = r.diala_id;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(`${r.id}:${asNum(r.share_min)}:${asNum(r.order_index)}:${r.archived ? 1 : 0}`);
  }
  for (const [key, list] of map) map.set(key, list.sort().join("|"));
  return map;
}

async function lockedDialaIds(pumpId) {
  const rows = await q(`SELECT id FROM dialas WHERE pump_id = $1 AND roster_locked = true`, [pumpId]);
  return rows.rows.map((r) => r.id);
}

/* ------------------------------ القراءة الكاملة ----------------------------- */

async function readOperating(pumpId, userId) {
  const [
    settings,
    people,
    shareholders,
    dialas,
    roster,
    days,
    entries,
    usages,
    stops,
    fuel,
    operators,
    finance,
    personal,
    sync,
  ] = await Promise.all([
    q(`SELECT * FROM pump_settings WHERE pump_id = $1`, [pumpId]),
    q(`SELECT * FROM pump_people WHERE pump_id = $1 AND deleted_at IS NULL ORDER BY created_at`, [pumpId]),
    q(`SELECT * FROM pump_shareholders WHERE pump_id = $1 AND deleted_at IS NULL ORDER BY base_order`, [pumpId]),
    q(`SELECT * FROM dialas WHERE pump_id = $1 AND deleted_at IS NULL ORDER BY number`, [pumpId]),
    q(`SELECT * FROM diala_roster WHERE pump_id = $1 AND deleted_at IS NULL ORDER BY order_index`, [pumpId]),
    q(`SELECT * FROM diala_days WHERE pump_id = $1 AND deleted_at IS NULL ORDER BY date`, [pumpId]),
    q(`SELECT * FROM day_entries WHERE pump_id = $1 AND deleted_at IS NULL ORDER BY order_index`, [pumpId]),
    q(`SELECT * FROM actual_usages WHERE pump_id = $1 AND deleted_at IS NULL`, [pumpId]),
    q(`SELECT * FROM pump_stops WHERE pump_id = $1 AND deleted_at IS NULL`, [pumpId]),
    q(`SELECT * FROM fuel_records WHERE pump_id = $1 AND deleted_at IS NULL`, [pumpId]),
    q(`SELECT * FROM operator_records WHERE pump_id = $1 AND deleted_at IS NULL`, [pumpId]),
    q(`SELECT * FROM finance_records WHERE pump_id = $1 AND deleted_at IS NULL`, [pumpId]),
    q(`SELECT * FROM personal_records WHERE user_id = $1 AND deleted_at IS NULL ORDER BY record_date DESC`, [
      userId,
    ]),
    q(`SELECT * FROM pump_sync WHERE pump_id = $1`, [pumpId]),
  ]);

  const syncRow = sync.rows[0] ?? null;
  return {
    settings: settings.rows[0] ? rowOut(settings.rows[0]) : null,
    people: people.rows.map(rowOut),
    shareholders: shareholders.rows.map(rowOut),
    dialas: dialas.rows.map(rowOut),
    roster: roster.rows.map(rowOut),
    days: days.rows.map(rowOut),
    entries: entries.rows.map(rowOut),
    usages: usages.rows.map(rowOut),
    stops: stops.rows.map(rowOut),
    fuelRecords: fuel.rows.map(rowOut),
    operatorRecords: operators.rows.map(rowOut),
    financeRecords: finance.rows.map(rowOut),
    personalRecords: personal.rows.map(rowOut),
    meta: {
      version: syncRow ? Number(syncRow.version) : 0,
      migratedAt: syncRow?.migrated_at ?? null,
      migrationSource: syncRow?.migration_source ?? "",
      lastPushAt: syncRow?.last_push_at ?? null,
      serverTime: nowIso(),
    },
  };
}

/** يُعيد الصف بالشكل الذي تتوقعه الواجهة (camelCase) من payload المحفوظ */
function rowOut(row) {
  const payload = row.payload && typeof row.payload === "object" ? row.payload : {};
  const out = { ...payload };
  out.id = row.id;
  if ("created_at" in row) out.createdAt = row.created_at;
  if ("updated_at" in row) out.updatedAt = row.updated_at;
  if (row.deleted_at) {
    out.deletedAt = row.deleted_at;
    out.deletedBy = row.deleted_by;
    out.deletionReason = row.deletion_reason;
  }
  return out;
}

operatingRouter.get(
  "/pumps/:pumpId/operating",
  wrap(async (req, res) => {
    const { pump, role, membership } = await requireOperatingRead(req.params.pumpId, req.user);
    const data = await readOperating(pump.id, req.user.id);
    /* العضو لا يرى سجلات غيره الشخصية، والمسؤول لا يرى سجلات المستخدمين */
    res.json({
      role,
      pump: { id: pump.id, pumpCode: pump.code, name: pump.name, location: pump.location, status: pump.status },
      membership: membership ? { id: membership.id, membershipType: membership.membership_type } : null,
      ...data,
    });
  })
);

/* --------------------------- الحفظ الكامل (Sync) --------------------------- */

async function applySync(req, res, { source = "api", migration = false } = {}) {
  const { pump } = await requireOperatingWrite(req.params.pumpId, req.user);
  const body = req.body ?? {};
  const data = body.data && typeof body.data === "object" ? body.data : body;
  const clientVersion = Number.isFinite(Number(body.version)) ? Number(body.version) : null;

  if (migration) {
    const existing = await q(`SELECT migrated_at FROM pump_sync WHERE pump_id = $1`, [pump.id]);
    if (existing.rowCount > 0 && existing.rows[0].migrated_at) {
      const data2 = await readOperating(pump.id, req.user.id);
      return res.json({
        alreadyMigrated: true,
        migratedAt: existing.rows[0].migrated_at,
        meta: data2.meta,
      });
    }
  }

  const counts = [];
  const unlocks = [];

  await withTransaction(async (tx) => {
    /* إعدادات المضخة — مصدر مركزي واحد */
    if (data.settings && typeof data.settings === "object") {
      const s = data.settings;
      await tx(
        `INSERT INTO pump_settings (
            pump_id, wells, farm, engine, energy_type, work_start, work_end,
            fuel_consumption_per_hour, fuel_per_cycle, fuel_calc_mode, fuel_price,
            royalty_enabled, royalty_mode, royalty_per_cycle, royalty_per_hour,
            operator_name, operator_hourly_wage, operator_start, operator_end,
            share_unit, currency, notes, archived, payload, updated_at, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,now(),$25)
         ON CONFLICT (pump_id) DO UPDATE SET
            wells = EXCLUDED.wells, farm = EXCLUDED.farm, engine = EXCLUDED.engine,
            energy_type = EXCLUDED.energy_type, work_start = EXCLUDED.work_start, work_end = EXCLUDED.work_end,
            fuel_consumption_per_hour = EXCLUDED.fuel_consumption_per_hour,
            fuel_per_cycle = EXCLUDED.fuel_per_cycle, fuel_calc_mode = EXCLUDED.fuel_calc_mode,
            fuel_price = EXCLUDED.fuel_price, royalty_enabled = EXCLUDED.royalty_enabled,
            royalty_mode = EXCLUDED.royalty_mode, royalty_per_cycle = EXCLUDED.royalty_per_cycle,
            royalty_per_hour = EXCLUDED.royalty_per_hour, operator_name = EXCLUDED.operator_name,
            operator_hourly_wage = EXCLUDED.operator_hourly_wage, operator_start = EXCLUDED.operator_start,
            operator_end = EXCLUDED.operator_end, share_unit = EXCLUDED.share_unit,
            currency = EXCLUDED.currency, notes = EXCLUDED.notes, archived = EXCLUDED.archived,
            payload = EXCLUDED.payload, updated_at = now(), updated_by = EXCLUDED.updated_by`,
        [
          pump.id,
          asText(s.wells),
          asText(s.farm),
          asText(s.engine),
          asText(s.energyType, 20) || "diesel",
          asText(s.workStart, 8) || "06:00",
          asText(s.workEnd, 8) || "18:00",
          asNum(s.fuelConsumptionPerHour),
          asNum(s.fuelPerCycle),
          asText(s.fuelCalcMode, 20) || "hour",
          asNum(s.fuelPrice),
          asBool(s.royaltyEnabled),
          asText(s.royaltyMode, 20) || "cycle",
          asNum(s.royaltyPerCycle),
          asNum(s.royaltyPerHour),
          asText(s.operatorName),
          asNum(s.operatorHourlyWage),
          asText(s.operatorStart, 8),
          asText(s.operatorEnd, 8),
          asText(s.shareUnit, 40),
          asText(s.currency, 8) || "YER",
          asText(s.notes, 1000),
          asBool(s.archived),
          JSON.stringify(s),
          req.user.id,
        ]
      );
      counts.push({ key: "settings", upserted: 1, removed: 0 });
    }

    const capacityMin = durationMin(
      data.settings?.workStart || "06:00",
      data.settings?.workEnd || "18:00"
    );

    /* الروابط المرجعية أولًا: الديالات ثم الكشف ثم الأيام ثم الصفوف */
    if (Array.isArray(data.dialas)) {
      counts.push(await upsertCollection(tx, "dialas", pump.id, data.dialas, req.user.id));
    }
    if (Array.isArray(data.roster)) {
      /* كل صف يُنسب لديالة هذه المضخة فقط */
      const ownDials = await tx(`SELECT id FROM dialas WHERE pump_id = $1`, [pump.id]);
      const ownIds = new Set(ownDials.rows.map((r) => r.id));
      data.roster = data.roster.filter(
        (r) => r && validEntityId(r.id) && (r.dialaId ? ownIds.has(String(r.dialaId)) : false)
      );
      assertRosterCapacity(data.roster, capacityMin);
      const locked = await lockedDialaIds(pump.id);
      if (locked.length) {
        const fingerprint = await rosterFingerprint(pump.id);
        unlocks.push(
          ...assertRosterUnlock(data.dialas ?? [], locked, data.roster, fingerprint, req.user.id)
        );
      }
      counts.push(await upsertCollection(tx, "roster", pump.id, data.roster, req.user.id));
      for (const u of unlocks) {
        await tx(
          `UPDATE dialas SET roster_locked = false, roster_unlock_reason = $2, updated_at = now() WHERE id = $1`,
          [u.dialaId, u.reason]
        );
      }
    }
    if (Array.isArray(data.days)) {
      /* كل يوم يجب أن يخصّ هذه المضخة والديالة المذكورة */
      for (const day of data.days) {
        if (!day || !validEntityId(day.id)) continue;
        const dialaId = asText(day.dialaId);
        if (!dialaId) continue;
        const ok = await tx(`SELECT 1 FROM dialas WHERE id = $1 AND pump_id = $2`, [dialaId, pump.id]);
        if (ok.rowCount === 0) throw badRequest("يوم مرتبط بديالة لا تنتمي لهذه المضخة.", "unknown_diala");
      }
      counts.push(await upsertCollection(tx, "days", pump.id, data.days, req.user.id));
    }
    if (Array.isArray(data.entries)) {
      for (const entry of data.entries) {
        if (!entry || !validEntityId(entry.id)) continue;
        const dayId = asText(entry.dayId);
        const ok = await tx(`SELECT 1 FROM diala_days WHERE id = $1 AND pump_id = $2`, [dayId, pump.id]);
        if (ok.rowCount === 0) throw badRequest("دور في يوم لا ينتمي لهذه المضخة.", "unknown_day");
      }
      counts.push(await upsertCollection(tx, "entries", pump.id, data.entries, req.user.id));
    }

    for (const key of [
      "people",
      "shareholders",
      "usages",
      "stops",
      "fuelRecords",
      "operatorRecords",
      "financeRecords",
    ]) {
      if (Array.isArray(data[key])) {
        counts.push(await upsertCollection(tx, key, pump.id, data[key], req.user.id));
      }
    }

    /* السجلات الشخصية: تُكتب لصاحبها فقط، ولا تمسّ بيانات المضخة الرسمية (§16) */
    if (Array.isArray(data.personalRecords)) {
      const mine = data.personalRecords.filter((r) => r && validEntityId(r.id));
      const written = await upsertPersonal(tx, req.user.id, pump.id, mine);
      counts.push({ key: "personalRecords", upserted: written, removed: 0 });
    }

    /* الكيانات غير المنمذجة بعد تُحفظ كما هي فلا تُفقد أي بيانات */
    if (data.extra && typeof data.extra === "object") {
      await tx(
        `INSERT INTO pump_sync (pump_id, extra, updated_at) VALUES ($1, $2::jsonb, now())
         ON CONFLICT (pump_id) DO UPDATE SET extra = EXCLUDED.extra, updated_at = now()`,
        [pump.id, JSON.stringify(data.extra)]
      );
    }

    await tx(
      `INSERT INTO pump_sync (pump_id, version, last_push_at, last_push_by, migrated_at, migration_source, updated_at)
       VALUES ($1, 1, now(), $2, CASE WHEN $4 THEN now() ELSE NULL END, $3, now())
       ON CONFLICT (pump_id) DO UPDATE SET
         version = pump_sync.version + 1,
         last_push_at = now(),
         last_push_by = EXCLUDED.last_push_by,
         migrated_at = COALESCE(pump_sync.migrated_at, EXCLUDED.migrated_at),
         migration_source = CASE WHEN EXCLUDED.migration_source <> '' THEN EXCLUDED.migration_source ELSE pump_sync.migration_source END,
         updated_at = now()`,
      [pump.id, req.user.id, source, migration]
    );
  });

  for (const u of unlocks) {
    await logAudit(req, {
      action: "roster.unlock",
      entityType: "diala",
      entityId: u.dialaId,
      pumpId: pump.id,
      actorRole: "manager",
      metadata: {
        entityLabel: `فك تثبيت كشف الديالة`,
        reason: u.reason,
        before: { rosterLocked: true },
        after: { rosterLocked: false },
      },
    });
  }

  await logAudit(req, {
    action: migration ? "migrate.local" : "operating.sync",
    entityType: "pump_state",
    entityId: pump.id,
    pumpId: pump.id,
    entityLabel: pump.name,
    actorRole: "manager",
    source: migration ? "migration" : "api",
    metadata: { counts, source, clientVersion },
  });

  const after = await readOperating(pump.id, req.user.id);
  res.json({ counts, meta: after.meta, serverTime: nowIso() });
}

operatingRouter.put(
  "/pumps/:pumpId/operating",
  wrap(async (req, res) => applySync(req, res, { source: "api" }))
);

operatingRouter.post(
  "/pumps/:pumpId/migrate-local",
  wrap(async (req, res) => applySync(req, res, { source: "localStorage-v2", migration: true }))
);

/* --------------------------- السجلات الشخصية للمستخدم --------------------------- */

async function upsertPersonal(tx, userId, pumpId, rows) {
  let n = 0;
  for (const raw of rows) {
    await tx(
      `INSERT INTO personal_records (id, user_id, pump_id, record_date, kind, minutes, liters, cost, notes, payload, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now())
       ON CONFLICT (id) DO UPDATE SET
         record_date = EXCLUDED.record_date, kind = EXCLUDED.kind, minutes = EXCLUDED.minutes,
         liters = EXCLUDED.liters, cost = EXCLUDED.cost, notes = EXCLUDED.notes,
         payload = EXCLUDED.payload, updated_at = now(), deleted_at = NULL, deletion_reason = ''
       WHERE personal_records.user_id = $2`,
      [
        raw.id,
        userId,
        pumpId ?? null,
        asDate(raw.date ?? raw.recordDate),
        asText(raw.kind, 40) || "turn",
        asNum(raw.minutes),
        asNum(raw.liters),
        asNum(raw.cost),
        asText(raw.notes, 500),
        JSON.stringify(raw),
      ]
    );
    n += 1;
  }
  return n;
}

operatingRouter.get(
  "/me/records",
  wrap(async (req, res) => {
    const rows = await q(
      `SELECT * FROM personal_records WHERE user_id = $1 AND deleted_at IS NULL ORDER BY record_date DESC NULLS LAST, created_at DESC`,
      [req.user.id]
    );
    res.json({ records: rows.rows.map(rowOut) });
  })
);

operatingRouter.post(
  "/me/records",
  wrap(async (req, res) => {
    const body = req.body ?? {};
    const id = validEntityId(body.id) ? body.id : `pr_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-5)}`;
    const pumpId = /^[0-9a-f-]{36}$/i.test(String(body.pumpId ?? "")) ? body.pumpId : null;
    await q(
      `INSERT INTO personal_records (id, user_id, pump_id, record_date, kind, minutes, liters, cost, notes, payload)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (id) DO UPDATE SET
         record_date = EXCLUDED.record_date, kind = EXCLUDED.kind, minutes = EXCLUDED.minutes,
         liters = EXCLUDED.liters, cost = EXCLUDED.cost, notes = EXCLUDED.notes,
         payload = EXCLUDED.payload, updated_at = now()
       WHERE personal_records.user_id = $2`,
      [
        id,
        req.user.id,
        pumpId,
        asDate(body.date ?? body.recordDate),
        asText(body.kind, 40) || "turn",
        asNum(body.minutes),
        asNum(body.liters),
        asNum(body.cost),
        asText(body.notes, 500),
        JSON.stringify({ ...body, id }),
      ]
    );
    await logAudit(req, {
      action: "personal.record_upsert",
      entityType: "personal_record",
      entityId: id,
      actorRole: req.user.accountType,
      metadata: { entityLabel: asText(body.notes, 60) || "سجل شخصي", scope: "personal" },
    });
    const row = await q(`SELECT * FROM personal_records WHERE id = $1 AND user_id = $2`, [id, req.user.id]);
    res.status(201).json({ record: row.rowCount ? rowOut(row.rows[0]) : null });
  })
);

operatingRouter.delete(
  "/me/records/:id",
  wrap(async (req, res) => {
    const reason = asText(req.body?.reason, 200) || "حذف من صاحب السجل";
    const r = await q(
      `UPDATE personal_records SET deleted_at = now(), deleted_by = $1, deletion_reason = $2, updated_at = now()
        WHERE id = $3 AND user_id = $1 AND deleted_at IS NULL`,
      [req.user.id, reason, req.params.id]
    );
    if (r.rowCount === 0) throw notFound("السجل غير موجود.");
    await logAudit(req, {
      action: "personal.record_remove",
      entityType: "personal_record",
      entityId: req.params.id,
      actorRole: req.user.accountType,
      metadata: { reason, scope: "personal" },
    });
    res.json({ ok: true });
  })
);

/* ------------------------------ نقاط REST الصريحة ----------------------------- */

operatingRouter.get(
  "/pumps/:pumpId/dialas",
  wrap(async (req, res) => {
    const { pump } = await requireOperatingRead(req.params.pumpId, req.user);
    const rows = await q(
      `SELECT * FROM dialas WHERE pump_id = $1 AND deleted_at IS NULL ORDER BY number`,
      [pump.id]
    );
    res.json({ dialas: rows.rows.map(rowOut) });
  })
);

operatingRouter.post(
  "/pumps/:pumpId/dialas",
  wrap(async (req, res) => {
    const { pump } = await requireOperatingWrite(req.params.pumpId, req.user);
    const body = req.body ?? {};
    if (!validEntityId(body.id)) throw badRequest("معرّف الديالة مطلوب.", "bad_id");
    const row = await q(
      `INSERT INTO dialas (id, pump_id, number, start_date, days, end_date, status, notes, payload, deleted_at, deleted_by, deletion_reason)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NULL,NULL,'')
       ON CONFLICT (id) DO UPDATE SET
         number = EXCLUDED.number, start_date = EXCLUDED.start_date, days = EXCLUDED.days,
         end_date = EXCLUDED.end_date, status = EXCLUDED.status, notes = EXCLUDED.notes,
         payload = EXCLUDED.payload, updated_at = now(), deleted_at = NULL, deletion_reason = ''
       RETURNING *`,
      [
        body.id,
        pump.id,
        asNum(body.number),
        asDate(body.startDate),
        asNum(body.days),
        asDate(body.endDate),
        asText(body.status, 20) || (asBool(body.locked) ? "locked" : "draft"),
        asText(body.notes, 500),
        JSON.stringify(body),
      ]
    );
    await logAudit(req, {
      action: "diala.create",
      entityType: "diala",
      entityId: body.id,
      pumpId: pump.id,
      actorRole: "manager",
      metadata: { entityLabel: `ديالة ${asNum(body.number)}`, after: { days: asNum(body.days), startDate: asDate(body.startDate) } },
    });
    res.status(201).json({ diala: rowOut(row.rows[0]) });
  })
);

operatingRouter.get(
  "/dialas/:dialaId/base-roster",
  wrap(async (req, res) => {
    const diala = await dialaWithAccess(req.params.dialaId, req.user, false);
    const rows = await q(
      `SELECT * FROM diala_roster WHERE diala_id = $1 AND deleted_at IS NULL ORDER BY order_index`,
      [diala.id]
    );
    const settings = await q(`SELECT work_start, work_end FROM pump_settings WHERE pump_id = $1`, [
      diala.pump_id,
    ]);
    const capacityMin = durationMin(
      settings.rows[0]?.work_start || "06:00",
      settings.rows[0]?.work_end || "18:00"
    );
    const totalMin = rows.rows.reduce((sum, r) => sum + asNum(r.share_min), 0);
    res.json({
      roster: rows.rows.map(rowOut),
      capacityMin,
      totalMin,
      remainingMin: Math.max(0, capacityMin - totalMin),
      rosterLocked: Boolean(diala.roster_locked),
    });
  })
);

operatingRouter.post(
  "/dialas/:dialaId/base-roster",
  wrap(async (req, res) => {
    const diala = await dialaWithAccess(req.params.dialaId, req.user, true);
    /* المسار مقيّد بالديالة: كل صف يُنسب إليها مهما أرسل العميل */
    const rows = (Array.isArray(req.body?.roster) ? req.body.roster : [])
      .filter((r) => r && typeof r === "object")
      .map((r) => ({ ...r, dialaId: diala.id }));
    const settings = await q(`SELECT work_start, work_end, payload FROM pump_settings WHERE pump_id = $1`, [
      diala.pump_id,
    ]);
    const workStart = settings.rows[0]?.work_start || req.body?.workStart || "06:00";
    const workEnd = settings.rows[0]?.work_end || req.body?.workEnd || "18:00";
    const capacityMin = durationMin(workStart, workEnd);

    for (const r of rows) {
      if (!validEntityId(r?.id)) throw badRequest("معرّف صف الكشف مطلوب.", "bad_id");
    }
    /* حارس الخادم: مجموع النصيب لا يتجاوز ساعات تشغيل المضخة */
    assertRosterCapacity(rows, capacityMin);

    if (diala.roster_locked) {
      const reason = asText(req.body?.unlockReason, 300);
      if (reason.length < 3) {
        throw conflict(
          "كشف الدوام الأساسي مثبَّت — فكّ التثبيت بسبب موثّق قبل التعديل.",
          "roster_locked"
        );
      }
      await q(`UPDATE dialas SET roster_locked = false, roster_unlock_reason = $2 WHERE id = $1`, [
        diala.id,
        reason,
      ]);
      await logAudit(req, {
        action: "roster.unlock",
        entityType: "diala",
        entityId: diala.id,
        pumpId: diala.pump_id,
        actorRole: "manager",
        metadata: { reason, before: { rosterLocked: true }, after: { rosterLocked: false } },
      });
    }

    const before = await q(
      `SELECT id, share_min, order_index, archived FROM diala_roster WHERE diala_id = $1 AND deleted_at IS NULL ORDER BY order_index`,
      [diala.id]
    );

    await withTransaction(async (tx) => {
      await upsertCollection(tx, "roster", diala.pump_id, rows.map((r) => ({ ...r, dialaId: diala.id })), req.user.id);
    });

    await logAudit(req, {
      action: "roster.change",
      entityType: "diala",
      entityId: diala.id,
      pumpId: diala.pump_id,
      actorRole: "manager",
      metadata: {
        entityLabel: `كشف الدوام الأساسي — الديالة ${diala.number}`,
        before: { rows: before.rows.map((r) => ({ id: r.id, shareMin: asNum(r.share_min) })), totalMin: before.rows.reduce((s, r) => s + asNum(r.share_min), 0) },
        after: { rows: rows.map((r) => ({ id: r.id, shareMin: asNum(r.shareMin) })), totalMin: rows.reduce((s, r) => s + asNum(r.shareMin), 0) },
        capacityMin,
      },
    });

    const after = await q(
      `SELECT * FROM diala_roster WHERE diala_id = $1 AND deleted_at IS NULL ORDER BY order_index`,
      [diala.id]
    );
    res.json({
      roster: after.rows.map(rowOut),
      capacityMin,
      totalMin: after.rows.reduce((s, r) => s + asNum(r.share_min), 0),
    });
  })
);

operatingRouter.post(
  "/dialas/:dialaId/roster/lock",
  wrap(async (req, res) => {
    const diala = await dialaWithAccess(req.params.dialaId, req.user, true);
    await q(`UPDATE dialas SET roster_locked = true, roster_locked_at = now(), roster_locked_by = $2 WHERE id = $1`, [
      diala.id,
      req.user.id,
    ]);
    await logAudit(req, {
      action: "roster.lock",
      entityType: "diala",
      entityId: diala.id,
      pumpId: diala.pump_id,
      actorRole: "manager",
      metadata: { before: { rosterLocked: false }, after: { rosterLocked: true } },
    });
    res.json({ rosterLocked: true });
  })
);

operatingRouter.post(
  "/dialas/:dialaId/roster/unlock",
  wrap(async (req, res) => {
    const diala = await dialaWithAccess(req.params.dialaId, req.user, true);
    const reason = asText(req.body?.reason, 300);
    if (reason.length < 3) throw badRequest("سبب فك التثبيت مطلوب.", "reason_required");
    await q(`UPDATE dialas SET roster_locked = false, roster_unlock_reason = $2 WHERE id = $1`, [
      diala.id,
      reason,
    ]);
    await logAudit(req, {
      action: "roster.unlock",
      entityType: "diala",
      entityId: diala.id,
      pumpId: diala.pump_id,
      actorRole: "manager",
      metadata: { reason, before: { rosterLocked: true }, after: { rosterLocked: false } },
    });
    res.json({ rosterLocked: false });
  })
);

operatingRouter.get(
  "/dialas/:dialaId/days",
  wrap(async (req, res) => {
    const diala = await dialaWithAccess(req.params.dialaId, req.user, false);
    const rows = await q(
      `SELECT * FROM diala_days WHERE diala_id = $1 AND deleted_at IS NULL ORDER BY date`,
      [diala.id]
    );
    res.json({ days: rows.rows.map(rowOut) });
  })
);

operatingRouter.get(
  "/days/:dayId/actual-schedule",
  wrap(async (req, res) => {
    const day = await dayWithAccess(req.params.dayId, req.user, false);
    const rows = await q(
      `SELECT * FROM day_entries WHERE day_id = $1 AND deleted_at IS NULL ORDER BY order_index`,
      [day.id]
    );
    res.json({ entries: rows.rows.map(rowOut) });
  })
);

/** الدوام الفعلي — يُستبدل لليوم المحدد فقط، ولا يمسّ كشف الدوام الأساسي أبدًا */
operatingRouter.post(
  "/days/:dayId/actual-schedule",
  wrap(async (req, res) => {
    const day = await dayWithAccess(req.params.dayId, req.user, true);
    const rows = Array.isArray(req.body?.entries) ? req.body.entries : [];
    for (const r of rows) {
      if (!validEntityId(r?.id)) throw badRequest("معرّف صف اليوم مطلوب.", "bad_id");
    }
    const before = await q(
      `SELECT id, person_id, order_index, planned_min, entry_type FROM day_entries WHERE day_id = $1 AND deleted_at IS NULL ORDER BY order_index`,
      [day.id]
    );
    await withTransaction(async (tx) => {
      await upsertCollection(tx, "entries", day.pump_id, rows.map((r) => ({ ...r, dayId: day.id })), req.user.id);
    });
    await logAudit(req, {
      action: "actual_day.change",
      entityType: "day",
      entityId: day.id,
      pumpId: day.pump_id,
      actorRole: "manager",
      metadata: {
        entityLabel: `اليوم ${asDate(day.date) ?? ""}`,
        before: before.rows.map((r) => ({ id: r.id, personId: r.person_id, order: asNum(r.order_index), min: asNum(r.planned_min), type: r.entry_type })),
        after: rows.map((r) => ({ id: r.id, personId: asText(r.personId), order: asNum(r.orderIndex), min: asNum(r.plannedMin), type: asText(r.entryType) })),
        note: "الدوام الفعلي لا يعدّل كشف الدوام الأساسي",
      },
    });
    const after = await q(
      `SELECT * FROM day_entries WHERE day_id = $1 AND deleted_at IS NULL ORDER BY order_index`,
      [day.id]
    );
    res.json({ entries: after.rows.map(rowOut) });
  })
);

async function dialaWithAccess(dialaId, user, write) {
  if (!validEntityId(dialaId)) throw notFound("الديالة غير موجودة.");
  const found = await q(`SELECT * FROM dialas WHERE id = $1 AND deleted_at IS NULL`, [dialaId]);
  if (found.rowCount === 0) throw notFound("الديالة غير موجودة.");
  const diala = found.rows[0];
  if (write) await requireOperatingWrite(diala.pump_id, user);
  else await requireOperatingRead(diala.pump_id, user);
  return diala;
}

async function dayWithAccess(dayId, user, write) {
  if (!validEntityId(dayId)) throw notFound("اليوم غير موجود.");
  const found = await q(`SELECT * FROM diala_days WHERE id = $1 AND deleted_at IS NULL`, [dayId]);
  if (found.rowCount === 0) throw notFound("اليوم غير موجود.");
  const day = found.rows[0];
  if (write) await requireOperatingWrite(day.pump_id, user);
  else await requireOperatingRead(day.pump_id, user);
  return day;
}
