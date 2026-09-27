/**
 * طبقة الاتصال بين حالة المضخة المحلية وبيانات التشغيل الرسمية على الخادم (المرحلة الثانية).
 *
 * المبدأ: PostgreSQL هو المصدر الرسمي. هذه الطبقة:
 *  - ترفع حالة المسؤول إلى الخادم بعد كل تعديل (تزامن).
 *  - تنزّل البيانات الرسمية من الخادم لتعرضها (للمسؤول نفسه أو للمساهم على جهاز آخر).
 *  - تنفّذ ترحيل بيانات localStorage القديمة مرة واحدة، مع نسخة احتياطية محلية وعلامة ترحيل،
 *    ولا تحذف أي بيانات محلية.
 */
import { api } from "../auth/api";
import { emptyState } from "./migrate";
import type { AppState, Pump } from "./types";

export interface OperatingPayload {
  settings: Record<string, unknown> | null;
  people: unknown[];
  shareholders: unknown[];
  dialas: unknown[];
  roster: unknown[];
  days: unknown[];
  entries: unknown[];
  usages: unknown[];
  stops: unknown[];
  fuelRecords: unknown[];
  operatorRecords: unknown[];
  financeRecords: unknown[];
  personalRecords: unknown[];
  extra?: Record<string, unknown>;
}

export interface OperatingMeta {
  version: number;
  migratedAt: string | null;
  migrationSource: string;
  lastPushAt: string | null;
  serverTime: string;
}

export interface OperatingResponse extends OperatingPayload {
  role: "manager" | "member";
  pump: { id: string; pumpCode: string; name: string; location: string; status: string };
  /** الإشعارات التي قرأها هذا المستخدم بنفسه على الخادم (علم شخصي) */
  readNotificationIds?: string[];
  meta: OperatingMeta;
}

const str = (v: unknown, fallback = "") => (v === undefined || v === null ? fallback : String(v));
const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/* ------------------------------ الترحيل إلى الخادم ------------------------------ */

/** إعدادات المضخة: مصدر مركزي واحد على الخادم */
function settingsFromState(state: AppState) {
  const p = state.pump;
  if (!p) return null;
  return {
    wells: p.wells,
    farm: p.farm,
    engine: p.engine,
    energyType: p.energyType,
    workStart: p.workStart,
    workEnd: p.workEnd,
    fuelConsumptionPerHour: p.fuelConsumptionPerHour,
    fuelPerCycle: p.fuelPerCycle,
    fuelCalcMode: p.fuelCalcMode,
    fuelPrice: p.fuelPrice,
    royaltyEnabled: p.royaltyEnabled,
    royaltyMode: p.royaltyMode,
    royaltyPerCycle: p.royaltyPerCycle,
    royaltyPerHour: p.royaltyPerHour,
    operatorName: p.operatorName,
    operatorHourlyWage: p.operatorHourlyWage,
    operatorStart: p.operatorStart,
    operatorEnd: p.operatorEnd,
    shareUnit: p.shareUnit,
    currency: p.currency,
    notes: p.notes,
    archived: p.archived,
  };
}

/** نوع صف اليوم: من الكشف الأساسي أم إضافة لهذا اليوم فقط */
function entryKind(state: AppState, entry: AppState["entries"][number]): string {
  if (entry.status === "postponed") return "moved_back";
  const inRoster = state.roster.some((r) => !r.archived && r.personId === entry.personId);
  if (!inRoster) return "extra";
  return "roster";
}

export function payloadFromState(state: AppState): OperatingPayload {
  const nameOf = new Map(state.persons.map((p) => [p.id, p.name]));
  const daysByRound = new Map<string, string[]>();
  for (const day of state.days) {
    const roundId = day.roundId ?? "";
    if (!roundId) continue;
    const list = daysByRound.get(roundId) ?? [];
    list.push(day.date);
    daysByRound.set(roundId, list);
  }

  return {
    settings: settingsFromState(state),
    people: state.persons.map((p) => ({
      id: p.id,
      name: p.name,
      phone: p.phone,
      nationalId: p.nationalId,
      notes: p.notes,
      guest: p.guest,
      archived: p.archived,
    })),
    shareholders: state.shareholders.map((s) => ({
      id: s.id,
      personId: s.personId,
      shareNo: s.shareNo,
      units: s.units,
      baseHoursMin: s.baseHoursMin,
      baseOrder: s.baseOrder,
      startDate: s.startDate,
      endDate: s.endDate,
      status: s.status,
      useStatus: s.useStatus,
      counterpartPersonId: s.counterpartPersonId ?? "",
      counterpartPhone: s.counterpartPhone,
      useStatusAt: s.useStatusAt,
      useStatusNote: s.useStatusNote,
      notes: s.notes,
      archived: s.archived,
    })),
    dialas: state.rounds.map((r) => ({
      id: r.id,
      number: r.number,
      startDate: r.startDate,
      days: r.days,
      endDate: r.endDate,
      locked: r.locked,
      rosterLocked: Boolean(r.rosterLocked),
      rosterUnlockReason: (r as { rosterUnlockReason?: string }).rosterUnlockReason ?? "",
      notes: r.notes,
    })),
    roster: state.roster.map((r) => ({
      id: r.id,
      dialaId: r.roundId,
      personId: r.personId,
      personName: nameOf.get(r.personId) ?? "",
      role: r.role,
      shareMin: r.shareMin,
      order: r.order,
      notes: r.notes,
      archived: r.archived,
    })),
    days: state.days.map((d) => {
      const roundId = d.roundId ?? "";
      const dates = (daysByRound.get(roundId) ?? []).slice().sort();
      return {
        id: d.id,
        dialaId: roundId || "",
        dayIndex: Math.max(0, dates.indexOf(d.date)) + 1,
        date: d.date,
        status: d.status,
        workStart: d.workStart,
        workEnd: d.workEnd,
        capacityMin: d.capacityMin,
        plannedWorkStart: d.plannedWorkStart,
        plannedWorkEnd: d.plannedWorkEnd,
        plannedCapacityMin: d.plannedCapacityMin,
        notes: d.notes,
        revision: d.revision,
        reopenReason: d.reopenReason,
      };
    }),
    entries: state.entries.map((e) => ({
      id: e.id,
      dayId: e.dayId,
      orderIndex: e.orderIndex,
      personId: e.personId,
      personName: nameOf.get(e.personId) ?? "",
      role: e.role,
      shareholderId: e.shareholderId ?? "",
      rightId: e.rightId ?? "",
      startTime: e.startTime,
      endTime: e.endTime,
      plannedMin: e.plannedMin,
      actualPersonId: e.actualPersonId ?? "",
      /* رابط الاستخدام المسجّل لهذا الصف — بدونه يفقد الجهاز الجديد الربط */
      usageId: e.usageId ?? "",
      status: e.status,
      postponeToDayId: e.postponeToDayId ?? "",
      reason: e.reason,
      notes: e.notes,
      /* سبب نقص نصيب المشارك في هذا اليوم (يُحفظ على الصف نفسه) */
      shortfallReason: e.shortfallReason ?? "",
      shortfallNote: e.shortfallNote ?? "",
      entryType: entryKind(state, e),
    })),
    usages: state.usages.map((u) => ({
      id: u.id,
      dayId: u.dayId,
      entryId: u.entryId ?? "",
      personId: u.personId,
      shareholderId: u.shareholderId ?? "",
      date: u.date,
      startTime: u.startTime,
      endTime: u.endTime,
      minutes: u.minutes,
      usageType: u.usageType,
      fuelLiters: u.fuelLiters,
      fuelCost: u.fuelCost,
      royaltyAmountDue: u.royaltyAmountDue,
      stoppageMin: u.stoppageMin,
      /* كل قيم العملية وقت التسجيل (Snapshot) — تُقرأ كما هي على أي جهاز */
      rightHolderId: u.rightHolderId ?? "",
      crossesMidnight: u.crossesMidnight,
      fuelPerHourSnapshot: u.fuelPerHourSnapshot,
      fuelPriceSnapshot: u.fuelPriceSnapshot,
      personalFuelPriceSnapshot: u.personalFuelPriceSnapshot,
      fuelAmountDue: u.fuelAmountDue,
      royaltyHourlySnapshot: u.royaltyHourlySnapshot,
      dieselSettlement: u.dieselSettlement,
      dieselShortageLiters: u.dieselShortageLiters,
      /* تفصيل التسديد: الديزل المدفوع فعلًا والرواسة نقدًا/أجلًا/جزئية */
      dieselPaidAmount: u.dieselPaidAmount ?? 0,
      royaltyPayMode: u.royaltyPayMode,
      royaltyCashAmount: u.royaltyCashAmount ?? 0,
      royaltyDeferredAmount: u.royaltyDeferredAmount ?? 0,
      shortfallReason: u.shortfallReason ?? "",
      shortfallNote: u.shortfallNote ?? "",
      settlementNote: u.settlementNote,
      notes: u.notes,
      source: u.source,
      status: u.status,
      overCapacity: u.overCapacity,
      overCapacityReason: u.overCapacityReason,
      overCapacityMin: u.overCapacityMin,
    })),
    /* التوقفات (عطل/مطر/وقود/طارئ…) — بالكامل في payload، والأعمدة للاستعلام */
    stops: state.stoppages.map((x) => ({
      id: x.id,
      dayId: x.dayId ?? "",
      personId: "",
      reason: x.reason || x.kind,
      kind: x.kind,
      minutes: x.minutes,
      startsAt: x.startTime,
      endsAt: x.endTime,
      recordDate: x.date,
      notes: x.notes,
    })),
    /* الوقود: نفس حقول المشروع (ساعات تشغيل، لتر/ساعة، نقص، سعر) */
    fuelRecords: state.fuelRecords.map((x) => ({
      id: x.id,
      dayId: x.dayId ?? "",
      recordDate: x.date,
      fuelType: "diesel",
      liters: x.liters,
      hoursRun: x.hoursRun,
      litersPerHour: x.litersPerHour,
      price: x.fuelPrice,
      shortage: x.shortageLiters,
      notes: x.notes,
    })),
    /* الرواسة/المشغّل: أجر الساعة والأجر المستحق كما هو مسجَّل (بلا تغيير للحساب) */
    operatorRecords: state.operatorRecords.map((x) => ({
      id: x.id,
      dayId: x.dayId ?? "",
      personName: x.operatorName,
      personId: x.attendantPersonId ?? "",
      minutes: x.minutes,
      amount: x.dueAmount,
      hourlyWageSnapshot: x.hourlyWage,
      perCycleSnapshot: x.ratePerHourSnapshot,
      startTime: x.startTime,
      endTime: x.endTime,
      status: x.status,
      recordDate: x.date,
      notes: x.notes,
    })),
    /* المالية: الدفعات والديون والحركات كما هي — لا نظام مالي جديد */
    financeRecords: [
      ...state.payments.map((x) => ({
        id: x.id,
        kind: "payment",
        personId: x.personId,
        personName: nameOf.get(x.personId) ?? "",
        amount: x.amount,
        currency: state.pump?.currency ?? "YER",
        direction: "credit",
        status: x.status,
        payMethod: x.method,
        recordDate: x.date,
        note: x.reason || x.notes,
        extra: x,
      })),
      ...state.debts.map((x) => ({
        id: x.id,
        kind: "debt",
        personId: x.debtorId,
        personName: nameOf.get(x.debtorId) ?? "",
        amount: x.amount,
        paidAmount: x.paidAmount,
        remainingAmount: x.remainingAmount,
        currency: state.pump?.currency ?? "YER",
        direction: "debit",
        status: x.status,
        payMethod: "",
        recordDate: x.date,
        note: x.reason || x.notes,
        extra: x,
      })),
      ...state.transactions.map((x) => ({
        id: x.id,
        kind: "transaction",
        personId: x.personId ?? "",
        personName: nameOf.get(x.personId ?? "") ?? "",
        amount: x.amount,
        currency: state.pump?.currency ?? "YER",
        direction: x.direction,
        status: x.kind,
        payMethod: x.method ?? "",
        recordDate: x.date,
        note: x.notes ?? "",
        extra: x,
      })),
    ],
    /* السجل الشخصي لصاحب الحساب (يُربط بالخادم بحساب المستخدم نفسه) */
    personalRecords: state.personalRecords.map((x) => ({
      id: x.id,
      date: x.date,
      kind: "usage",
      minutes: x.minutes,
      liters: x.dieselLiters,
      cost: x.dieselAmount + x.royaltyAmount,
      paidAmount: x.paidAmount,
      debtAmount: x.debtAmount,
      notes: x.notes,
    })),
    /* كيانات لم تُنمذَج بعد — تُحفظ على الخادم كما هي فلا تُفقد أي بيانات */
    extra: {
      rights: state.rights,
      settlements: state.settlements,
      conflictAcks: state.conflictAcks,
      conflicts: state.conflicts,
      transferEvents: state.transferEvents,
      corrections: state.corrections,
      counters: state.counters,
      /**
       * إشعارات المسؤول — كانت محصورة في جهاز واحد؛ بوجودها هنا يصل التنبيه
       * إلى المساهم المرتبط بالمضخة على أي جهاز (قراءة فقط لديه).
       */
      notifications: state.notifications,
    },
  };
}

/* ------------------------------ التنزيل من الخادم ------------------------------ */

interface Row {
  id?: string;
  [key: string]: unknown;
}

const asRows = <T,>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

function settingsToPump(state: AppState, settings: Record<string, unknown>): AppState["pump"] {
  const cur = state.pump;
  if (!cur) return null;
  const p = settings ?? {};
  return {
    ...cur,
    wells: str(p.wells, cur.wells),
    farm: str(p.farm, cur.farm),
    engine: str(p.engine, cur.engine),
    energyType: str(p.energyType, cur.energyType) as NonNullable<AppState["pump"]>["energyType"],
    workStart: str(p.workStart, cur.workStart),
    workEnd: str(p.workEnd, cur.workEnd),
    fuelConsumptionPerHour: num(p.fuelConsumptionPerHour ?? cur.fuelConsumptionPerHour),
    fuelPerCycle: num(p.fuelPerCycle ?? cur.fuelPerCycle),
    fuelCalcMode: str(p.fuelCalcMode, cur.fuelCalcMode) as NonNullable<AppState["pump"]>["fuelCalcMode"],
    fuelPrice: num(p.fuelPrice ?? cur.fuelPrice),
    royaltyEnabled: Boolean(p.royaltyEnabled ?? cur.royaltyEnabled),
    royaltyMode: str(p.royaltyMode, cur.royaltyMode) as NonNullable<AppState["pump"]>["royaltyMode"],
    royaltyPerCycle: num(p.royaltyPerCycle ?? cur.royaltyPerCycle),
    royaltyPerHour: num(p.royaltyPerHour ?? cur.royaltyPerHour),
    operatorName: str(p.operatorName, cur.operatorName),
    operatorHourlyWage: num(p.operatorHourlyWage ?? cur.operatorHourlyWage),
    operatorStart: str(p.operatorStart, cur.operatorStart),
    operatorEnd: str(p.operatorEnd, cur.operatorEnd),
    shareUnit: str(p.shareUnit, cur.shareUnit),
    currency: str(p.currency, cur.currency) as NonNullable<AppState["pump"]>["currency"],
    notes: str(p.notes, cur.notes),
    archived: Boolean(p.archived ?? cur.archived),
  };
}

/**
 * يدمج بيانات الخادم الرسمية في الحالة المحلية.
 * القاعدة: ما يوجد على الخادم يحلّ محل المحلي (الخادم رسمي)، وما لا يوجد فيه يبقى محليًا.
 */
export function applyPayload(state: AppState, payload: OperatingResponse | OperatingPayload): AppState {
  const take = <T,>(serverRows: unknown, local: T[]): T[] => {
    const rows = asRows<T>(serverRows);
    return rows.length > 0 ? rows : local;
  };

  const pump = "settings" in payload && payload.settings
    ? settingsToPump(state, payload.settings as Record<string, unknown>)
    : state.pump;

  return {
    ...state,
    pump,
    persons: take(payload.people, state.persons),
    shareholders: take(payload.shareholders, state.shareholders),
    rounds: take(
      asRows<Row>(payload.dialas).map((d) => ({
        ...(d as unknown as AppState["rounds"][number]),
        rosterLocked: Boolean(d.rosterLocked),
      })),
      state.rounds
    ),
    roster: take(
      asRows<Row>(payload.roster).map((r) => ({
        ...(r as unknown as AppState["roster"][number]),
        roundId: str(r.dialaId ?? (r as { roundId?: string }).roundId),
      })),
      state.roster
    ),
    days: take(
      asRows<Row>(payload.days).map((d) => ({
        ...(d as unknown as AppState["days"][number]),
        roundId: str(d.dialaId ?? (d as { roundId?: string }).roundId) || null,
      })),
      state.days
    ),
    entries: take(payload.entries, state.entries),
    usages: take(payload.usages, state.usages),
    stoppages: take(payload.stops, state.stoppages),
    fuelRecords: take(payload.fuelRecords, state.fuelRecords),
    operatorRecords: take(payload.operatorRecords, state.operatorRecords),
    personalRecords: take(payload.personalRecords, state.personalRecords),
    /* المالية و«الكيانات المحفوظة كما هي» تُستعاد على جهاز لا سجل فيه، ولا تُستبدل سجلًا قائمًا */
    ...financeMerge(state, payload),
    auditLogs: state.auditLogs,
    settings: state.settings,
    counters: state.counters,
    ...extraMerge(state, payload),
  };
}

/**
 * الدفعات والديون والحركات المالية: تُستعاد من سجلات الخادم على جهاز لا سجل مالي فيه
 * (جهاز جديد)، ولا تُستبدل سجلًا محليًا قائمًا — فالجهاز الذي أنشأ البيانات يحتفظ بها كاملة.
 */
function financeMerge(
  state: AppState,
  payload: OperatingPayload
): Pick<AppState, "payments" | "debts" | "transactions"> {
  const keepLocal = {
    payments: state.payments,
    debts: state.debts,
    transactions: state.transactions,
  };
  if (state.payments.length > 0 || state.debts.length > 0 || state.transactions.length > 0) return keepLocal;
  const fromServer = financeFromPayload(payload);
  return {
    payments: fromServer.payments.length > 0 ? fromServer.payments : state.payments,
    debts: fromServer.debts.length > 0 ? fromServer.debts : state.debts,
    transactions: fromServer.transactions.length > 0 ? fromServer.transactions : state.transactions,
  };
}

/**
 * كيانات تُحفظ على الخادم كما هي (حقوق، تسويات، تصحيحات، تعارضات، تحويلات، عدّادات):
 * تُستعاد على جهاز خالٍ منها، ولا تلمس ما هو موجود على الجهاز.
 */
function extraMerge(state: AppState, payload: OperatingPayload): Partial<AppState> {
  const extra = (payload as { extra?: Record<string, unknown> }).extra;
  if (!extra || typeof extra !== "object") return {};
  const out: Partial<AppState> = {};
  const keys = [
    "rights",
    "settlements",
    "conflictAcks",
    "conflicts",
    "transferEvents",
    "corrections",
    /* الإشعارات تُستعاد على جهاز لا سجل فيه (مساهم على جهازه) ولا تُستبدل محليًا */
    "notifications",
  ] as const;
  for (const key of keys) {
    const local = state[key] as unknown;
    const remote = extra[key];
    if (Array.isArray(local) && local.length === 0 && Array.isArray(remote) && remote.length > 0) {
      (out as Record<string, unknown>)[key] = remote;
    }
  }
  const counters = extra.counters as AppState["counters"] | undefined;
  if (counters && typeof counters === "object") {
    if ((state.counters?.diala ?? 0) === 0 && (state.counters?.round ?? 0) === 0) {
      out.counters = { diala: Number(counters.diala) || 0, round: Number(counters.round) || 0 };
    }
  }
  return out;
}

/** يحوّل سجلات المضخة الرسمية (المالية) إلى الحالة المحلية عند الحاجة */
export function financeFromPayload(
  payload: OperatingPayload
): Pick<AppState, "payments" | "debts" | "transactions"> {
  const rows = asRows<Record<string, unknown>>(payload.financeRecords);
  const out = { payments: [] as AppState["payments"], debts: [] as AppState["debts"], transactions: [] as AppState["transactions"] };
  for (const r of rows) {
    const original = (r.extra ?? {}) as Record<string, unknown>;
    if (r.kind === "payment") out.payments.push({ ...(original as unknown as AppState["payments"][number]), ...(r as unknown as object) } as AppState["payments"][number]);
    else if (r.kind === "debt") out.debts.push({ ...(original as unknown as AppState["debts"][number]) } as AppState["debts"][number]);
    else out.transactions.push({ ...(original as unknown as AppState["transactions"][number]) } as AppState["transactions"][number]);
  }
  return out;
}

/* --------------------------------- نداءات الخادم -------------------------------- */

/** معرّف المضخة على الخادم من رقم تعريف المضخة (PMP-XXXXXX) */
export async function resolveServerPumpId(pumpCode: string): Promise<string | null> {
  try {
    const res = await api<{ managedPumps: { id: string; pumpCode: string }[] }>("/api/pumps");
    const match = (res.managedPumps ?? []).find((p) => p.pumpCode === pumpCode);
    return match?.id ?? null;
  } catch {
    return null;
  }
}

export async function pullOperating(pumpId: string): Promise<OperatingResponse | null> {
  try {
    return await api<OperatingResponse>(`/api/pumps/${pumpId}/operating`);
  } catch {
    return null;
  }
}

/** فحص خفيف: رقم النسخة ووقت آخر رفع — بلا تنزيل أي بيانات */
export async function fetchOperatingVersion(
  pumpId: string
): Promise<{ version: number; lastPushAt: string | null } | null> {
  try {
    const res = await api<{ version: number; lastPushAt: string | null }>(
      `/api/pumps/${pumpId}/operating/version`
    );
    return { version: Number(res.version) || 0, lastPushAt: res.lastPushAt ?? null };
  } catch {
    return null;
  }
}

/**
 * تمييز إشعارات المسؤول كمقروءة لهذا المستخدم على الخادم.
 * بلا `ids` تُعلَّم كل إشعارات المضخة مقروءة له — ولا يُعدَّل إشعار المسؤول نفسه.
 */
export async function markNotificationsRead(pumpId: string, ids?: string[]): Promise<string[] | null> {
  try {
    const res = await api<{ readNotificationIds: string[] }>(`/api/pumps/${pumpId}/notifications/read`, {
      method: "POST",
      body: ids && ids.length ? { ids } : {},
    });
    return res.readNotificationIds ?? [];
  } catch {
    return null;
  }
}

export async function pushOperating(
  pumpId: string,
  state: AppState,
  options: { version?: number; migration?: boolean } = {}
): Promise<OperatingResponse["meta"] | null> {
  const path = options.migration
    ? `/api/pumps/${pumpId}/migrate-local`
    : `/api/pumps/${pumpId}/operating`;
  const method = options.migration ? "POST" : "PUT";
  try {
    const res = await api<{ meta: OperatingMeta }>(path, {
      method,
      body: { version: options.version ?? 0, data: payloadFromState(state), source: "localStorage-v2" },
    });
    return res.meta;
  } catch {
    return null;
  }
}


/* ------------------- حالة قراءة رسمية من بيانات الخادم ------------------- */

/** يبني مضخة من الإعدادات الرسمية على الخادم (تُستخدم لعرض البيانات الرسمية فقط) */
function pumpFromOfficial(payload: OperatingPayload, pumpId: string, name: string, code: string): Pump {
  const s = (payload.settings ?? {}) as Record<string, unknown>;
  return {
    id: pumpId,
    pumpCode: code,
    name,
    wells: str(s.wells),
    farm: str(s.farm),
    engine: str(s.engine),
    energyType: (str(s.energyType, "diesel") as Pump["energyType"]),
    workStart: str(s.workStart, "06:00"),
    workEnd: str(s.workEnd, "18:00"),
    fuelConsumptionPerHour: num(s.fuelConsumptionPerHour),
    fuelPerCycle: num(s.fuelPerCycle),
    fuelCalcMode: (str(s.fuelCalcMode, "hour") as Pump["fuelCalcMode"]),
    fuelPrice: num(s.fuelPrice),
    royaltyEnabled: Boolean(s.royaltyEnabled),
    royaltyMode: (str(s.royaltyMode, "cycle") as Pump["royaltyMode"]),
    royaltyPerCycle: num(s.royaltyPerCycle),
    royaltyPerHour: num(s.royaltyPerHour),
    operatorName: str(s.operatorName),
    operatorHourlyWage: num(s.operatorHourlyWage),
    operatorStart: str(s.operatorStart),
    operatorEnd: str(s.operatorEnd),
    shareUnit: str(s.shareUnit),
    currency: (str(s.currency, "YER") as Pump["currency"]),
    notes: str(s.notes),
    archived: Boolean(s.archived),
    createdAt: str(s.createdAt, new Date().toISOString()),
  };
}

/**
 * حالة كاملة للقراءة من البيانات الرسمية — تُستخدم في تطبيق المستخدم (قراءة فقط)
 * وتُخزَّن كذاكرة مؤقتة على الجهاز، والمصدر الرسمي يبقى PostgreSQL.
 */
export function officialStateFromResponse(res: OperatingResponse): AppState {
  const base = emptyState();
  const withPump: AppState = {
    ...base,
    pump: pumpFromOfficial(res, res.pump.id, res.pump.name, res.pump.pumpCode),
  };
  return applyPayload(withPump, res);
}

/** مضخة مبنية من الرد الرسمي: الاسم ورقم التعريف من جدول المضخات، والإعدادات من الخادم */
export function pumpFromOfficialResponse(res: OperatingResponse): Pump {
  return pumpFromOfficial(res, res.pump.id, res.pump.name, res.pump.pumpCode);
}

/**
 * تثبيت هوية المضخة الرسمية على الحالة المحلية:
 *  - جهاز بلا سجل محلي (جهاز جديد): تُبنى المضخة من الخادم، فيفتح المسؤول تطبيقه
 *    على أي جهاز ويجد مضخته وبياناتها بدل شاشة «تسجيل المضخة».
 *  - جهاز له سجل محلي: يُثبَّت رقم التعريف الرسمي فقط، ولا يُغيَّر الاسم أو البيانات.
 */
export function applyServerPumpIdentity(state: AppState, res: OperatingResponse): AppState {
  const official = pumpFromOfficialResponse(res);
  if (!state.pump) return { ...state, pump: official };
  if (state.pump.pumpCode === official.pumpCode) return state;
  return { ...state, pump: { ...state.pump, pumpCode: official.pumpCode } };
}

/** هل تحمل الحالة بيانات تشغيل تستحق الرفع إلى الخادم؟ */
export function hasOperatingData(state: AppState): boolean {
  return Boolean(
    state.pump &&
      (state.rounds.length > 0 ||
        state.days.length > 0 ||
        state.entries.length > 0 ||
        state.roster.length > 0 ||
        state.persons.length > 0 ||
        state.shareholders.length > 0 ||
        state.usages.length > 0 ||
        state.stoppages.length > 0 ||
        state.fuelRecords.length > 0 ||
        state.operatorRecords.length > 0 ||
        state.personalRecords.length > 0 ||
        state.payments.length > 0 ||
        state.transactions.length > 0)
  );
}

/** هل وصلت بيانات تشغيل رسمية من الخادم؟ */
export function responseHasOperatingData(res: OperatingResponse): boolean {
  return Boolean(
    res.settings ||
      res.dialas.length > 0 ||
      res.roster.length > 0 ||
      res.days.length > 0 ||
      res.entries.length > 0 ||
      res.people.length > 0 ||
      res.shareholders.length > 0 ||
      res.usages.length > 0 ||
      res.stops.length > 0 ||
      res.fuelRecords.length > 0 ||
      res.operatorRecords.length > 0 ||
      res.financeRecords.length > 0
  );
}
