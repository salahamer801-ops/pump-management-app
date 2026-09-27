/**
 * الاتصال بقاعدة البيانات (PostgreSQL) + المخطّط.
 * القاعدة: كل شيء يُنشأ بـ IF NOT EXISTS — لا حذف ولا فقدان بيانات.
 */
import pg from "pg";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  console.error("[db] DATABASE_URL غير موجود في بيئة التشغيل");
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  idleTimeoutMillis: 10_000,
  connectionTimeoutMillis: 15_000,
});

// قاعدة البيانات قد تكون نائمة (تُوقَظ عند أول طلب) — لا نُسقط العملية بسبب خطأ اتصال
pool.on("error", (err) => {
  console.error("[db] خطأ في الاتصال الخامل:", err.message);
});

function isConnectionError(err) {
  const code = err && err.code;
  return (
    code === "ECONNRESET" ||
    code === "ECONNREFUSED" ||
    code === "ETIMEDOUT" ||
    code === "EPIPE" ||
    code === "57P01" ||
    code === "57P03" ||
    code === "08006" ||
    code === "08001" ||
    /Connection terminated|timeout|socket hang up/i.test(String((err && err.message) || ""))
  );
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** استعلام واحد مع إعادة محاولة واحدة عند انقطاع الاتصال (قاعدة نائمة) */
export async function q(text, params = []) {
  try {
    return await pool.query(text, params);
  } catch (err) {
    if (!isConnectionError(err)) throw err;
    await sleep(400);
    return pool.query(text, params);
  }
}

export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const out = await fn(async (text, params = []) => client.query(text, params));
    await client.query("COMMIT");
    return out;
  } catch (err) {
    try {
      await client.query("ROLLBACK");
    } catch {
      /* ignore */
    }
    throw err;
  } finally {
    client.release();
  }
}

const SCHEMA = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  phone text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  account_type text NOT NULL CHECK (account_type IN ('manager','user')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  last_login_at timestamptz
);

/* مسؤول النظام: أول حساب مسؤول يُرقّى تلقائيًا، وبعدها يُعيَّن من اللوحة */
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;

/* إعدادات النظام العامة (إعلان للمستخدمين، فتح/إغلاق التسجيل) */
CREATE TABLE IF NOT EXISTS app_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

CREATE TABLE IF NOT EXISTS pumps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  location text NOT NULL DEFAULT '',
  manager_id uuid NOT NULL REFERENCES users(id),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pumps_manager_idx ON pumps(manager_id);

CREATE TABLE IF NOT EXISTS pump_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pump_id uuid NOT NULL REFERENCES pumps(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  membership_type text NOT NULL DEFAULT 'viewer'
    CHECK (membership_type IN ('shareholder','rightHolder','actualUser','viewer','accountant','pumpOperator')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected','removed')),
  person_id text,
  person_name text NOT NULL DEFAULT '',
  share_ref text NOT NULL DEFAULT '',
  note text NOT NULL DEFAULT '',
  requested_at timestamptz NOT NULL DEFAULT now(),
  approved_at timestamptz,
  approved_by uuid,
  rejected_at timestamptz,
  rejected_by uuid,
  reject_reason text NOT NULL DEFAULT '',
  removed_at timestamptz,
  removed_by uuid,
  remove_reason text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pump_id, user_id)
);
CREATE INDEX IF NOT EXISTS memberships_pump_idx ON pump_memberships(pump_id);
CREATE INDEX IF NOT EXISTS memberships_user_idx ON pump_memberships(user_id);

CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  source text NOT NULL DEFAULT 'web'
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);

CREATE TABLE IF NOT EXISTS password_resets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code_hash text NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS password_resets_user_idx ON password_resets(user_id);

CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid,
  actor_name text NOT NULL DEFAULT '',
  actor_role text NOT NULL DEFAULT 'system',
  action text NOT NULL,
  entity_type text NOT NULL DEFAULT '',
  entity_id text NOT NULL DEFAULT '',
  pump_id uuid,
  source text NOT NULL DEFAULT 'api',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip text NOT NULL DEFAULT '',
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_pump_idx ON audit_logs(pump_id);
CREATE INDEX IF NOT EXISTS audit_actor_idx ON audit_logs(actor_id);

/* =======================================================================
   المرحلة الثانية (§ Phase 2): بيانات التشغيل الرسمية على الخادم.
   كل الجداول إضافية (IF NOT EXISTS) — لا حذف ولا فقدان لأي بيانات قائمة.
   معرّفات الكيانات نصية لأن الواجهة تولّدها محليًا (p_xxx)، وpump_id مفتاح
   أجنبي حقيقي إلى جدول المضخات كما هو.
   ======================================================================= */

/* إعدادات المضخة التشغيلية — مصدر مركزي واحد لبيانات المضخة */
CREATE TABLE IF NOT EXISTS pump_settings (
  pump_id uuid PRIMARY KEY REFERENCES pumps(id) ON DELETE CASCADE,
  wells text NOT NULL DEFAULT '',
  farm text NOT NULL DEFAULT '',
  engine text NOT NULL DEFAULT '',
  energy_type text NOT NULL DEFAULT 'diesel',
  work_start text NOT NULL DEFAULT '06:00',
  work_end text NOT NULL DEFAULT '18:00',
  fuel_consumption_per_hour numeric NOT NULL DEFAULT 0,
  fuel_per_cycle numeric NOT NULL DEFAULT 0,
  fuel_calc_mode text NOT NULL DEFAULT 'hour',
  fuel_price numeric NOT NULL DEFAULT 0,
  royalty_enabled boolean NOT NULL DEFAULT false,
  royalty_mode text NOT NULL DEFAULT 'cycle',
  royalty_per_cycle numeric NOT NULL DEFAULT 0,
  royalty_per_hour numeric NOT NULL DEFAULT 0,
  operator_name text NOT NULL DEFAULT '',
  operator_hourly_wage numeric NOT NULL DEFAULT 0,
  operator_start text NOT NULL DEFAULT '',
  operator_end text NOT NULL DEFAULT '',
  share_unit text NOT NULL DEFAULT '',
  currency text NOT NULL DEFAULT 'YER',
  notes text NOT NULL DEFAULT '',
  archived boolean NOT NULL DEFAULT false,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

/* الأشخاص داخل المضخة (مرجع مستقل عن حسابات المستخدمين) */
CREATE TABLE IF NOT EXISTS pump_people (
  id text PRIMARY KEY,
  pump_id uuid NOT NULL REFERENCES pumps(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  national_id text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  guest boolean NOT NULL DEFAULT false,
  archived boolean NOT NULL DEFAULT false,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  deleted_by uuid,
  deletion_reason text NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS pump_people_pump_idx ON pump_people(pump_id);

/* المساهمون — سجل مرجعي داخل المضخة، منفصل عن جدول المستخدمين والعضويات */
CREATE TABLE IF NOT EXISTS pump_shareholders (
  id text PRIMARY KEY,
  pump_id uuid NOT NULL REFERENCES pumps(id) ON DELETE CASCADE,
  person_id text,
  share_no integer,
  units numeric NOT NULL DEFAULT 0,
  base_hours_min numeric NOT NULL DEFAULT 0,
  base_order integer NOT NULL DEFAULT 0,
  start_date date,
  end_date date,
  status text NOT NULL DEFAULT 'active',
  use_status text NOT NULL DEFAULT 'continuing',
  counterpart_person_id text,
  counterpart_phone text NOT NULL DEFAULT '',
  use_status_at date,
  use_status_note text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  archived boolean NOT NULL DEFAULT false,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  deleted_by uuid,
  deletion_reason text NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS pump_shareholders_pump_idx ON pump_shareholders(pump_id);

/* الديالات (الدورات) */
CREATE TABLE IF NOT EXISTS dialas (
  id text PRIMARY KEY,
  pump_id uuid NOT NULL REFERENCES pumps(id) ON DELETE CASCADE,
  number integer NOT NULL DEFAULT 0,
  start_date date,
  days integer NOT NULL DEFAULT 0,
  end_date date,
  status text NOT NULL DEFAULT 'draft',
  locked boolean NOT NULL DEFAULT false,
  locked_at timestamptz,
  locked_by uuid,
  roster_locked boolean NOT NULL DEFAULT false,
  roster_locked_at timestamptz,
  roster_locked_by uuid,
  roster_unlock_reason text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  deleted_by uuid,
  deletion_reason text NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS dialas_pump_idx ON dialas(pump_id);

/* كشف الدوام الأساسي — صف لكل عضو في ديالة (مرتبط بالديالة لا بالمشروع) */
CREATE TABLE IF NOT EXISTS diala_roster (
  id text PRIMARY KEY,
  pump_id uuid NOT NULL REFERENCES pumps(id) ON DELETE CASCADE,
  diala_id text NOT NULL REFERENCES dialas(id) ON DELETE CASCADE,
  person_id text,
  person_name text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT 'shareholder',
  share_min numeric NOT NULL DEFAULT 0,
  order_index integer NOT NULL DEFAULT 0,
  notes text NOT NULL DEFAULT '',
  archived boolean NOT NULL DEFAULT false,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  deleted_by uuid,
  deletion_reason text NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS diala_roster_diala_idx ON diala_roster(diala_id);

/* أيام الديالة */
CREATE TABLE IF NOT EXISTS diala_days (
  id text PRIMARY KEY,
  pump_id uuid NOT NULL REFERENCES pumps(id) ON DELETE CASCADE,
  diala_id text,
  day_index integer NOT NULL DEFAULT 0,
  date date,
  status text NOT NULL DEFAULT 'scheduled',
  work_start text NOT NULL DEFAULT '',
  work_end text NOT NULL DEFAULT '',
  capacity_min numeric NOT NULL DEFAULT 0,
  planned_work_start text NOT NULL DEFAULT '',
  planned_work_end text NOT NULL DEFAULT '',
  planned_capacity_min numeric NOT NULL DEFAULT 0,
  notes text NOT NULL DEFAULT '',
  revision integer NOT NULL DEFAULT 0,
  reopen_reason text NOT NULL DEFAULT '',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  deleted_by uuid,
  deletion_reason text NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS diala_days_pump_idx ON diala_days(pump_id);
CREATE INDEX IF NOT EXISTS diala_days_diala_idx ON diala_days(diala_id);

/* الدوام الفعلي لكل يوم — مستقل تمامًا عن كشف الدوام الأساسي */
CREATE TABLE IF NOT EXISTS day_entries (
  id text PRIMARY KEY,
  pump_id uuid NOT NULL REFERENCES pumps(id) ON DELETE CASCADE,
  day_id text NOT NULL REFERENCES diala_days(id) ON DELETE CASCADE,
  order_index integer NOT NULL DEFAULT 0,
  person_id text,
  person_name text NOT NULL DEFAULT '',
  role text NOT NULL DEFAULT 'shareholder',
  shareholder_id text,
  right_id text,
  start_time text NOT NULL DEFAULT '',
  end_time text NOT NULL DEFAULT '',
  planned_min numeric NOT NULL DEFAULT 0,
  actual_person_id text,
  status text NOT NULL DEFAULT 'planned',
  postpone_to_day_id text,
  reason text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  entry_type text NOT NULL DEFAULT 'roster',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  deleted_by uuid,
  deletion_reason text NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS day_entries_day_idx ON day_entries(day_id);

/* الاستخدام الفعلي — يحمل snapshot للقيم المطبَّقة وقت العملية */
CREATE TABLE IF NOT EXISTS actual_usages (
  id text PRIMARY KEY,
  pump_id uuid NOT NULL REFERENCES pumps(id) ON DELETE CASCADE,
  day_id text,
  entry_id text,
  person_id text,
  shareholder_id text,
  date date,
  start_time text NOT NULL DEFAULT '',
  end_time text NOT NULL DEFAULT '',
  minutes numeric NOT NULL DEFAULT 0,
  usage_type text NOT NULL DEFAULT 'share',
  fuel_liters numeric NOT NULL DEFAULT 0,
  fuel_cost numeric NOT NULL DEFAULT 0,
  royalty_amount_due numeric NOT NULL DEFAULT 0,
  stoppage_min numeric NOT NULL DEFAULT 0,
  diesel_settlement text NOT NULL DEFAULT 'unpaid',
  diesel_shortage_liters numeric NOT NULL DEFAULT 0,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  deleted_by uuid,
  deletion_reason text NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS actual_usages_pump_idx ON actual_usages(pump_id);

/* التوقفات (عطل، مطر، وقود، طارئ …) */
CREATE TABLE IF NOT EXISTS pump_stops (
  id text PRIMARY KEY,
  pump_id uuid NOT NULL REFERENCES pumps(id) ON DELETE CASCADE,
  day_id text,
  diala_id text,
  person_id text,
  reason text NOT NULL DEFAULT '',
  minutes numeric NOT NULL DEFAULT 0,
  starts_at text NOT NULL DEFAULT '',
  ends_at text NOT NULL DEFAULT '',
  record_date date,
  notes text NOT NULL DEFAULT '',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  deleted_by uuid,
  deletion_reason text NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS pump_stops_pump_idx ON pump_stops(pump_id);

/* الوقود */
CREATE TABLE IF NOT EXISTS fuel_records (
  id text PRIMARY KEY,
  pump_id uuid NOT NULL REFERENCES pumps(id) ON DELETE CASCADE,
  day_id text,
  diala_id text,
  record_date date,
  fuel_type text NOT NULL DEFAULT 'diesel',
  liters numeric NOT NULL DEFAULT 0,
  price numeric NOT NULL DEFAULT 0,
  shortage numeric NOT NULL DEFAULT 0,
  notes text NOT NULL DEFAULT '',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  deleted_by uuid,
  deletion_reason text NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS fuel_records_pump_idx ON fuel_records(pump_id);

/* الرواسة والمشغّل — سجلات تاريخية بقيم snapshot */
CREATE TABLE IF NOT EXISTS operator_records (
  id text PRIMARY KEY,
  pump_id uuid NOT NULL REFERENCES pumps(id) ON DELETE CASCADE,
  day_id text,
  diala_id text,
  person_name text NOT NULL DEFAULT '',
  mode text NOT NULL DEFAULT '',
  amount numeric NOT NULL DEFAULT 0,
  hourly_wage_snapshot numeric NOT NULL DEFAULT 0,
  per_cycle_snapshot numeric NOT NULL DEFAULT 0,
  minutes numeric NOT NULL DEFAULT 0,
  pay_mode text NOT NULL DEFAULT '',
  record_date date,
  notes text NOT NULL DEFAULT '',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  deleted_by uuid,
  deletion_reason text NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS operator_records_pump_idx ON operator_records(pump_id);

/* السجلات المالية (دفعات، ديون، سلف، إعارة، تكاليف، تسويات) — بنفس منطق المشروع */
CREATE TABLE IF NOT EXISTS finance_records (
  id text PRIMARY KEY,
  pump_id uuid NOT NULL REFERENCES pumps(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'payment',
  day_id text,
  diala_id text,
  person_id text,
  person_name text NOT NULL DEFAULT '',
  amount numeric NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'YER',
  direction text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT '',
  pay_method text NOT NULL DEFAULT '',
  record_date date,
  note text NOT NULL DEFAULT '',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  deleted_by uuid,
  deletion_reason text NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS finance_records_pump_idx ON finance_records(pump_id);

/* السجلات الشخصية للمستخدم — منفصلة تمامًا عن بيانات المضخة الرسمية */
CREATE TABLE IF NOT EXISTS personal_records (
  id text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pump_id uuid,
  record_date date,
  kind text NOT NULL DEFAULT 'turn',
  minutes numeric NOT NULL DEFAULT 0,
  liters numeric NOT NULL DEFAULT 0,
  cost numeric NOT NULL DEFAULT 0,
  notes text NOT NULL DEFAULT '',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  deleted_by uuid,
  deletion_reason text NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS personal_records_user_idx ON personal_records(user_id);

/* حالة المزامنة لكل مضخة: نسخة + تاريخ آخر رفع + علامة الترحيل من localStorage */
CREATE TABLE IF NOT EXISTS pump_sync (
  pump_id uuid PRIMARY KEY REFERENCES pumps(id) ON DELETE CASCADE,
  version bigint NOT NULL DEFAULT 0,
  last_push_at timestamptz,
  last_push_by uuid,
  migrated_at timestamptz,
  migration_source text NOT NULL DEFAULT '',
  extra jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

`;

let ready = null;

/** يهيّئ المخطّط — يعيد المحاولة إن كانت القاعدة نائمة */
export function initSchema(retries = 12) {
  if (ready) return ready;
  ready = (async () => {
    let lastErr = null;
    for (let attempt = 1; attempt <= retries; attempt += 1) {
      try {
        await q(SCHEMA);
        return true;
      } catch (err) {
        lastErr = err;
        console.error(`[db] فشل تهيئة المخطّط (محاولة ${attempt}):`, err.message);
        await sleep(Math.min(1000 * attempt, 5000));
      }
    }
    ready = null;
    throw lastErr;
  })();
  return ready;
}
