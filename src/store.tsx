import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  ActualUsage,
  AppNotification,
  AppState,
  AuditLog,
  ConflictAck,
  ConflictStatus,
  DayCorrection,
  Debt,
  DialaDay,
  DialaRound,
  BaseRosterMember,
  DayEntry,
  DieselSettlement,
  EntryRole,
  FuelRecord,
  MatchStatus,
  OperatorRecord,
  Payment,
  Person,
  PersonalRecord,
  Pump,
  RoyaltyPayMode,
  Settlement,
  ShareRight,
  Shareholder,
  Stoppage,
  SyncItem,
  Theme,
  Transaction,
  TransferEvent,
  UsageType,
} from "./domain/types";
import { durationMin, isoToShort, nowTime, timeToMinutes, todayISO, uid } from "./domain/util";
import {
  computeUsageDraft,
  conflictTypeLabel,
  dayEntries as entriesOfDay,
  debtStatusOf,
  detectConflicts,
  dieselSettlementLabel,
  findPerson,
  mergeConflicts,
  paymentMethodLabel,
  personBalance,
  personName,
  planEntriesFromBaseRoster,
  baseRosterRows,
  baseRosterCapacityMin,
  baseRosterFits,
  roundOfDay,
  royaltyModeLabel,
  settlementPostings,
  stoppageMinutesInRange,
  transferTypeLabel,
  pumpWindow,
  type DetectedConflict,
} from "./domain/rules";
import { emptyState, migrateV1, normalizeState, seedDemo } from "./domain/migrate";
import {
  applyPayload,
  pullOperating,
  pushOperating,
  resolveServerPumpId,
} from "./domain/serverSync";
import { getToken } from "./auth/api";
import { LEGACY_MANAGER_STORAGE_KEY as LEGACY_KEY, MANAGER_STORAGE_KEY as STORAGE_KEY } from "./domain/storage";

/* --------------------------------- الأفعال ------------------------------ */

export type Action =
  | { type: "SAVE_PUMP"; pump: Pump; isNew: boolean }
  | { type: "UPDATE_PUMP"; patch: Partial<Pump> }
  | { type: "SAVE_PERSON"; person: Person; isNew: boolean }
  | { type: "ARCHIVE_PERSON"; id: string; archived: boolean }
  | { type: "SAVE_SHAREHOLDER"; shareholder: Shareholder; isNew: boolean }
  | { type: "ARCHIVE_SHAREHOLDER"; id: string; archived: boolean }
  | { type: "ADD_RIGHT"; right: ShareRight; endPrevious: boolean }
  | { type: "END_RIGHT"; id: string; endedAt: string; reason: string; actor: string }
  | { type: "CANCEL_RIGHT"; id: string; reason: string }
  | {
      type: "CREATE_DAY";
      day: DialaDay;
      planFromSchedule: boolean;
      entries: DayEntry[];
    }
  | { type: "UPDATE_DAY"; id: string; patch: Partial<DialaDay> }
  | { type: "SET_DAY_STATUS"; id: string; status: DialaDay["status"]; actor: string }
  | { type: "CLOSE_DAY"; id: string; actor: string }
  | { type: "REOPEN_DAY"; id: string; actor: string; reason: string }
  | { type: "ARCHIVE_DAY"; id: string; archived: boolean; reason?: string; actor?: string; force?: boolean }
  | { type: "CREATE_ROUND"; round: DialaRound; dates: string[] }
  | { type: "LOCK_ROUND"; id: string; actor: string }
  | { type: "UNLOCK_ROUND"; id: string; reason: string; actor: string }
  | { type: "ARCHIVE_ROUND"; id: string; archived: boolean; reason?: string; actor?: string; force?: boolean }
  | { type: "SAVE_ENTRY"; entry: DayEntry; isNew: boolean; correctionReason?: string; actor?: string }
  | { type: "SAVE_ENTRIES"; dayId: string; entries: DayEntry[]; correctionReason?: string; actor?: string }
  | { type: "MOVE_ENTRY"; id: string; dir: -1 | 1 }
  | {
      type: "APPLY_BASE_ROSTER_TO_DAY";
      dayId: string;
      correctionReason?: string;
      actor?: string;
    }
  | {
      type: "SAVE_BASE_ROSTER_MEMBER";
      roundId: string;
      personId: string;
      shareMin: number;
      role?: EntryRole;
      notes?: string;
      actor?: string;
    }
  | {
      type: "BULK_ADD_BASE_ROSTER";
      roundId: string;
      items: { personId: string; shareMin: number; role?: EntryRole }[];
      actor?: string;
    }
  | { type: "SET_BASE_ROSTER_SHARE"; id: string; shareMin: number; actor?: string }
  | { type: "MOVE_BASE_ROSTER_MEMBER"; roundId: string; id: string; dir: -1 | 1; actor?: string }
  | { type: "REMOVE_BASE_ROSTER_MEMBER"; id: string; reason?: string; actor?: string }
  | {
      type: "SET_ROUND_ROSTER_LOCK";
      roundId: string;
      locked: boolean;
      reason?: string;
      actor?: string;
    }
  | { type: "REMOVE_ENTRY"; id: string; reason?: string; actor?: string }
  | {
      type: "RECORD_USAGE";
      dayId: string;
      entryId: string | null;
      personId: string;
      shareholderId: string | null;
      rightHolderId: string | null;
      usageType: UsageType;
      startTime: string;
      endTime: string;
      notes: string;
      dieselSettlement: DieselSettlement;
      dieselShortageLiters: number;
      royaltyPayMode: RoyaltyPayMode;
      settlementNote: string;
      overCapacityReason: string;
      /** السعر الذي سجّله المستخدم لهذه العملية (§9) */
      personalFuelPrice?: number;
      /** تأكيد التجاوز/التداخل بعد العرض — لا يُحذف أي سجل */
      confirmedOverlap?: boolean;
      correctionReason?: string;
      actor: string;
    }
  | {
      type: "SET_USAGE_SETTLEMENT";
      usageId: string;
      dieselSettlement: DieselSettlement;
      dieselShortageLiters: number;
      royaltyPayMode: RoyaltyPayMode;
      settlementNote: string;
      actor: string;
      reason: string;
    }
  | { type: "VOID_USAGE"; id: string; reason: string; actor: string }
  | { type: "SAVE_STOPPAGE"; stoppage: Stoppage; isNew: boolean; correctionReason?: string; actor?: string }
  | { type: "ARCHIVE_STOPPAGE"; id: string; archived: boolean; reason?: string; actor?: string }
  | { type: "SAVE_FUEL"; record: FuelRecord; isNew: boolean }
  | { type: "ARCHIVE_FUEL"; id: string; archived: boolean }
  | { type: "SAVE_OPERATOR"; record: OperatorRecord; isNew: boolean }
  | { type: "ARCHIVE_OPERATOR"; id: string; archived: boolean }
  | { type: "ADD_TRANSACTION"; tx: Transaction }
  | {
      type: "CORRECT_TRANSACTION";
      id: string;
      newAmount: number;
      reason: string;
      actor: string;
    }
  | { type: "VOID_TRANSACTION"; id: string; reason: string; actor: string }
  | {
      type: "ADD_DEBT";
      debt: Debt;
      txKind?: Transaction["kind"];
      actor: string;
    }
  | {
      type: "ADD_PAYMENT";
      payment: Payment;
      actor: string;
    }
  | { type: "VOID_PAYMENT"; id: string; reason: string; actor: string }
  | { type: "CANCEL_DEBT"; id: string; reason: string; actor: string }
  | { type: "ADD_TRANSFER_EVENT"; event: TransferEvent; tx: Transaction | null; actor: string }
  | { type: "CANCEL_TRANSFER_EVENT"; id: string; reason: string; actor: string }
  | { type: "SYNC_CONFLICTS"; detected: DetectedConflict[]; actor?: string }
  | {
      type: "RESOLVE_CONFLICT";
      id: string;
      status: ConflictStatus;
      resolution: string;
      notes: string;
      actor: string;
    }
  | { type: "SAVE_PERSONAL"; record: PersonalRecord; isNew: boolean }
  | { type: "ARCHIVE_PERSONAL"; id: string; archived: boolean }
  | {
      type: "SETTLE";
      settlement: Settlement;
      personalRecordId: string | null;
      officialUsageId: string | null;
      adjustmentTx: Transaction | null;
    }
  | { type: "ACK_CONFLICT"; ack: ConflictAck }
  | { type: "READ_NOTIFICATIONS"; ids: string[] | null }
  | { type: "CLEAR_NOTIFICATIONS" }
  | { type: "SET_THEME"; theme: Theme }
  | { type: "MARK_SYNCED" }
  | { type: "RESET" }
  | { type: "SEED_DEMO" }
  | { type: "IMPORT"; state: AppState };

interface LogInput {
  action: string;
  entity: string;
  entityId: string;
  summary: string;
  before?: unknown;
  after?: unknown;
  reason?: string;
  actor?: string;
  actorRole?: "manager" | "user" | "system";
  source?: AuditLog["source"];
  notify?: Omit<AppNotification, "id" | "at" | "read">[];
  op?: SyncItem["op"];
}

const short = (v: unknown): string => {
  if (v === undefined || v === null) return "";
  const s = typeof v === "string" ? v : JSON.stringify(v);
  return s.length > 400 ? `${s.slice(0, 400)}…` : s;
};

/** كل تعديل حساس يمر من هنا: سجل تدقيق + قائمة مزامنة + إشعار */
function commit(_prev: AppState, next: AppState, log: LogInput): AppState {
  const at = new Date().toISOString();
  const audit: AuditLog = {
    id: uid("lg"),
    at,
    actor: log.actor ?? "manager",
    actorRole: log.actorRole ?? "manager",
    action: log.action,
    entity: log.entity,
    entityType: log.entity,
    entityId: log.entityId,
    summary: log.summary,
    before: short(log.before),
    after: short(log.after),
    source: log.source ?? (log.actorRole === "user" ? "user_app" : "screen"),
    reason: log.reason ?? "",
    deviceId: next.settings.deviceId,
    synced: false,
  };
  const sync: SyncItem = {
    id: uid("sq"),
    at,
    entity: log.entity,
    entityId: log.entityId,
    op: log.op ?? "update",
    summary: log.summary,
    status: "pending",
    conflictNote: "",
  };
  const notifications: AppNotification[] = (log.notify ?? []).map((n) => ({
    ...n,
    id: uid("nt"),
    at,
    read: false,
  }));
  return {
    ...next,
    auditLogs: [audit, ...next.auditLogs].slice(0, 800),
    syncQueue: [sync, ...next.syncQueue].slice(0, 500),
    notifications: [...notifications, ...next.notifications].slice(0, 200),
  };
}

/**
 * التصحيح بعد إغلاق اليوم (§21): لا تُمنع التصحيحات، لكن كل تصحيح
 * يُسجَّل كسجل مستقل بقيمته القديمة والجديدة ومن قام به وسببه.
 */
function withCorrection(
  state: AppState,
  dayId: string,
  entity: string,
  entityId: string,
  field: string,
  oldValue: unknown,
  newValue: unknown,
  reason: string,
  actor: string
): DayCorrection[] {
  const day = state.days.find((d) => d.id === dayId);
  if (!day) return state.corrections;
  const closed = day.status === "closed" || day.status === "revised";
  if (!closed) return state.corrections;
  const correction: DayCorrection = {
    id: uid("cr"),
    pumpId: day.pumpId,
    dayId,
    date: day.date,
    entity,
    entityId,
    field,
    oldValue: short(oldValue),
    newValue: short(newValue),
    reason: reason || "تصحيح بعد إغلاق اليوم — بدون سبب مسجّل",
    byUser: actor || "manager",
    at: new Date().toISOString(),
  };
  return [correction, ...state.corrections].slice(0, 800);
}

/** هل اليوم مغلقًا؟ (يحتاج سببًا موثّقًا للتصحيح) */
function dayIsClosed(state: AppState, dayId: string | null): boolean {
  if (!dayId) return false;
  const day = state.days.find((d) => d.id === dayId);
  return day?.status === "closed" || day?.status === "revised";
}

/** رفض عملية غير مسموح بها (مثل حذف يوم داخل ديالة محفوظة) مع تسجيلها في سجل التدقيق */
function refuse(state: AppState, log: LogInput): AppState {
  return commit(state, state, log);
}

function normalizeOrders(entries: DayEntry[]): DayEntry[] {  return entries
    .slice()
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .map((e, i) => ({ ...e, orderIndex: i }));
}

function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    /* ------------------------------ المضخة ---------------------------- */
    case "SAVE_PUMP": {
      const next = { ...state, pump: action.pump };
      return commit(state, next, {
        action: action.isNew ? "create" : "update",
        entity: "pump",
        entityId: action.pump.id,
        summary: `${action.isNew ? "تسجيل" : "تعديل"} بيانات المضخة: ${action.pump.name}`,
        before: action.isNew ? "" : state.pump,
        after: action.pump,
        op: action.isNew ? "create" : "update",
      });
    }

    case "UPDATE_PUMP": {
      if (!state.pump) return state;
      const next = { ...state, pump: { ...state.pump, ...action.patch } };
      return commit(state, next, {
        action: "update",
        entity: "pump",
        entityId: state.pump.id,
        summary: `تعديل بيانات المضخة (${Object.keys(action.patch).join(", ")})`,
        before: state.pump,
        after: next.pump,
      });
    }

    /* ------------------------------ الأشخاص --------------------------- */
    case "SAVE_PERSON": {
      const exists = state.persons.some((p) => p.id === action.person.id);
      const before = state.persons.find((p) => p.id === action.person.id);
      const next = {
        ...state,
        persons: exists
          ? state.persons.map((p) => (p.id === action.person.id ? action.person : p))
          : [...state.persons, action.person],
      };
      return commit(state, next, {
        action: exists ? "update" : "create",
        entity: "person",
        entityId: action.person.id,
        summary: `${exists ? "تعديل" : "إضافة"} شخص: ${action.person.name}${action.person.phone ? ` — ${action.person.phone}` : ""}`,
        before,
        after: action.person,
        op: exists ? "update" : "create",
      });
    }

    case "ARCHIVE_PERSON": {
      const person = state.persons.find((p) => p.id === action.id);
      const at = new Date().toISOString();
      const next = {
        ...state,
        persons: state.persons.map((p) =>
          p.id === action.id
            ? {
                ...p,
                archived: action.archived,
                deletedAt: action.archived ? at : undefined,
                deletedBy: action.archived ? "manager" : undefined,
                deletionReason: action.archived ? "أرشفة (حذف ناعم)" : undefined,
              }
            : p
        ),
      };
      return commit(state, next, {
        action: action.archived ? "archive" : "restore",
        entity: "person",
        entityId: action.id,
        summary: `${action.archived ? "أرشفة (حذف ناعم — السجل محفوظ)" : "إعادة تفعيل"} شخص: ${person?.name ?? action.id}`,
        before: person,
        after: { ...person, archived: action.archived },
      });
    }

    /* --------------------------- المساهمون والأسهم -------------------- */
    case "SAVE_SHAREHOLDER": {
      const exists = state.shareholders.some((s) => s.id === action.shareholder.id);
      const before = state.shareholders.find((s) => s.id === action.shareholder.id);
      const name = findPerson(state, action.shareholder.personId)?.name ?? "";
      const next = {
        ...state,
        shareholders: exists
          ? state.shareholders.map((s) =>
              s.id === action.shareholder.id ? action.shareholder : s
            )
          : [...state.shareholders, action.shareholder],
      };
      return commit(state, next, {
        action: exists ? "update" : "create",
        entity: "shareholder",
        entityId: action.shareholder.id,
        summary: `${exists ? "تعديل" : "تسجيل"} المساهم الأساسي: ${name} — ${action.shareholder.units} ${state.pump?.shareUnit ?? "حصة"}`,
        before,
        after: action.shareholder,
        op: exists ? "update" : "create",
      });
    }

    case "ARCHIVE_SHAREHOLDER": {
      const sh = state.shareholders.find((s) => s.id === action.id);
      const at = new Date().toISOString();
      const next = {
        ...state,
        shareholders: state.shareholders.map((s) =>
          s.id === action.id
            ? {
                ...s,
                archived: action.archived,
                deletedAt: action.archived ? at : undefined,
                deletedBy: action.archived ? "manager" : undefined,
                deletionReason: action.archived ? "أرشفة سهم (حذف ناعم)" : undefined,
              }
            : s
        ),
      };
      return commit(state, next, {
        action: action.archived ? "archive" : "restore",
        entity: "shareholder",
        entityId: action.id,
        summary: `${action.archived ? "أرشفة" : "إعادة تفعيل"} سهم ${findPerson(state, sh?.personId ?? null)?.name ?? ""}`,
        before: sh,
        after: { ...sh, archived: action.archived },
      });
    }

    /* ---------------------------- الحقوق والتحويلات -------------------- */
    case "ADD_RIGHT": {
      let rights = state.rights;
      if (action.endPrevious) {
        rights = rights.map((r) =>
          r.shareholderId === action.right.shareholderId && r.status === "active"
            ? { ...r, status: "ended", endedAt: r.endedAt ?? action.right.startedAt }
            : r
        );
      }
      const next = { ...state, rights: [...rights, action.right] };
      const holder = findPerson(state, action.right.holderPersonId)?.name ?? "";
      const from = findPerson(state, action.right.fromPersonId)?.name ?? "المساهم الأساسي";
      const kindLabel =
        action.right.kind === "rent"
          ? "تأجير"
          : action.right.kind === "gift"
            ? "إعطاء"
            : action.right.kind === "loan"
              ? "إعارة"
              : action.right.kind === "move_pump"
                ? "نقل لمضخة أخرى"
                : action.right.kind === "inherit"
                  ? "توريث"
                  : action.right.kind === "return"
                    ? "إعادة الحق"
                    : "نقل الحق";
      return commit(state, next, {
        action: "transfer",
        entity: "right",
        entityId: action.right.id,
        summary: `${kindLabel}: من ${from} إلى ${holder} من ${action.right.startedAt}${action.right.endedAt ? ` حتى ${action.right.endedAt}` : ""}`,
        after: action.right,
        op: "create",
        notify: [
          {
            kind: "turn_changed",
            level: "info",
            title: `تغيير صاحب الحق — ${kindLabel}`,
            body: `${holder} أصبح صاحب الحق في السهم (${kindLabel} من ${from}).`,
            personId: action.right.holderPersonId,
            dayId: null,
          },
        ],
      });
    }

    case "END_RIGHT": {
      const right = state.rights.find((r) => r.id === action.id);
      if (!right) return state;
      const next = {
        ...state,
        rights: state.rights.map((r) =>
          r.id === action.id ? { ...r, status: "ended" as const, endedAt: action.endedAt } : r
        ),
      };
      return commit(state, next, {
        action: "update",
        entity: "right",
        entityId: action.id,
        summary: `انتهاء حق ${findPerson(state, right.holderPersonId)?.name ?? ""} بتاريخ ${action.endedAt}`,
        before: right,
        after: { ...right, status: "ended", endedAt: action.endedAt },
        reason: action.reason,
        actor: action.actor,
        notify: [
          {
            kind: "difference",
            level: "info",
            title: "انتهاء فترة حق",
            body: `انتهى حق ${findPerson(state, right.holderPersonId)?.name ?? ""} وعاد الحق للمساهم الأساسي ${findPerson(state, right.fromPersonId)?.name ?? ""}.`,
            personId: right.holderPersonId,
            dayId: null,
          },
        ],
      });
    }

    case "CANCEL_RIGHT": {
      const right = state.rights.find((r) => r.id === action.id);
      if (!right) return state;
      const at = new Date().toISOString();
      const next = {
        ...state,
        rights: state.rights.map((r) =>
          r.id === action.id
            ? {
                ...r,
                status: "cancelled" as const,
                deletedAt: at,
                deletedBy: "manager",
                deletionReason: action.reason,
              }
            : r
        ),
      };
      return commit(state, next, {
        action: "cancel",
        entity: "right",
        entityId: action.id,
        summary: `إلغاء عملية حق (${findPerson(state, right.holderPersonId)?.name ?? ""})`,
        before: right,
        after: { ...right, status: "cancelled" },
        reason: action.reason,
      });
    }

    /* ------------------------------ الأيام ----------------------------- */
    case "CREATE_DAY": {
      const exists = state.days.find((d) => d.date === action.day.date && !d.archived);
      if (exists) return state;
      if (action.planFromSchedule && !state.pump) return state;
      /** الجدول الأساسي يُثبَّت مرة واحدة عند الإنشاء، ثم لا يتغيّر بتعديل اليوم الفعلي (§4) */
      const dayRecord: DialaDay = {
        ...action.day,
        plannedWorkStart: action.day.plannedWorkStart || action.day.workStart,
        plannedWorkEnd: action.day.plannedWorkEnd || action.day.workEnd,
        plannedCapacityMin:
          action.day.plannedCapacityMin ||
          action.day.capacityMin ||
          durationMin(action.day.workStart, action.day.workEnd),
      };
      /* يوم جديد: «الدوام الفعلي» يبدأ يدويًا من كشف الديالة، فلا صفوف تلقائية */
      const dayPlan = action.planFromSchedule && state.pump
        ? planEntriesFromBaseRoster(
            { ...state, days: [...state.days, dayRecord] },
            state.pump,
            dayRecord
          ).map((e) => ({ ...e, dayId: dayRecord.id }) as DayEntry)
        : null;
      const entries: DayEntry[] = dayPlan ?? action.entries.map((e) => ({ ...e, dayId: action.day.id }));
      const next = {
        ...state,
        days: [...state.days, dayRecord],
        entries: [...state.entries, ...entries],
        counters: { ...state.counters, diala: Math.max(state.counters.diala, action.day.dialaNumber + 1) },
      };
      return commit(state, next, {
        action: "create",
        entity: "day",
        entityId: action.day.id,
        summary: `إنشاء يوم فعلي بتاريخ ${action.day.date} (${entries.length} شخص)`,
        after: action.day,
        op: "create",
        notify: [
          {
            kind: "day_edited",
            level: "info",
            title: "يوم جديد",
            body: `أُنشئ يوم ${action.day.date} بـ ${entries.length} مشاركًا.`,
            personId: null,
            dayId: action.day.id,
          },
        ],
      });
    }

    case "UPDATE_DAY": {
      const before = state.days.find((d) => d.id === action.id);
      if (!before) return state;
      const next = {
        ...state,
        days: state.days.map((d) =>
          d.id === action.id ? { ...d, ...action.patch, updatedAt: new Date().toISOString() } : d
        ),
      };
      const beforeValues: Record<string, unknown> = {};
      for (const key of Object.keys(action.patch)) {
        beforeValues[key] = (before as unknown as Record<string, unknown>)[key];
      }
      const corrections = withCorrection(
        state,
        action.id,
        "day",
        action.id,
        Object.keys(action.patch).join(","),
        beforeValues,
        action.patch,
        "تعديل بيانات اليوم",
        "manager"
      );
      return commit(state, { ...next, corrections }, {
        action: "update",
        entity: "day",
        entityId: action.id,
        summary: `تعديل اليوم ${before.date}${dayIsClosed(state, action.id) ? " (بعد الإغلاق — سُجّل تصحيح)" : ""}`,
        before,
        after: { ...before, ...action.patch },
      });
    }

    case "SET_DAY_STATUS": {
      const before = state.days.find((d) => d.id === action.id);
      if (!before) return state;
      const next = {
        ...state,
        days: state.days.map((d) =>
          d.id === action.id
            ? { ...d, status: action.status, updatedAt: new Date().toISOString() }
            : d
        ),
      };
      return commit(state, next, {
        action: "update",
        entity: "day",
        entityId: action.id,
        summary: `تغيير حالة اليوم ${before.date}: ${before.status} ← ${action.status}`,
        before: { status: before.status },
        after: { status: action.status },
        actor: action.actor,
      });
    }

    case "CLOSE_DAY": {
      const before = state.days.find((d) => d.id === action.id);
      if (!before) return state;
      const next = {
        ...state,
        days: state.days.map((d) =>
          d.id === action.id
            ? {
                ...d,
                status: "closed" as const,
                closedBy: action.actor,
                closedAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              }
            : d
        ),
      };
      return commit(state, next, {
        action: "close",
        entity: "day",
        entityId: action.id,
        summary: `إغلاق اليوم ${before.date}`,
        before: { status: before.status },
        after: { status: "closed", closedBy: action.actor },
        actor: action.actor,
      });
    }

    case "REOPEN_DAY": {
      const before = state.days.find((d) => d.id === action.id);
      if (!before) return state;
      const next = {
        ...state,
        days: state.days.map((d) =>
          d.id === action.id
            ? {
                ...d,
                status: "revised" as const,
                reopenedBy: action.actor,
                reopenedAt: new Date().toISOString(),
                reopenReason: action.reason,
                revision: d.revision + 1,
                updatedAt: new Date().toISOString(),
              }
            : d
        ),
      };
      return commit(state, next, {
        action: "reopen",
        entity: "day",
        entityId: action.id,
        summary: `إعادة فتح اليوم ${before.date}`,
        before: { status: before.status },
        after: { status: "revised", reopenedBy: action.actor, revision: before.revision + 1 },
        reason: action.reason,
        actor: action.actor,
        notify: [
          {
            kind: "day_edited",
            level: "warn",
            title: `إعادة فتح يوم ${before.date}`,
            body: `أُعيد فتح اليوم بواسطة ${action.actor}. السبب: ${action.reason || "غير محدد"}`,
            personId: null,
            dayId: action.id,
          },
        ],
      });
    }

    case "ARCHIVE_DAY": {
      const before = state.days.find((d) => d.id === action.id);
      if (!before) return state;
      const round = roundOfDay(state, before);
      if (action.archived && round?.locked && !action.force) {
        // اليوم داخل ديالة محفوظة — لا يُحذف بسهولة
        return refuse(state, {
          action: "refuse",
          entity: "day",
          entityId: action.id,
          summary: `رُفض أرشفة اليوم ${before.date} — ديالته ${round.number} محفوظة`,
          reason: action.reason ?? "",
          actor: action.actor ?? "manager",
          notify: [
            {
              kind: "day_edited",
              level: "warn",
              title: "الديالة محفوظة",
              body: `لم يُؤرشف اليوم ${before.date} لأن ديالة ${round.number} محفوظة — يلزم فك الحفظ بسبب موثّق.`,
              personId: null,
              dayId: action.id,
            },
          ],
        });
      }
      const at = new Date().toISOString();
      const next = {
        ...state,
        days: state.days.map((d) =>
          d.id === action.id
            ? {
                ...d,
                archived: action.archived,
                updatedAt: at,
                deletedAt: action.archived ? at : undefined,
                deletedBy: action.archived ? action.actor ?? "manager" : undefined,
                deletionReason: action.archived ? action.reason ?? "أرشفة يوم (حذف ناعم)" : undefined,
              }
            : d
        ),
      };
      return commit(state, next, {
        action: action.archived ? "archive" : "restore",
        entity: "day",
        entityId: action.id,
        summary: `${action.archived ? "أرشفة (حذف ناعم — السجل محفوظ)" : "إعادة تفعيل"} اليوم ${before.date}`,
        before,
        after: { ...before, archived: action.archived },
        reason: action.reason ?? "",
        actor: action.actor,
      });
    }

    /* ------------------------- الديالات (الدورات) --------------------- */
    case "CREATE_ROUND": {
      if (!state.pump) return state;
      const pump = state.pump;
      const capacityMin = durationMin(pump.workStart, pump.workEnd);
      const busy = new Set(state.days.filter((d) => !d.archived).map((d) => d.date));
      const fresh = action.dates.filter((date) => !busy.has(date));
      let number = state.counters.diala;
      const newDays: DialaDay[] = [];
      for (const date of fresh) {
        const day: DialaDay = {
          id: uid("day"),
          pumpId: pump.id,
          dialaNumber: number,
          roundId: action.round.id,
          date,
          status: "scheduled",
          workStart: pump.workStart,
          workEnd: pump.workEnd,
          capacityMin,
          plannedWorkStart: pump.workStart,
          plannedWorkEnd: pump.workEnd,
          plannedCapacityMin: capacityMin,
          notes: "",
          openedBy: "manager",
          closedBy: "",
          closedAt: "",
          reopenedBy: "",
          reopenedAt: "",
          reopenReason: "",
          revision: 0,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          archived: false,
        };
        newDays.push(day);
        number += 1;
        /* لا يُملأ اليوم تلقائيًا: أساسيّوه يُضافون يدويًا لكل يوم على حدة */
      }
      const round: DialaRound = { ...action.round };
      /* وراثة كشف الدوام الأساسي: نفس الأشخاص ونفس الترتيب ونفس النصيب من آخر ديالة
         غير مؤرشفة — ثم يُثبَّت ويُعدَّل عند الحاجة، فلا يُعاد إدخال 50 اسمًا كل دورة */
      const previous = state.rounds
        .filter((r) => !r.archived && r.id !== round.id)
        .sort((a, b) => b.number - a.number)[0];
      const inherited: BaseRosterMember[] = previous
        ? baseRosterRows(state, previous.id).map((row, i) => ({
            id: uid("rst"),
            pumpId: round.pumpId,
            roundId: round.id,
            personId: row.personId,
            shareMin: row.shareMin,
            order: i,
            role: row.role,
            notes: `موروث من كشف ديالة ${previous.number}`,
            archived: false,
            createdAt: new Date().toISOString(),
            createdBy: "system",
          }))
        : [];
      const next = {
        ...state,
        rounds: [...state.rounds, round],
        days: [...state.days, ...newDays],
        roster: [...state.roster, ...inherited],
        counters: {
          diala: Math.max(number, state.counters.diala),
          round: Math.max(state.counters.round, round.number + 1),
        },
      };
      return commit(state, next, {
        action: "create",
        entity: "round",
        entityId: round.id,
        summary: `إنشاء ديالة ${round.number}: من ${round.startDate} إلى ${round.endDate} (${round.days} يوم، أُنشئ ${newDays.length} يوم${inherited.length > 0 ? `، ووُرِّث كشف الديالة السابقة (${inherited.length} شخص)` : ""})`,
        after: round,
        op: "create",
        notify: [
          {
            kind: "day_edited",
            level: "info",
            title: `ديالة ${round.number} جديدة`,
            body: `من ${isoToShort(round.startDate)} إلى ${isoToShort(round.endDate)} — ${round.days} يوم، وأُنشئ ${newDays.length} يوم للعمل.`,
            personId: null,
            dayId: null,
          },
        ],
      });
    }

    case "LOCK_ROUND": {
      const before = state.rounds.find((r) => r.id === action.id);
      if (!before) return state;
      const at = new Date().toISOString();
      const daysCount = state.days.filter((d) => d.roundId === action.id && !d.archived).length;
      const locked: DialaRound = { ...before, locked: true, lockedAt: at, lockedBy: action.actor };
      const next = {
        ...state,
        rounds: state.rounds.map((r) => (r.id === action.id ? locked : r)),
      };
      return commit(state, next, {
        action: "lock",
        entity: "round",
        entityId: action.id,
        summary: `حفظ ديالة ${before.number} (${daysCount} يوم مسجّل من ${before.days}) — أيامها محفوظة`,
        before,
        after: locked,
        actor: action.actor,
        notify: [
          {
            kind: "day_edited",
            level: "info",
            title: `حُفظت ديالة ${before.number}`,
            body: `حُفظت أيام الديالة (${daysCount} يوم) — لن تُحذف أو تُؤرشف إلا بفك الحفظ بسبب موثّق.`,
            personId: null,
            dayId: null,
          },
        ],
      });
    }

    case "UNLOCK_ROUND": {
      const before = state.rounds.find((r) => r.id === action.id);
      if (!before) return state;
      const unlocked: DialaRound = { ...before, locked: false, lockedAt: "", lockedBy: "" };
      const next = {
        ...state,
        rounds: state.rounds.map((r) => (r.id === action.id ? unlocked : r)),
      };
      return commit(state, next, {
        action: "unlock",
        entity: "round",
        entityId: action.id,
        summary: `فك حفظ ديالة ${before.number} — السبب: ${action.reason || "غير محدد"}`,
        before,
        after: unlocked,
        reason: action.reason,
        actor: action.actor,
        notify: [
          {
            kind: "day_edited",
            level: "warn",
            title: `فُك حفظ ديالة ${before.number}`,
            body: `أصبحت أيام الديالة قابلة للتعديل والأرشفة. السبب: ${action.reason || "غير محدد"}`,
            personId: null,
            dayId: null,
          },
        ],
      });
    }

    case "ARCHIVE_ROUND": {
      const before = state.rounds.find((r) => r.id === action.id);
      if (!before) return state;
      if (action.archived && before.locked && !action.force) {
        // الديالة محفوظة — لا تُؤرشف بسهولة
        return refuse(state, {
          action: "refuse",
          entity: "round",
          entityId: action.id,
          summary: `رُفض أرشفة ديالة ${before.number} — الديالة محفوظة`,
          reason: action.reason ?? "",
          actor: action.actor ?? "manager",
          notify: [
            {
              kind: "day_edited",
              level: "warn",
              title: "الديالة محفوظة",
              body: `لم تُؤرشف ديالة ${before.number} لأنها محفوظة — يجب فك الحفظ بسبب موثّق أولًا.`,
              personId: null,
              dayId: null,
            },
          ],
        });
      }
      const at = new Date().toISOString();
      const next = {
        ...state,
        rounds: state.rounds.map((r) => (r.id === action.id ? { ...r, archived: action.archived } : r)),
        days: state.days.map((d) =>
          d.roundId === action.id ? { ...d, archived: action.archived, updatedAt: at } : d
        ),
      };
      return commit(state, next, {
        action: action.archived ? "archive" : "restore",
        entity: "round",
        entityId: action.id,
        summary: `${action.archived ? "أرشفة" : "إعادة تفعيل"} ديالة ${before.number} (${before.days} يوم)${
          action.reason ? ` — السبب: ${action.reason}` : ""
        }`,
        before,
        after: { ...before, archived: action.archived },
        reason: action.reason ?? "",
        actor: action.actor,
      });
    }

    /* ------------------------- صفوف اليوم الفعلي ---------------------- */
    case "SAVE_ENTRY": {
      const exists = state.entries.some((e) => e.id === action.entry.id);
      const before = state.entries.find((e) => e.id === action.entry.id);
      let entries: DayEntry[];
      if (exists) {
        entries = state.entries.map((e) => (e.id === action.entry.id ? action.entry : e));
      } else {
        const dayList = state.entries.filter(
          (e) => e.dayId === action.entry.dayId && !e.archived
        );
        entries = [
          ...state.entries,
          { ...action.entry, orderIndex: dayList.length },
        ];
      }
      const next = { ...state, entries: normalizeOrders(entries) };
      const corrections = withCorrection(
        state,
        action.entry.dayId,
        "entry",
        action.entry.id,
        "times",
        before ? `${before.startTime} → ${before.endTime}` : "",
        `${action.entry.startTime} → ${action.entry.endTime}`,
        action.correctionReason ?? "",
        action.actor ?? "manager"
      );
      return commit(state, { ...next, corrections }, {
        action: exists ? "update" : "create",
        entity: "entry",
        entityId: action.entry.id,
        summary: `${exists ? "تعديل" : "إضافة"} ${findPerson(state, action.entry.personId)?.name ?? ""} في اليوم (${action.entry.startTime} → ${action.entry.endTime})`,
        before,
        after: action.entry,
        reason: action.correctionReason,
        actor: action.actor,
        op: exists ? "update" : "create",
      });
    }

    case "SAVE_ENTRIES": {
      const others = state.entries.filter((e) => e.dayId !== action.dayId);
      const next = { ...state, entries: [...others, ...normalizeOrders(action.entries)] };
      const corrections = withCorrection(
        state,
        action.dayId,
        "day",
        action.dayId,
        "entries",
        entriesOfDay(state, action.dayId).map((e) => ({ p: e.personId, t: `${e.startTime}-${e.endTime}` })),
        action.entries.map((e) => ({ p: e.personId, t: `${e.startTime}-${e.endTime}` })),
        action.correctionReason ?? "",
        action.actor ?? "manager"
      );
      return commit(state, { ...next, corrections }, {
        action: "update",
        entity: "day",
        entityId: action.dayId,
        summary: `إعادة ترتيب اليوم (${action.entries.length} صف)`,
        after: action.entries.map((e) => ({ p: e.personId, o: e.orderIndex })),
        reason: action.correctionReason,
        actor: action.actor,
      });
    }

    case "MOVE_ENTRY": {
      const list = entriesOfDay(state, state.entries.find((e) => e.id === action.id)?.dayId ?? "");
      const index = list.findIndex((e) => e.id === action.id);
      const target = index + action.dir;
      if (index < 0 || target < 0 || target >= list.length) return state;
      const swapped = list.slice();
      const tmp = swapped[index];
      swapped[index] = swapped[target];
      swapped[target] = tmp;
      const reordered = normalizeOrders(swapped);
      const map = new Map(reordered.map((e) => [e.id, e]));
      const next = {
        ...state,
        entries: state.entries.map((e) => map.get(e.id) ?? e),
      };
      return commit(state, next, {
        action: "update",
        entity: "entry",
        entityId: action.id,
        summary: `${action.dir === -1 ? "تقديم" : "تأخير"} ${findPerson(state, swapped[target].personId)?.name ?? ""} في ترتيب اليوم`,
        before: { orderIndex: index },
        after: { orderIndex: target },
      });
    }

    /* -------- كشف الدوام الأساسي: كشف واحد لكل ديالة، حدّه ساعات التشغيل -------- */

    case "SAVE_BASE_ROSTER_MEMBER": {
      const round = state.rounds.find((r) => r.id === action.roundId);
      if (!round || !state.pump) return state;
      if (round.rosterLocked) return state;
      const rows = baseRosterRows(state, round.id);
      const existing = rows.find((r) => r.personId === action.personId);
      const shareMin = Math.max(0, Math.round(action.shareMin));
      const extra = existing ? shareMin - existing.shareMin : shareMin;
      /* منع تام: مجموع النصيب لا يتجاوز ساعات تشغيل الدوام الأساسي */
      if (!baseRosterFits(state, state.pump, round.id, extra, existing?.member.id)) return state;
      const at = new Date().toISOString();
      const actor = action.actor ?? "manager";
      const member: BaseRosterMember = existing
        ? {
            ...existing.member,
            shareMin,
            role: action.role ?? existing.member.role,
            notes: action.notes ?? existing.member.notes,
          }
        : {
            id: uid("rst"),
            pumpId: round.pumpId,
            roundId: round.id,
            personId: action.personId,
            shareMin,
            order: rows.length,
            role: action.role ?? "shareholder",
            notes: action.notes ?? "",
            archived: false,
            createdAt: at,
            createdBy: actor,
          };
      const next = {
        ...state,
        roster: existing
          ? state.roster.map((r) => (r.id === member.id ? member : r))
          : [...state.roster, member],
      };
      const who = personName(state, action.personId);
      return commit(state, next, {
        action: existing ? "update" : "create",
        entity: "roster",
        entityId: member.id,
        summary: existing
          ? `تعديل نصيب ${who} في كشف ديالة ${round.number} إلى ${shareMin} دقيقة`
          : `إضافة ${who} إلى كشف ديالة ${round.number} بنصيب ${shareMin} دقيقة`,
        before: existing?.member ?? "",
        after: member,
        op: existing ? "update" : "create",
        actor,
      });
    }

    case "BULK_ADD_BASE_ROSTER": {
      const round = state.rounds.find((r) => r.id === action.roundId);
      if (!round || !state.pump) return state;
      if (round.rosterLocked) return state;
      const rows = baseRosterRows(state, round.id);
      const have = new Set(rows.map((r) => r.personId));
      const cap = baseRosterCapacityMin(state.pump);
      let used = rows.reduce((sum, r) => sum + r.shareMin, 0);
      const at = new Date().toISOString();
      const actor = action.actor ?? "manager";
      const added: BaseRosterMember[] = [];
      for (const item of action.items) {
        if (have.has(item.personId)) continue;
        const share = Math.max(0, Math.round(item.shareMin));
        if (share <= 0) continue;
        if (used + share > cap) continue; /* من لن يتّسع له الوقت لا يُضاف */
        have.add(item.personId);
        used += share;
        added.push({
          id: uid("rst"),
          pumpId: round.pumpId,
          roundId: round.id,
          personId: item.personId,
          shareMin: share,
          order: rows.length + added.length,
          role: item.role ?? "shareholder",
          notes: "إضافة جماعية إلى كشف الديالة",
          archived: false,
          createdAt: at,
          createdBy: actor,
        });
      }
      if (added.length === 0) return state;
      return commit(state, { ...state, roster: [...state.roster, ...added] }, {
        action: "create",
        entity: "roster",
        entityId: round.id,
        summary: `إضافة ${added.length} شخصًا إلى كشف ديالة ${round.number} — المجموع الآن ${used} دقيقة من ${cap}`,
        after: added,
        op: "create",
        actor,
      });
    }

    case "SET_BASE_ROSTER_SHARE": {
      const member = state.roster.find((r) => r.id === action.id);
      if (!member || !state.pump) return state;
      const round = state.rounds.find((r) => r.id === member.roundId);
      if (!round || round.rosterLocked) return state;
      const shareMin = Math.max(0, Math.round(action.shareMin));
      const extra = shareMin - (member.shareMin || 0);
      if (!baseRosterFits(state, state.pump, member.roundId, extra, member.id)) return state;
      const next = {
        ...state,
        roster: state.roster.map((r) => (r.id === member.id ? { ...r, shareMin } : r)),
      };
      return commit(state, next, {
        action: "update",
        entity: "roster",
        entityId: member.id,
        summary: `تعديل نصيب ${personName(state, member.personId)} في كشف ديالة ${round.number} إلى ${shareMin} دقيقة`,
        before: { shareMin: member.shareMin },
        after: { shareMin },
        actor: action.actor,
      });
    }

    case "MOVE_BASE_ROSTER_MEMBER": {
      const rows = baseRosterRows(state, action.roundId);
      const index = rows.findIndex((r) => r.member.id === action.id);
      const target = index + action.dir;
      if (index < 0 || target < 0 || target >= rows.length) return state;
      const orderOf = new Map(rows.map((r, i) => [r.member.id, i]));
      orderOf.set(rows[index].member.id, target);
      orderOf.set(rows[target].member.id, index);
      const next = {
        ...state,
        roster: state.roster.map((r) => (orderOf.has(r.id) ? { ...r, order: orderOf.get(r.id)! } : r)),
      };
      return commit(state, next, {
        action: "update",
        entity: "roster",
        entityId: action.id,
        summary: `${action.dir === -1 ? "تقديم" : "تأخير"} ${rows[index].name} في كشف الديالة (الترتيب يُورَّث للديالة التالية)`,
        before: { order: index },
        after: { order: target },
        actor: action.actor,
      });
    }

    case "REMOVE_BASE_ROSTER_MEMBER": {
      const member = state.roster.find((r) => r.id === action.id);
      if (!member) return state;
      const round = state.rounds.find((r) => r.id === member.roundId);
      if (round?.rosterLocked) return state;
      const at = new Date().toISOString();
      /* حذف ناعم: يحرّر وقته في الكشف — ولا يمسّ أي صف دوام فعلي ولا استخدامًا */
      const next = {
        ...state,
        roster: state.roster.map((r) =>
          r.id === action.id
            ? {
                ...r,
                archived: true,
                deletedAt: at,
                deletedBy: action.actor ?? "manager",
                deletionReason: action.reason ?? "إزالة من كشف الدوام الأساسي (حذف ناعم)",
              }
            : r
        ),
      };
      return commit(state, next, {
        action: "delete",
        entity: "roster",
        entityId: action.id,
        summary: `إزالة ${personName(state, member.personId)} من كشف ${round ? `ديالة ${round.number}` : "الديالة"} (تحرير نصيبه ${member.shareMin} دقيقة)`,
        before: member,
        after: { ...member, archived: true },
        reason: action.reason,
        actor: action.actor,
      });
    }

    case "SET_ROUND_ROSTER_LOCK": {
      const round = state.rounds.find((r) => r.id === action.roundId);
      if (!round) return state;
      const at = new Date().toISOString();
      const count = baseRosterRows(state, round.id).length;
      const next = {
        ...state,
        rounds: state.rounds.map((r) =>
          r.id === round.id ? { ...r, rosterLocked: action.locked } : r
        ),
      };
      return commit(state, next, {
        action: action.locked ? "lock" : "unlock",
        entity: "roster",
        entityId: round.id,
        summary: `${action.locked ? "تثبيت" : "فك تثبيت"} كشف ديالة ${round.number} (${count} شخص)`,
        reason: action.reason,
        before: { rosterLocked: round.rosterLocked ?? false },
        after: { rosterLocked: action.locked, at },
        actor: action.actor,
      });
    }

    case "APPLY_BASE_ROSTER_TO_DAY": {
      if (!state.pump) return state;
      const day = state.days.find((d) => d.id === action.dayId);
      if (!day) return state;
      const planned = planEntriesFromBaseRoster(state, state.pump, day);
      const at = new Date().toISOString();
      const actor = action.actor ?? "manager";
      const current = state.entries.filter((e) => e.dayId === day.id && !e.archived);
      const byPerson = new Map<string, DayEntry>();
      for (const e of current) if (!byPerson.has(e.personId)) byPerson.set(e.personId, e);

      /** الصفوف التي لها استخدام مسجَّل لا تُؤرشف أبدًا — السجل محفوظ */
      const hasUsage = (entryId: string) =>
        state.usages.some((u) => u.entryId === entryId && u.status !== "void");

      const kept = new Set<string>();
      const rebuilt: DayEntry[] = planned.map((row, index) => {
        const existing = byPerson.get(row.personId);
        if (!existing) {
          return { ...row, dayId: day.id, orderIndex: index } as DayEntry;
        }
        kept.add(existing.id);
        return {
          ...existing,
          orderIndex: index,
          startTime: row.startTime,
          endTime: row.endTime,
          plannedMin: row.plannedMin,
          role: row.role,
          shareholderId: row.shareholderId,
          rightId: row.rightId,
        };
      });

      const outdated = current.filter((e) => !kept.has(e.id));
      const toArchive = outdated.filter((e) => !hasUsage(e.id)).map((e) => e.id);

      const next = {
        ...state,
        entries: [
          ...state.entries.map((e) =>
            toArchive.includes(e.id)
              ? {
                  ...e,
                  archived: true,
                  deletedAt: at,
                  deletedBy: actor,
                  deletionReason: action.correctionReason ?? "لم يعد في كشف الديالة",
                }
              : e
          ),
          ...rebuilt.filter((e) => !state.entries.some((x) => x.id === e.id)),
        ],
      };
      const corrections = withCorrection(
        state,
        day.id,
        "day",
        day.id,
        "roster",
        current.length,
        rebuilt.length,
        action.correctionReason ?? "بدء الدوام الفعلي من كشف الديالة",
        actor
      );
      return commit(state, { ...next, corrections }, {
        action: "update",
        entity: "day",
        entityId: day.id,
        summary: `بدء الدوام الفعلي ليوم ${isoToShort(day.date)} من كشف الديالة (${rebuilt.length} شخص)`,
        reason: action.correctionReason,
        actor,
      });
    }

    case "REMOVE_ENTRY": {
      const entry = state.entries.find((e) => e.id === action.id);
      if (!entry) return state;
      const at = new Date().toISOString();
      const next = {
        ...state,
        entries: normalizeOrders(
          state.entries.map((e) =>
            e.id === action.id
              ? {
                  ...e,
                  archived: true,
                  deletedAt: at,
                  deletedBy: action.actor ?? "manager",
                  deletionReason: action.reason ?? "إزالة من اليوم (حذف ناعم)",
                }
              : e
          )
        ),
      };
      const corrections = withCorrection(
        state,
        entry.dayId,
        "entry",
        entry.id,
        "archived",
        false,
        true,
        action.reason ?? "",
        action.actor ?? "manager"
      );
      return commit(state, { ...next, corrections }, {
        action: "delete",
        entity: "entry",
        entityId: action.id,
        summary: `إزالة ${findPerson(state, entry.personId)?.name ?? ""} من اليوم (حذف ناعم — التاريخ محفوظ)`,
        before: entry,
        reason: action.reason,
        actor: action.actor,
        op: "delete",
      });
    }

    /* --------------------------- الاستخدام الفعلي --------------------- */
    case "RECORD_USAGE": {
      if (!state.pump) return state;
      const day = state.days.find((d) => d.id === action.dayId);
      if (!day) return state;
      const window = pumpWindow(state.pump, day);
      const anchor = timeToMinutes(window.start);
      const stoppageMin = stoppageMinutesInRange(
        state,
        day.id,
        action.startTime,
        action.endTime,
        anchor,
        window.capacityMin
      );
      const draft = computeUsageDraft(state.pump, day, action.startTime, action.endTime, {
        personalFuelPrice: action.personalFuelPrice ?? 0,
        stoppageMin,
      });
      const dayList = state.usages.filter((u) => u.dayId === day.id && u.status === "active");
      const totalMin = dayList.reduce((s, u) => s + u.minutes, 0) + draft.minutes;
      const stoppageTotal = state.stoppages
        .filter((s) => s.dayId === day.id && !s.archived)
        .reduce((s, st) => s + st.minutes, 0);
      const effectiveCapacity = Math.max(0, window.capacityMin - stoppageTotal);
      const overCapacity = totalMin > effectiveCapacity + 1;
      const at = new Date().toISOString();
      const usage: ActualUsage = {
        id: uid("us"),
        pumpId: day.pumpId,
        dayId: day.id,
        entryId: action.entryId,
        personId: action.personId,
        rightHolderId: action.rightHolderId,
        shareholderId: action.shareholderId,
        date: day.date,
        startTime: action.startTime,
        endTime: action.endTime,
        minutes: draft.minutes,
        crossesMidnight: draft.crossesMidnight,
        usageType: action.usageType,
        fuelPerHourSnapshot: draft.fuelPerHourSnapshot,
        fuelLiters: draft.fuelLiters,
        fuelPriceSnapshot: draft.fuelPriceSnapshot,
        personalFuelPriceSnapshot: draft.personalFuelPriceSnapshot,
        fuelCost: draft.fuelCost,
        fuelAmountDue: draft.fuelAmountDue,
        royaltyHourlySnapshot: draft.royaltyHourlySnapshot,
        royaltyAmountDue: draft.royaltyAmountDue,
        stoppageMin: draft.stoppageMin,
        transferEventId: null,
        dieselSettlement: action.dieselSettlement,
        dieselShortageLiters: Math.max(0, action.dieselShortageLiters || 0),
        royaltyPayMode: action.royaltyPayMode,
        settlementNote: action.settlementNote,
        overCapacity,
        overCapacityReason: overCapacity ? action.overCapacityReason : "",
        overCapacityMin: overCapacity ? Math.round(totalMin - effectiveCapacity) : 0,
        notes: action.notes,
        source: "manager",
        status: "active",
        createdAt: at,
        createdBy: action.actor,
        updatedAt: at,
      };

      const newTx: Transaction[] = settlementPostings(usage).map((p) =>
        makeTx(day, usage, p.kind, p.direction, p.amount, p.reason, p.notes)
      );
      const person = findPerson(state, action.personId);

      const next = {
        ...state,
        usages: [...state.usages, usage],
        entries: action.entryId
          ? state.entries.map((e) =>
              e.id === action.entryId
                ? { ...e, usageId: usage.id, status: "done" as const }
                : e
            )
          : state.entries,
        transactions: [...state.transactions, ...newTx],
      };
      const corrections = withCorrection(
        state,
        day.id,
        "usage",
        usage.id,
        "create",
        "",
        `${action.startTime} → ${action.endTime} (${draft.minutes} دقيقة)`,
        action.correctionReason ?? "",
        action.actor
      );
      return commit(state, { ...next, corrections }, {
        action: "create",
        entity: "usage",
        entityId: usage.id,
        summary: `تسجيل استخدام فعلي: ${person?.name ?? ""} — ${action.startTime} → ${action.endTime} (${Math.round(draft.minutes)} دقيقة، ${draft.fuelLiters} لتر${draft.personalFuelPriceSnapshot > 0 ? ` بسعر المستخدم ${draft.personalFuelPriceSnapshot}` : ""}) · ديزل: ${dieselSettlementLabel(
          usage.dieselSettlement
        )} · رواسة: ${royaltyModeLabel(usage.royaltyPayMode)}`,
        after: usage,
        reason: action.correctionReason,
        actor: action.actor,
        op: "create",
        notify: [
          {
            kind: "debt",
            level: overCapacity ? "danger" : usage.dieselSettlement === "unpaid" ? "warn" : "info",
            title: overCapacity ? "تجاوز ساعات التشغيل" : "تسجيل استخدام",
            body: overCapacity
              ? `مجموع ساعات اليوم تجاوز ساعات تشغيل المضخة — السبب: ${action.overCapacityReason || "غير محدد"}`
              : `سُجّل استخدام ${person?.name ?? ""} بمقدار ${Math.round(draft.minutes)} دقيقة — ديزل: ${dieselSettlementLabel(
                  usage.dieselSettlement
                )}${usage.dieselSettlement === "shortage" ? ` (${usage.dieselShortageLiters} لتر)` : ""} · رواسة: ${royaltyModeLabel(
                  usage.royaltyPayMode
                )}.`,
            personId: action.personId,
            dayId: day.id,
          },
        ],
      });
    }

    case "SET_USAGE_SETTLEMENT": {
      const usage = state.usages.find((u) => u.id === action.usageId);
      if (!usage) return state;
      const day = state.days.find((d) => d.id === usage.dayId);
      if (!day) return state;
      const updated: ActualUsage = {
        ...usage,
        dieselSettlement: action.dieselSettlement,
        dieselShortageLiters: Math.max(0, action.dieselShortageLiters || 0),
        royaltyPayMode: action.royaltyPayMode,
        settlementNote: action.settlementNote,
        updatedAt: new Date().toISOString(),
      };
      // الحركات السابقة لهذه العملية تُلغى (لا تُحذف) ثم تُسجَّل الحركات الجديدة
      const at = new Date().toISOString();
      const voidedTx = state.transactions.map((t) =>
        t.usageId === usage.id && t.status === "posted"
          ? {
              ...t,
              status: "void" as const,
              notes: `${t.notes}${t.notes ? " | " : ""}أُلغيت لتعديل حالة التسديد (${at.slice(0, 16).replace("T", " ")}): ${
                action.reason || "بدون سبب مسجّل"
              }`,
            }
          : t
      );
      const newTx = settlementPostings(updated).map((p) =>
        makeTx(day, updated, p.kind, p.direction, p.amount, p.reason, p.notes)
      );
      const next = {
        ...state,
        usages: state.usages.map((u) => (u.id === updated.id ? updated : u)),
        transactions: [...voidedTx, ...newTx],
      };
      const corrections = withCorrection(
        state,
        usage.dayId,
        "usage",
        usage.id,
        "settlement",
        `${usage.dieselSettlement}/${usage.royaltyPayMode}`,
        `${updated.dieselSettlement}/${updated.royaltyPayMode}`,
        action.reason,
        action.actor
      );
      return commit(state, { ...next, corrections }, {
        action: "update",
        entity: "usage",
        entityId: updated.id,
        summary: `تعديل تسديد ${findPerson(state, updated.personId)?.name ?? ""} — ديزل: ${dieselSettlementLabel(
          updated.dieselSettlement
        )}${updated.dieselSettlement === "shortage" ? ` (${updated.dieselShortageLiters} لتر)` : ""} · رواسة: ${royaltyModeLabel(
          updated.royaltyPayMode
        )}`,
        before: usage,
        after: updated,
        reason: action.reason,
        actor: action.actor,
        notify: [
          {
            kind: updated.dieselSettlement === "unpaid" ? "debt" : "payment",
            level: updated.dieselSettlement === "unpaid" ? "warn" : "info",
            title: "تعديل حالة التسديد",
            body: `${findPerson(state, updated.personId)?.name ?? ""}: ديزل ${dieselSettlementLabel(
              updated.dieselSettlement
            )} · رواسة ${royaltyModeLabel(updated.royaltyPayMode)}${
              action.reason ? ` — ${action.reason}` : ""
            }`,
            personId: updated.personId,
            dayId: updated.dayId,
          },
        ],
      });
    }

    case "VOID_USAGE": {
      const usage = state.usages.find((u) => u.id === action.id);
      if (!usage) return state;
      const at = new Date().toISOString();
      const next = {
        ...state,
        usages: state.usages.map((u) =>
          u.id === action.id
            ? {
                ...u,
                status: "void" as const,
                updatedAt: at,
                deletedAt: at,
                deletedBy: action.actor,
                deletionReason: action.reason,
              }
            : u
        ),
        transactions: state.transactions.map((t) =>
          t.usageId === action.id && t.status === "posted"
            ? {
                ...t,
                status: "void" as const,
                deletedAt: at,
                deletedBy: action.actor,
                deletionReason: action.reason,
              }
            : t
        ),
        entries: state.entries.map((e) =>
          e.usageId === action.id
            ? { ...e, usageId: null, status: "planned" as const }
            : e
        ),
      };
      const corrections = withCorrection(
        state,
        usage.dayId,
        "usage",
        usage.id,
        "status",
        "active",
        "void",
        action.reason,
        action.actor
      );
      return commit(state, { ...next, corrections }, {
        action: "cancel",
        entity: "usage",
        entityId: action.id,
        summary: `إلغاء استخدام (${findPerson(state, usage.personId)?.name ?? ""}) بتاريخ ${usage.date} — السجل يبقى في التاريخ بحالته الملغاة`,
        before: usage,
        after: { ...usage, status: "void" },
        reason: action.reason,
        actor: action.actor,
        notify: [
          {
            kind: "day_edited",
            level: "warn",
            title: "إلغاء سجل استخدام",
            body: `أُلغي سجل استخدام ${findPerson(state, usage.personId)?.name ?? ""} بتاريخ ${usage.date}. السبب: ${action.reason || "غير محدد"}`,
            personId: usage.personId,
            dayId: usage.dayId,
          },
        ],
      });
    }

    /* --------------------- التوقفات والوقود والرواسة ------------------- */
    case "SAVE_STOPPAGE": {
      const exists = state.stoppages.some((s) => s.id === action.stoppage.id);
      const before = state.stoppages.find((s) => s.id === action.stoppage.id);
      const next = {
        ...state,
        stoppages: exists
          ? state.stoppages.map((s) => (s.id === action.stoppage.id ? action.stoppage : s))
          : [...state.stoppages, action.stoppage],
      };
      const corrections = action.stoppage.dayId
        ? withCorrection(
            state,
            action.stoppage.dayId,
            "stoppage",
            action.stoppage.id,
            exists ? "edit" : "create",
            before ? `${before.startTime} → ${before.endTime}` : "",
            `${action.stoppage.startTime} → ${action.stoppage.endTime}`,
            action.correctionReason ?? action.stoppage.reason,
            action.actor ?? action.stoppage.createdBy
          )
        : state.corrections;
      return commit(state, { ...next, corrections }, {
        action: exists ? "update" : "create",
        entity: "stoppage",
        entityId: action.stoppage.id,
        summary: `تسجيل توقف (${action.stoppage.reason}) — ${action.stoppage.minutes} دقيقة (يُخصم من ساعات التشغيل)`,
        after: action.stoppage,
        reason: action.correctionReason,
        actor: action.actor,
        op: exists ? "update" : "create",
        notify: [
          {
            kind: "stoppage",
            level: "warn",
            title: "توقف المضخة",
            body: `توقف ${action.stoppage.reason} لمدة ${Math.round(action.stoppage.minutes)} دقيقة بتاريخ ${action.stoppage.date}.`,
            personId: null,
            dayId: action.stoppage.dayId,
          },
        ],
      });
    }

    case "ARCHIVE_STOPPAGE": {
      const before = state.stoppages.find((s) => s.id === action.id);
      const at = new Date().toISOString();
      return commit(
        state,
        {
          ...state,
          stoppages: state.stoppages.map((s) =>
            s.id === action.id
              ? {
                  ...s,
                  archived: action.archived,
                  deletedAt: action.archived ? at : undefined,
                  deletedBy: action.archived ? action.actor ?? "manager" : undefined,
                  deletionReason: action.archived
                    ? action.reason ?? "أرشفة توقف (حذف ناعم)"
                    : undefined,
                }
              : s
          ),
        },
        {
          action: action.archived ? "archive" : "restore",
          entity: "stoppage",
          entityId: action.id,
          summary: `${action.archived ? "أرشفة (حذف ناعم — السجل محفوظ)" : "إعادة تفعيل"} توقف ${
            before ? `${before.startTime} → ${before.endTime}` : ""
          }`,
          before,
          reason: action.reason,
          actor: action.actor,
        }
      );
    }

    case "SAVE_FUEL": {
      const exists = state.fuelRecords.some((f) => f.id === action.record.id);
      const next = {
        ...state,
        fuelRecords: exists
          ? state.fuelRecords.map((f) => (f.id === action.record.id ? action.record : f))
          : [...state.fuelRecords, action.record],
      };
      return commit(state, next, {
        action: exists ? "update" : "create",
        entity: "fuel",
        entityId: action.record.id,
        summary: `تسجيل استهلاك ديزل: ${action.record.liters} لتر (${action.record.hoursRun} ساعة تشغيل)`,
        after: action.record,
        op: exists ? "update" : "create",
      });
    }

    case "ARCHIVE_FUEL": {
      const at = new Date().toISOString();
      return commit(
        state,
        {
          ...state,
          fuelRecords: state.fuelRecords.map((f) =>
            f.id === action.id
              ? {
                  ...f,
                  archived: action.archived,
                  deletedAt: action.archived ? at : undefined,
                  deletedBy: action.archived ? "manager" : undefined,
                  deletionReason: action.archived ? "أرشفة سجل ديزل (حذف ناعم)" : undefined,
                }
              : f
          ),
        },
        {
          action: action.archived ? "archive" : "restore",
          entity: "fuel",
          entityId: action.id,
          summary: `${action.archived ? "أرشفة (حذف ناعم)" : "إعادة تفعيل"} سجل ديزل — التاريخ محفوظ`,
        }
      );
    }

    case "SAVE_OPERATOR": {
      const exists = state.operatorRecords.some((o) => o.id === action.record.id);
      const paid = state.payments
        .filter(
          (p) =>
            p.linkedOperationType === "operator" &&
            p.linkedOperationId === action.record.id &&
            p.status !== "void"
        )
        .reduce((s, p) => s + p.amount, 0);
      const record: OperatorRecord = {
        ...action.record,
        ratePerHourSnapshot: action.record.ratePerHourSnapshot || action.record.hourlyWage || 0,
        attendantPersonId: action.record.attendantPersonId ?? null,
        paidAmount: paid,
        remainingAmount: Math.max(0, (action.record.dueAmount || 0) - paid),
        status:
          paid >= (action.record.dueAmount || 0) && (action.record.dueAmount || 0) > 0
            ? "settled"
            : paid > 0
              ? "partial"
              : action.record.status ?? "open",
        updatedAt: new Date().toISOString(),
      };
      const next = {
        ...state,
        operatorRecords: exists
          ? state.operatorRecords.map((o) => (o.id === record.id ? record : o))
          : [...state.operatorRecords, record],
      };
      return commit(state, next, {
        action: exists ? "update" : "create",
        entity: "operator",
        entityId: record.id,
        summary: `تسجيل رواسة ${record.operatorName}: أجر مستحق ${record.dueAmount} (لقطة الأجر ${record.ratePerHourSnapshot}/ساعة)`,
        after: record,
        op: exists ? "update" : "create",
      });
    }

    case "ARCHIVE_OPERATOR": {
      const at = new Date().toISOString();
      return commit(
        state,
        {
          ...state,
          operatorRecords: state.operatorRecords.map((o) =>
            o.id === action.id
              ? {
                  ...o,
                  archived: action.archived,
                  status: action.archived ? ("cancelled" as const) : ("open" as const),
                  deletedAt: action.archived ? at : undefined,
                  deletedBy: action.archived ? "manager" : undefined,
                  deletionReason: action.archived ? "أرشفة سجل رواسة (حذف ناعم)" : undefined,
                }
              : o
          ),
        },
        {
          action: action.archived ? "archive" : "restore",
          entity: "operator",
          entityId: action.id,
          summary: `${action.archived ? "أرشفة (حذف ناعم)" : "إعادة تفعيل"} سجل رواسة — التاريخ محفوظ`,
        }
      );
    }

    /* ------------------------------- المالية --------------------------- */
    case "ADD_TRANSACTION": {
      const next = { ...state, transactions: [...state.transactions, action.tx] };
      const person = findPerson(state, action.tx.personId);
      const isPayment = action.tx.direction === "credit";
      return commit(state, next, {
        action: "create",
        entity: "transaction",
        entityId: action.tx.id,
        summary: `${isPayment ? "تسجيل دفعة" : "تسجيل استحقاق/دين"} ${action.tx.amount} على ${person?.name ?? "—"} — ${action.tx.reason}`,
        after: action.tx,
        op: "create",
        notify: [
          {
            kind: isPayment ? "payment" : "debt",
            level: isPayment ? "info" : "warn",
            title: isPayment ? "تسجيل دفعة" : "تسجيل مبلغ مستحق",
            body: `${isPayment ? "دُفعت" : "استحق"} ${action.tx.amount} لـ ${person?.name ?? "—"} (${action.tx.reason})`,
            personId: action.tx.personId,
            dayId: action.tx.dayId,
          },
        ],
      });
    }

    case "CORRECT_TRANSACTION": {
      const original = state.transactions.find((t) => t.id === action.id);
      if (!original) return state;
      const delta = action.newAmount - original.amount;
      if (delta === 0) return state;
      const correction: Transaction = {
        id: uid("tx"),
        pumpId: original.pumpId,
        kind: "correction",
        direction:
          delta > 0 ? original.direction : original.direction === "debit" ? "credit" : "debit",
        personId: original.personId,
        shareholderId: original.shareholderId,
        dayId: original.dayId,
        usageId: original.usageId,
        operatorRecordId: original.operatorRecordId,
        fuelRecordId: original.fuelRecordId,
        amount: Math.abs(delta),
        date: original.date,
        reason: `تصحيح: الأصل ${original.amount} ← ${action.newAmount} (الفرق ${delta > 0 ? "+" : ""}${delta})`,
        status: "posted",
        correctsTxId: original.id,
        notes: action.reason,
        source: "manager",
        createdAt: new Date().toISOString(),
        createdBy: action.actor,
      };
      const next = { ...state, transactions: [...state.transactions, correction] };
      return commit(state, next, {
        action: "update",
        entity: "transaction",
        entityId: original.id,
        summary: `تصحيح دفعة من ${original.amount} إلى ${action.newAmount} (فرق ${delta > 0 ? "+" : ""}${delta})`,
        before: original,
        after: correction,
        reason: action.reason,
        actor: action.actor,
        notify: [
          {
            kind: "payment",
            level: "info",
            title: "تصحيح حركة مالية",
            body: `صُحّحت حركة بمقدار ${delta > 0 ? "+" : ""}${delta} — ${action.reason || "بدون سبب"}`,
            personId: original.personId,
            dayId: original.dayId,
          },
        ],
      });
    }

    case "VOID_TRANSACTION": {
      const original = state.transactions.find((t) => t.id === action.id);
      if (!original) return state;
      const at = new Date().toISOString();
      const next = {
        ...state,
        transactions: state.transactions.map((t) =>
          t.id === action.id
            ? {
                ...t,
                status: "void" as const,
                notes: `${t.notes}${t.notes ? " | " : ""}إلغاء: ${action.reason}`,
                deletedAt: at,
                deletedBy: action.actor,
                deletionReason: action.reason,
              }
            : t
        ),
      };
      return commit(state, next, {
        action: "cancel",
        entity: "transaction",
        entityId: action.id,
        summary: `إلغاء حركة مالية بمقدار ${original.amount}`,
        before: original,
        after: { ...original, status: "void" },
        reason: action.reason,
        actor: action.actor,
      });
    }

    /* ------------------------------ السجل الشخصي ---------------------- */
    case "SAVE_PERSONAL": {
      const exists = state.personalRecords.some((p) => p.id === action.record.id);
      const next = {
        ...state,
        personalRecords: exists
          ? state.personalRecords.map((p) => (p.id === action.record.id ? action.record : p))
          : [...state.personalRecords, action.record],
      };
      return commit(state, next, {
        action: exists ? "update" : "create",
        entity: "personal_record",
        entityId: action.record.id,
        summary: `سجل شخصي: ${findPerson(state, action.record.personId)?.name ?? ""} — ${action.record.date} (${Math.round(action.record.minutes)} دقيقة)`,
        after: action.record,
        actor: "user",
        actorRole: "user",
        op: exists ? "update" : "create",
      });
    }

    case "ARCHIVE_PERSONAL":
      return commit(
        state,
        {
          ...state,
          personalRecords: state.personalRecords.map((p) =>
            p.id === action.id
              ? {
                  ...p,
                  archived: action.archived,
                  deletedAt: action.archived ? new Date().toISOString() : undefined,
                  deletedBy: action.archived ? "user" : undefined,
                  deletionReason: action.archived ? "أرشفة سجل شخصي (حذف ناعم)" : undefined,
                }
              : p
          ),
        },
        {
          action: action.archived ? "archive" : "restore",
          entity: "personal_record",
          entityId: action.id,
          summary: action.archived
            ? "أرشفة سجل شخصي (حذف ناعم — التاريخ محفوظ)"
            : "إعادة تفعيل سجل شخصي",
          actor: "user",
          actorRole: "user",
        }
      );

    case "SETTLE": {
      const next = {
        ...state,
        settlements: [action.settlement, ...state.settlements],
        personalRecords: action.personalRecordId
          ? state.personalRecords.map((p) =>
              p.id === action.personalRecordId ? { ...p, matchStatus: "settled" as MatchStatus } : p
            )
          : state.personalRecords,
        transactions: action.adjustmentTx
          ? [...state.transactions, action.adjustmentTx]
          : state.transactions,
      };
      return commit(state, next, {
        action: "settle",
        entity: "settlement",
        entityId: action.settlement.id,
        summary: `تسوية اختلاف: رسمي ${action.settlement.officialMinutes} د / شخصي ${action.settlement.personalMinutes} د — القرار: ${action.settlement.decision}`,
        after: action.settlement,
        reason: action.settlement.notes,
        notify: [
          {
            kind: "settlement",
            level: "info",
            title: "تسوية اختلاف",
            body: `تمت تسوية اختلاف ${findPerson(state, action.settlement.personId)?.name ?? ""} بقرار: ${action.settlement.decision}`,
            personId: action.settlement.personId,
            dayId: action.settlement.dayId,
          },
        ],
      });
    }

    case "ACK_CONFLICT": {
      const next = { ...state, conflictAcks: [action.ack, ...state.conflictAcks] };
      return commit(state, next, {
        action: "ack",
        entity: "conflict",
        entityId: action.ack.id,
        summary: `تجاوز تعارض (${action.ack.kind}) — السبب: ${action.ack.reason}`,
        after: action.ack,
        reason: action.ack.reason,
      });
    }

    /* ------------------ الدفعات والديون (§12, §13) --------------------- */

    case "ADD_DEBT": {
      const person = findPerson(state, action.debt.debtorId);
      const debt: Debt = {
        ...action.debt,
        paidAmount: action.debt.paidAmount || 0,
        remainingAmount: Math.max(0, (action.debt.amount || 0) - (action.debt.paidAmount || 0)),
        updatedAt: new Date().toISOString(),
      };
      const tx: Transaction = {
        id: uid("tx"),
        pumpId: debt.pumpId,
        kind: action.txKind ?? "debt",
        direction: "debit",
        personId: debt.debtorId,
        shareholderId: null,
        dayId: null,
        usageId: debt.linkedOperationType === "usage" ? debt.linkedOperationId : null,
        operatorRecordId: null,
        fuelRecordId: null,
        debtId: debt.id,
        paymentId: null,
        transferEventId: null,
        amount: debt.amount,
        date: debt.date,
        reason: debt.reason || "دين مستقل",
        status: "posted",
        correctsTxId: null,
        notes: debt.notes,
        source: "manager",
        createdAt: new Date().toISOString(),
        createdBy: action.actor,
      };
      const next = {
        ...state,
        debts: [...state.debts, { ...debt, status: debtStatusOf(debt) }],
        transactions: [...state.transactions, tx],
      };
      return commit(state, next, {
        action: "create",
        entity: "debt",
        entityId: debt.id,
        summary: `تسجيل دين مستقل على ${person?.name ?? "—"} بمقدار ${debt.amount} — ${debt.reason}`,
        after: debt,
        actor: action.actor,
        op: "create",
        notify: [
          {
            kind: "debt",
            level: "warn",
            title: "دين جديد",
            body: `${person?.name ?? "—"}: دين بمقدار ${debt.amount} (${debt.reason}) — حالة الدين مستقلة عن الاستخدام.`,
            personId: debt.debtorId,
            dayId: null,
          },
        ],
      });
    }

    case "ADD_PAYMENT": {
      const payment = action.payment;
      const person = findPerson(state, payment.personId);
      const tx: Transaction = {
        id: uid("tx"),
        pumpId: payment.pumpId,
        kind: payment.type === "attendants" ? "operators" : "payment",
        direction: "credit",
        personId: payment.personId,
        shareholderId: null,
        dayId: null,
        usageId: payment.linkedOperationType === "usage" ? payment.linkedOperationId : null,
        operatorRecordId: payment.linkedOperationType === "operator" ? payment.linkedOperationId : null,
        fuelRecordId: null,
        debtId: payment.linkedOperationType === "debt" ? payment.linkedOperationId : null,
        paymentId: payment.id,
        transferEventId: null,
        amount: payment.amount,
        date: payment.date,
        reason: payment.reason || `دفعة (${paymentMethodLabel(payment.method)})`,
        status: "posted",
        correctsTxId: null,
        method: payment.method,
        notes: payment.notes,
        source: "manager",
        createdAt: new Date().toISOString(),
        createdBy: action.actor,
      };

      /* تحديث ملخص الدين المرتبط — الدفعة نفسها لا تُستبدل ولا تُحذف */
      let debts = state.debts;
      if (payment.linkedOperationType === "debt" && payment.linkedOperationId) {
        debts = debts.map((d) => {
          if (d.id !== payment.linkedOperationId) return d;
          const paid = (d.paidAmount || 0) + payment.amount;
          const updated: Debt = {
            ...d,
            paidAmount: paid,
            remainingAmount: Math.max(0, (d.amount || 0) - paid),
            updatedAt: new Date().toISOString(),
          };
          return { ...updated, status: debtStatusOf(updated) };
        });
      }

      /* تحديث ملخص سجل الرواسة إن كانت الدفعة له */
      let operatorRecords = state.operatorRecords;
      if (payment.linkedOperationType === "operator" && payment.linkedOperationId) {
        operatorRecords = operatorRecords.map((o) => {
          if (o.id !== payment.linkedOperationId) return o;
          const paid = (o.paidAmount || 0) + payment.amount;
          return {
            ...o,
            paidAmount: paid,
            remainingAmount: Math.max(0, (o.dueAmount || 0) - paid),
            status:
              paid >= (o.dueAmount || 0) && (o.dueAmount || 0) > 0
                ? ("settled" as const)
                : paid > 0
                  ? ("partial" as const)
                  : ("open" as const),
            updatedAt: new Date().toISOString(),
          };
        });
      }

      const next = {
        ...state,
        payments: [...state.payments, { ...payment, transactionId: tx.id, status: "posted" as const }],
        transactions: [...state.transactions, tx],
        debts,
        operatorRecords,
      };
      return commit(state, next, {
        action: "create",
        entity: "payment",
        entityId: payment.id,
        summary: `تسجيل دفعة ${payment.amount} من ${person?.name ?? "—"} (${paymentMethodLabel(
          payment.method
        )}) — ${payment.reason}`,
        after: payment,
        actor: action.actor,
        op: "create",
        notify: [
          {
            kind: "payment",
            level: "info",
            title: "دفعة مسجّلة",
            body: `${person?.name ?? "—"} دفع ${payment.amount} — ${payment.reason}. كل دفعة سجل مستقل ولا تُستبدل سابقتها.`,
            personId: payment.personId,
            dayId: null,
          },
        ],
      });
    }

    case "VOID_PAYMENT": {
      const payment = state.payments.find((p) => p.id === action.id);
      if (!payment) return state;
      const at = new Date().toISOString();
      /* إلغاء الدفعة لا يحذفها: تُعلَّم ملغاة وتُسجَّل حركة عكسية */
      const reversal: Transaction | null =
        payment.transactionId
          ? {
              id: uid("tx"),
              pumpId: payment.pumpId,
              kind: "correction",
              direction: "debit",
              personId: payment.personId,
              shareholderId: null,
              dayId: null,
              usageId: null,
              operatorRecordId: null,
              fuelRecordId: null,
              debtId: payment.linkedOperationType === "debt" ? payment.linkedOperationId : null,
              paymentId: payment.id,
              transferEventId: null,
              amount: payment.amount,
              date: todayISO(),
              reason: `إلغاء دفعة سابقة بمقدار ${payment.amount}`,
              status: "posted",
              correctsTxId: action.id,
              method: payment.method,
              notes: action.reason,
              source: "manager",
              createdAt: at,
              createdBy: action.actor,
            }
          : null;
      let debts = state.debts;
      if (payment.linkedOperationType === "debt" && payment.linkedOperationId) {
        debts = debts.map((d) => {
          if (d.id !== payment.linkedOperationId) return d;
          const paid = Math.max(0, (d.paidAmount || 0) - payment.amount);
          const updated: Debt = {
            ...d,
            paidAmount: paid,
            remainingAmount: Math.max(0, (d.amount || 0) - paid),
            updatedAt: at,
          };
          return {
            ...updated,
            status: updated.status === "cancelled" ? "cancelled" : debtStatusOf(updated),
          };
        });
      }
      const next = {
        ...state,
        payments: state.payments.map((p) =>
          p.id === action.id
            ? {
                ...p,
                status: "void" as const,
                deletedAt: at,
                deletedBy: action.actor,
                deletionReason: action.reason,
              }
            : p
        ),
        transactions: [
          ...state.transactions.map((t) =>
            t.paymentId === action.id && t.status === "posted"
              ? {
                  ...t,
                  status: "void" as const,
                  deletedAt: at,
                  deletedBy: action.actor,
                  deletionReason: action.reason,
                }
              : t
          ),
          ...(reversal ? [reversal] : []),
        ],
        debts,
      };
      return commit(state, next, {
        action: "cancel",
        entity: "payment",
        entityId: action.id,
        summary: `إلغاء دفعة بمقدار ${payment.amount} — ${action.reason} (الدفعة تبقى في التاريخ)`,
        before: payment,
        after: { ...payment, status: "void" },
        reason: action.reason,
        actor: action.actor,
      });
    }

    case "CANCEL_DEBT": {
      const debt = state.debts.find((d) => d.id === action.id);
      if (!debt) return state;
      const at = new Date().toISOString();
      const next = {
        ...state,
        debts: state.debts.map((d) =>
          d.id === action.id
            ? {
                ...d,
                status: "cancelled" as const,
                updatedAt: at,
                deletedAt: at,
                deletedBy: action.actor,
                deletionReason: action.reason,
              }
            : d
        ),
        transactions: state.transactions.map((t) =>
          t.debtId === action.id && t.status === "posted"
            ? {
                ...t,
                status: "void" as const,
                deletedAt: at,
                deletedBy: action.actor,
                deletionReason: action.reason,
              }
            : t
        ),
      };
      return commit(state, next, {
        action: "cancel",
        entity: "debt",
        entityId: action.id,
        summary: `إلغاء دين بمقدار ${debt.amount} على ${findPerson(state, debt.debtorId)?.name ?? "—"} — ${action.reason}`,
        before: debt,
        after: { ...debt, status: "cancelled" },
        reason: action.reason,
        actor: action.actor,
      });
    }

    /* --------------- السلف والإعارة والتحويل (§14) -------------------- */

    case "ADD_TRANSFER_EVENT": {
      const event = action.event;
      const from = findPerson(state, event.fromPersonId);
      const to = findPerson(state, event.toPersonId);
      const next = {
        ...state,
        transferEvents: [...state.transferEvents, event],
        transactions: action.tx ? [...state.transactions, action.tx] : state.transactions,
      };
      return commit(state, next, {
        action: "transfer",
        entity: "transfer_event",
        entityId: event.id,
        summary: `${transferTypeLabel(event.type)}: من ${from?.name ?? "—"} إلى ${
          to?.name ?? "—"
        } بمقدار ${event.minutes} دقيقة بتاريخ ${event.date} — ${event.reason}`,
        after: event,
        actor: action.actor,
        op: "create",
        notify: [
          {
            kind: "turn_changed",
            level: "info",
            title: `عملية ${transferTypeLabel(event.type)}`,
            body: `من ${from?.name ?? "—"} إلى ${to?.name ?? "—"} بمقدار ${event.minutes} دقيقة — سُجّلت كعملية مستقلة مع تاريخها.`,
            personId: event.toPersonId,
            dayId: null,
          },
        ],
      });
    }

    case "CANCEL_TRANSFER_EVENT": {
      const event = state.transferEvents.find((t) => t.id === action.id);
      if (!event) return state;
      const at = new Date().toISOString();
      const next = {
        ...state,
        transferEvents: state.transferEvents.map((t) =>
          t.id === action.id
            ? {
                ...t,
                status: "cancelled" as const,
                deletedAt: at,
                deletedBy: action.actor,
                deletionReason: action.reason,
              }
            : t
        ),
        transactions: state.transactions.map((t) =>
          t.transferEventId === action.id && t.status === "posted"
            ? {
                ...t,
                status: "void" as const,
                deletedAt: at,
                deletedBy: action.actor,
                deletionReason: action.reason,
              }
            : t
        ),
      };
      return commit(state, next, {
        action: "cancel",
        entity: "transfer_event",
        entityId: action.id,
        summary: `إلغاء عملية ${transferTypeLabel(event.type)} بمقدار ${event.minutes} دقيقة — ${action.reason}`,
        before: event,
        after: { ...event, status: "cancelled" },
        reason: action.reason,
        actor: action.actor,
      });
    }

    /* ------------------ التعارضات المحفوظة (§18) ---------------------- */

    case "SYNC_CONFLICTS": {
      if (action.detected.length === 0) {
        if (state.conflicts.length === 0) return state;
      }
      const merged = mergeConflicts(state.conflicts, action.detected, state.pump?.id ?? "");
      if (JSON.stringify(merged) === JSON.stringify(state.conflicts)) return state;
      return { ...state, conflicts: merged };
    }

    case "RESOLVE_CONFLICT": {
      const conflict = state.conflicts.find((c) => c.id === action.id);
      if (!conflict) return state;
      const at = new Date().toISOString();
      const next = {
        ...state,
        conflicts: state.conflicts.map((c) =>
          c.id === action.id
            ? {
                ...c,
                status: action.status,
                resolution: action.resolution,
                notes: action.notes,
                resolvedAt: action.status === "resolved" || action.status === "ignored" ? at : "",
                resolvedBy: action.actor,
              }
            : c
        ),
      };
      return commit(state, next, {
        action: "resolve",
        entity: "conflict",
        entityId: action.id,
        summary: `تسوية تعارض (${conflictTypeLabel(conflict.type)}) — الحالة: ${action.status} — القرار: ${action.resolution}`,
        before: conflict,
        after: { ...conflict, status: action.status, resolution: action.resolution },
        reason: action.notes,
        actor: action.actor,
      });
    }

    /* --------------------------- الإشعارات والمزامنة ------------------- */
    case "READ_NOTIFICATIONS": {
      const next = {
        ...state,
        notifications: state.notifications.map((n) =>
          !action.ids || action.ids.includes(n.id) ? { ...n, read: true } : n
        ),
      };
      return { ...next };
    }

    case "CLEAR_NOTIFICATIONS":
      return { ...state, notifications: [] };

    case "SET_THEME":
      return { ...state, settings: { ...state.settings, theme: action.theme } };

    case "MARK_SYNCED": {
      const at = new Date().toISOString();
      return {
        ...state,
        settings: { ...state.settings, lastSyncAt: at },
        syncQueue: state.syncQueue.map((s) => ({ ...s, status: "synced" as const })),
        auditLogs: state.auditLogs.map((l) => ({ ...l, synced: true })),
      };
    }

    case "RESET":
      return emptyState();

    case "SEED_DEMO":
      return seedDemo();

    case "IMPORT":
      return action.state;

    default:
      return state;
  }
}

function makeTx(
  day: DialaDay,
  usage: ActualUsage,
  kind: Transaction["kind"],
  direction: Transaction["direction"],
  amount: number,
  reason: string,
  notes = ""
): Transaction {
  return {
    id: uid("tx"),
    pumpId: day.pumpId,
    kind,
    direction,
    personId: usage.personId,
    shareholderId: usage.shareholderId,
    dayId: day.id,
    usageId: usage.id,
    operatorRecordId: null,
    fuelRecordId: null,
    amount,
    date: day.date,
    reason,
    status: "posted",
    correctsTxId: null,
    notes:
      notes ||
      (kind === "fuel"
        ? `محسوبة من ${usage.fuelLiters} لتر × ${usage.fuelPriceSnapshot} (استهلاك وقت العملية ${usage.fuelPerHourSnapshot} لتر/ساعة)`
        : ""),
    source: "manager",
    createdAt: new Date().toISOString(),
    createdBy: "manager",
  };
}

/* ------------------------------- السياق -------------------------------- */

export interface AppActions {
  savePump: (pump: Pump, isNew: boolean) => void;
  updatePump: (patch: Partial<Pump>) => void;
  savePerson: (person: Person, isNew: boolean) => void;
  archivePerson: (id: string, archived: boolean) => void;
  saveShareholder: (sh: Shareholder, isNew: boolean) => void;
  archiveShareholder: (id: string, archived: boolean) => void;
  addRight: (right: ShareRight, endPrevious: boolean) => void;
  endRight: (id: string, endedAt: string, reason: string, actor: string) => void;
  cancelRight: (id: string, reason: string) => void;
  createDay: (day: DialaDay, planFromSchedule: boolean, entries: DayEntry[]) => void;
  updateDay: (id: string, patch: Partial<DialaDay>) => void;
  setDayStatus: (id: string, status: DialaDay["status"], actor: string) => void;
  closeDay: (id: string, actor: string) => void;
  reopenDay: (id: string, actor: string, reason: string) => void;
  archiveDay: (id: string, archived: boolean, opts?: { reason?: string; actor?: string; force?: boolean }) => void;
  createRound: (round: DialaRound, dates: string[]) => void;
  /** حفظ الديالة: أيامها لا تُحذف ولا تُؤرشف إلا بفك الحفظ بسبب موثّق */
  lockRound: (id: string, actor: string) => void;
  unlockRound: (id: string, reason: string, actor: string) => void;
  archiveRound: (
    id: string,
    archived: boolean,
    opts?: { reason?: string; actor?: string; force?: boolean }
  ) => void;
  saveEntry: (
    entry: DayEntry,
    isNew: boolean,
    opts?: { correctionReason?: string; actor?: string }
  ) => void;
  saveEntries: (
    dayId: string,
    entries: DayEntry[],
    opts?: { correctionReason?: string; actor?: string }
  ) => void;
  moveEntry: (id: string, dir: -1 | 1) => void;
  /** بدء الدوام الفعلي من كشف الديالة (لا يحذف أي صف فيه استخدام مسجّل) */
  applyBaseRosterToDay: (dayId: string, opts?: { correctionReason?: string; actor?: string }) => void;
  /** كشف الدوام الأساسي: إضافة/تعديل نصيب شخص في كشف الديالة */
  saveBaseRosterMember: (
    roundId: string,
    personId: string,
    shareMin: number,
    opts?: { role?: EntryRole; notes?: string; actor?: string }
  ) => void;
  /** إضافة جماعية إلى الكشف — تُضاف الأسطر حتى تمتلئ ساعات التشغيل */
  bulkAddBaseRoster: (
    roundId: string,
    items: { personId: string; shareMin: number; role?: EntryRole }[],
    actor?: string
  ) => void;
  setBaseRosterShare: (id: string, shareMin: number, actor?: string) => void;
  moveBaseRosterMember: (roundId: string, id: string, dir: -1 | 1, actor?: string) => void;
  removeBaseRosterMember: (id: string, opts?: { reason?: string; actor?: string }) => void;
  /** تثبيت/فك تثبيت كشف الديالة */
  setRoundRosterLock: (roundId: string, locked: boolean, reason?: string, actor?: string) => void;
  removeEntry: (id: string, opts?: { reason?: string; actor?: string }) => void;
  recordUsage: (input: {
    dayId: string;
    entryId: string | null;
    personId: string;
    shareholderId: string | null;
    rightHolderId: string | null;
    usageType: UsageType;
    startTime: string;
    endTime: string;
    notes: string;
    dieselSettlement: DieselSettlement;
    dieselShortageLiters: number;
    royaltyPayMode: RoyaltyPayMode;
    settlementNote: string;
    overCapacityReason: string;
    personalFuelPrice?: number;
    confirmedOverlap?: boolean;
    correctionReason?: string;
    actor: string;
  }) => void;
  setUsageSettlement: (
    usageId: string,
    input: {
      dieselSettlement: DieselSettlement;
      dieselShortageLiters: number;
      royaltyPayMode: RoyaltyPayMode;
      settlementNote: string;
      reason: string;
      actor: string;
    }
  ) => void;
  voidUsage: (id: string, reason: string, actor: string) => void;
  saveStoppage: (
    s: Stoppage,
    isNew: boolean,
    opts?: { correctionReason?: string; actor?: string }
  ) => void;
  archiveStoppage: (id: string, archived: boolean, opts?: { reason?: string; actor?: string }) => void;
  saveFuel: (r: FuelRecord, isNew: boolean) => void;
  archiveFuel: (id: string, archived: boolean) => void;
  saveOperator: (r: OperatorRecord, isNew: boolean) => void;
  archiveOperator: (id: string, archived: boolean) => void;
  addTransaction: (tx: Transaction) => void;
  correctTransaction: (id: string, newAmount: number, reason: string, actor: string) => void;
  voidTransaction: (id: string, reason: string, actor: string) => void;
  savePersonal: (r: PersonalRecord, isNew: boolean) => void;
  archivePersonal: (id: string, archived: boolean) => void;
  settle: (
    settlement: Settlement,
    personalRecordId: string | null,
    officialUsageId: string | null,
    adjustmentTx: Transaction | null
  ) => void;
  ackConflict: (ack: ConflictAck) => void;
  /** حفظ دفعة مستقلة (§12) */
  addPayment: (payment: Payment, actor: string) => void;
  voidPayment: (id: string, reason: string, actor: string) => void;
  /** حفظ دين مستقل (§13) */
  addDebt: (debt: Debt, actor: string, txKind?: Transaction["kind"]) => void;
  cancelDebt: (id: string, reason: string, actor: string) => void;
  /** عمليات السلف والإعارة والتحويل (§14) */
  addTransferEvent: (event: TransferEvent, tx: Transaction | null, actor: string) => void;
  cancelTransferEvent: (id: string, reason: string, actor: string) => void;
  /** مزامنة التعارضات المكتشفة (لا تحلّها ولا تعدّل أي سجل) */
  syncConflicts: (detected: DetectedConflict[]) => void;
  resolveConflict: (
    id: string,
    status: ConflictStatus,
    resolution: string,
    notes: string,
    actor: string
  ) => void;
  readNotifications: (ids: string[] | null) => void;
  clearNotifications: () => void;
  setTheme: (theme: Theme) => void;
  markSynced: () => void;
  reset: () => void;
  seedDemo: () => void;
  importState: (state: AppState) => void;
}

/** حالة حفظ البيانات الرسمية على الخادم (المرحلة الثانية) */
export type CloudSyncState = "local" | "connecting" | "synced" | "offline";

interface AppContextValue {
  state: AppState;
  actions: AppActions;
  /** حالة المزامنة مع الخادم: بيانات التشغيل الرسمية في PostgreSQL */
  syncState: CloudSyncState;
}

const AppContext = createContext<AppContextValue | null>(null);

function loadInitial(storageKey: string, adoptName: string): AppState {
  const scoped = readRawState(storageKey);
  if (scoped) return scoped;

  /* ترحيل ناعم: بيانات كانت محفوظة قبل نظام الحسابات بالمفتاح العام — لا تُحذف ولا تُستبدل */
  const legacyGlobal = readRawState(STORAGE_KEY) ?? readRawState(LEGACY_KEY);
  if (legacyGlobal) {
    const legacyName = (legacyGlobal.pump?.name ?? "").trim();
    if (!legacyGlobal.pump || !adoptName || legacyName === adoptName.trim()) {
      /* يُمرَّر على نفس التصفية لضمان الحقول الحديثة (منها قوائم أساسيي الأيام) */
      const normalized = normalizeState(legacyGlobal);
      try {
        localStorage.setItem(storageKey, JSON.stringify(normalized));
      } catch {
        /* ignore */
      }
      return normalized;
    }
  }
  return emptyState();
}

function readRawState(key: string): AppState | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<AppState> & { version?: number };
    if (parsed && (parsed.version === 3 || parsed.version === 2)) {
      // الحقول الحديثة تُضاف، والأيام تُربط بديالاتها، ولا تُحذف أي بيانات قائمة
      return normalizeState(parsed);
    }
    if (parsed && typeof parsed === "object") {
      return normalizeState(migrateV1(parsed));
    }
  } catch {
    /* بيانات تالفة — نبدأ من حالة فارغة دون حذف أي شيء */
  }
  return null;
}

export function AppProvider({
  children,
  storageKey = STORAGE_KEY,
  adoptName = "",
}: {
  children: ReactNode;
  storageKey?: string;
  adoptName?: string;
}) {
  const [state, dispatch] = useReducer(reducer, undefined, () => loadInitial(storageKey, adoptName));

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(state));
    } catch {
      /* ignore */
    }
  }, [state, storageKey]);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", state.settings.theme === "dark");
  }, [state.settings.theme]);

  /**
   * ============================ المرحلة الثانية ============================
   * بيانات التشغيل الرسمية على الخادم (PostgreSQL): PostgreSQL هو المصدر الرسمي،
   * وlocalStorage نسخة محلية/ذاكرة مؤقتة — مع ترحيل آمن يحفظ نسخة احتياطية ولا يحذف شيئًا.
   */
  const serverPumpIdRef = useRef<string | null>(null);
  const versionRef = useRef(0);
  const migratedRef = useRef(false);
  const firstRunRef = useRef(true);
  const skipPushRef = useRef(false);
  const pushTimer = useRef<number | null>(null);
  const [syncState, setSyncState] = useState<"local" | "connecting" | "synced" | "offline">("local");

  /* ربط حالة الجهاز بمضخة الخادم + ترحيل البيانات المحلية مرة واحدة */
  useEffect(() => {
    const token = getToken();
    const code = state.pump?.pumpCode;
    if (!token || !code) {
      setSyncState("local");
      return;
    }
    let alive = true;
    setSyncState("connecting");
    (async () => {
      const pumpId = await resolveServerPumpId(code);
      if (!alive) return;
      if (!pumpId) {
        setSyncState("local");
        return;
      }
      serverPumpIdRef.current = pumpId;
      const remote = await pullOperating(pumpId);
      if (!alive) return;
      if (!remote) {
        setSyncState("offline");
        return;
      }
      versionRef.current = remote.meta.version;
      const localHasData = Boolean(state.pump) && (state.rounds.length > 0 || state.days.length > 0);
      const serverHasData =
        Boolean(remote.settings) ||
        remote.dialas.length > 0 ||
        remote.roster.length > 0 ||
        remote.days.length > 0 ||
        remote.people.length > 0 ||
        remote.entries.length > 0;

      const backup = (reason: string) => {
        if (!localHasData) return;
        try {
          localStorage.setItem(
            `pump-org-backup-${reason}::${storageKey}`,
            JSON.stringify({ at: new Date().toISOString(), reason, state })
          );
        } catch {
          /* لا نُفشل المزامنة إن امتلأ التخزين */
        }
      };

      if (!serverHasData && localHasData) {
        /* ترحيل آمن: نسخة احتياطية محلية أولًا، ثم الرفع، ثم علامة ترحيل — بلا حذف أي شيء */
        backup("phase2");
        const meta = await pushOperating(pumpId, state, {
          migration: true,
          version: remote.meta.version,
        });
        if (!alive) return;
        if (meta?.migratedAt) {
          try {
            localStorage.setItem(`pump-org-migrated::${pumpId}`, meta.migratedAt);
          } catch {
            /* ignore */
          }
          versionRef.current = meta.version;
          migratedRef.current = true;
          setSyncState("synced");
        } else {
          setSyncState("offline");
        }
      } else if (serverHasData || remote.meta.migratedAt) {
        /* الخادم رسمي: ننسخ الحالة الرسمية إلى هذا الجهاز (بنسخة احتياطية قبل الاستبدال) */
        backup("preimport");
        const merged = applyPayload(state, remote);
        skipPushRef.current = true;
        dispatch({ type: "IMPORT", state: { ...merged, version: 3 } });
        migratedRef.current = true;
        setSyncState("synced");
      } else {
        /* لا بيانات بعد على الخادم ولا محليًا: الاتصال جاهز وكل تعديل قادم سيُرفع */
        migratedRef.current = true;
        setSyncState("synced");
      }
      firstRunRef.current = false;
    })().catch(() => {
      if (alive) setSyncState("offline");
      firstRunRef.current = false;
    });
    return () => {
      alive = false;
    };
    // الربط يتم مرة واحدة عند فتح التطبيق أو تغيّر رقم تعريف المضخة
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.pump?.pumpCode, storageKey]);

  /* رفع التعديلات إلى الخادم بعد كل تغيير رسمي (بتأخير قصير) */
  useEffect(() => {
    const pumpId = serverPumpIdRef.current;
    if (!pumpId || !migratedRef.current) return;
    if (skipPushRef.current) {
      /* التغيير جاء من تنزيل البيانات الرسمية — لا حاجة لإعادة رفعها */
      skipPushRef.current = false;
      return;
    }
    if (pushTimer.current) window.clearTimeout(pushTimer.current);
    setSyncState("connecting");
    pushTimer.current = window.setTimeout(async () => {
      const meta = await pushOperating(pumpId, state, { version: versionRef.current });
      if (meta) {
        versionRef.current = meta.version;
        setSyncState("synced");
      } else {
        setSyncState("offline");
      }
    }, 2500);
    return () => {
      if (pushTimer.current) window.clearTimeout(pushTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  /**
   * مزامنة التعارضات (§18): تُكتشف التعارضات وتُحفظ كسجلات مستقلة،
   * ولا يُعدَّل أي سجل رسمي أو شخصي، ولا يُعاد فتح تعارض حُلّ سابقًا.
   */
  const conflictSignature = useRef("");
  useEffect(() => {
    if (!state.pump) return;
    const detected = detectConflicts(state);
    const signature = JSON.stringify(
      detected.map((d) => [d.key, d.officialValue, d.personalValue, d.difference])
    );
    if (signature === conflictSignature.current) return;
    conflictSignature.current = signature;
    dispatch({ type: "SYNC_CONFLICTS", detected });
  }, [state]);

  const actions = useMemo<AppActions>(
    () => ({
      savePump: (pump, isNew) => dispatch({ type: "SAVE_PUMP", pump, isNew }),
      updatePump: (patch) => dispatch({ type: "UPDATE_PUMP", patch }),
      savePerson: (person, isNew) => dispatch({ type: "SAVE_PERSON", person, isNew }),
      archivePerson: (id, archived) => dispatch({ type: "ARCHIVE_PERSON", id, archived }),
      saveShareholder: (shareholder, isNew) =>
        dispatch({ type: "SAVE_SHAREHOLDER", shareholder, isNew }),
      archiveShareholder: (id, archived) =>
        dispatch({ type: "ARCHIVE_SHAREHOLDER", id, archived }),
      addRight: (right, endPrevious) => dispatch({ type: "ADD_RIGHT", right, endPrevious }),
      endRight: (id, endedAt, reason, actor) =>
        dispatch({ type: "END_RIGHT", id, endedAt, reason, actor }),
      cancelRight: (id, reason) => dispatch({ type: "CANCEL_RIGHT", id, reason }),
      createDay: (day, planFromSchedule, entries) =>
        dispatch({ type: "CREATE_DAY", day, planFromSchedule, entries }),
      updateDay: (id, patch) => dispatch({ type: "UPDATE_DAY", id, patch }),
      setDayStatus: (id, status, actor) =>
        dispatch({ type: "SET_DAY_STATUS", id, status, actor }),
      closeDay: (id, actor) => dispatch({ type: "CLOSE_DAY", id, actor }),
      reopenDay: (id, actor, reason) => dispatch({ type: "REOPEN_DAY", id, actor, reason }),
      archiveDay: (id, archived, opts) => dispatch({ type: "ARCHIVE_DAY", id, archived, ...opts }),
      createRound: (round, dates) => dispatch({ type: "CREATE_ROUND", round, dates }),
      lockRound: (id, actor) => dispatch({ type: "LOCK_ROUND", id, actor }),
      unlockRound: (id, reason, actor) => dispatch({ type: "UNLOCK_ROUND", id, reason, actor }),
      archiveRound: (id, archived, opts) => dispatch({ type: "ARCHIVE_ROUND", id, archived, ...opts }),
      saveEntry: (entry, isNew, opts) =>
        dispatch({ type: "SAVE_ENTRY", entry, isNew, ...opts }),
      saveEntries: (dayId, entries, opts) =>
        dispatch({ type: "SAVE_ENTRIES", dayId, entries, ...opts }),
      moveEntry: (id, dir) => dispatch({ type: "MOVE_ENTRY", id, dir }),
      applyBaseRosterToDay: (dayId, opts) =>
        dispatch({ type: "APPLY_BASE_ROSTER_TO_DAY", dayId, ...opts }),
      saveBaseRosterMember: (roundId, personId, shareMin, opts) =>
        dispatch({ type: "SAVE_BASE_ROSTER_MEMBER", roundId, personId, shareMin, ...opts }),
      bulkAddBaseRoster: (roundId, items, actor) =>
        dispatch({ type: "BULK_ADD_BASE_ROSTER", roundId, items, actor }),
      setBaseRosterShare: (id, shareMin, actor) =>
        dispatch({ type: "SET_BASE_ROSTER_SHARE", id, shareMin, actor }),
      moveBaseRosterMember: (roundId, id, dir, actor) =>
        dispatch({ type: "MOVE_BASE_ROSTER_MEMBER", roundId, id, dir, actor }),
      removeBaseRosterMember: (id, opts) =>
        dispatch({ type: "REMOVE_BASE_ROSTER_MEMBER", id, ...opts }),
      setRoundRosterLock: (roundId, locked, reason, actor) =>
        dispatch({ type: "SET_ROUND_ROSTER_LOCK", roundId, locked, reason, actor }),
      removeEntry: (id, opts) => dispatch({ type: "REMOVE_ENTRY", id, ...opts }),
      recordUsage: (input) => dispatch({ type: "RECORD_USAGE", ...input }),
      setUsageSettlement: (usageId, input) =>
        dispatch({ type: "SET_USAGE_SETTLEMENT", usageId, ...input }),
      voidUsage: (id, reason, actor) => dispatch({ type: "VOID_USAGE", id, reason, actor }),
      saveStoppage: (stoppage, isNew, opts) =>
        dispatch({ type: "SAVE_STOPPAGE", stoppage, isNew, ...opts }),
      archiveStoppage: (id, archived, opts) =>
        dispatch({ type: "ARCHIVE_STOPPAGE", id, archived, ...opts }),
      saveFuel: (record, isNew) => dispatch({ type: "SAVE_FUEL", record, isNew }),
      archiveFuel: (id, archived) => dispatch({ type: "ARCHIVE_FUEL", id, archived }),
      saveOperator: (record, isNew) => dispatch({ type: "SAVE_OPERATOR", record, isNew }),
      archiveOperator: (id, archived) => dispatch({ type: "ARCHIVE_OPERATOR", id, archived }),
      addTransaction: (tx) => dispatch({ type: "ADD_TRANSACTION", tx }),
      correctTransaction: (id, newAmount, reason, actor) =>
        dispatch({ type: "CORRECT_TRANSACTION", id, newAmount, reason, actor }),
      voidTransaction: (id, reason, actor) =>
        dispatch({ type: "VOID_TRANSACTION", id, reason, actor }),
      savePersonal: (record, isNew) => dispatch({ type: "SAVE_PERSONAL", record, isNew }),
      archivePersonal: (id, archived) => dispatch({ type: "ARCHIVE_PERSONAL", id, archived }),
      settle: (settlement, personalRecordId, officialUsageId, adjustmentTx) =>
        dispatch({ type: "SETTLE", settlement, personalRecordId, officialUsageId, adjustmentTx }),
      ackConflict: (ack) => dispatch({ type: "ACK_CONFLICT", ack }),
      addPayment: (payment, actor) => dispatch({ type: "ADD_PAYMENT", payment, actor }),
      voidPayment: (id, reason, actor) => dispatch({ type: "VOID_PAYMENT", id, reason, actor }),
      addDebt: (debt, actor, txKind) => dispatch({ type: "ADD_DEBT", debt, actor, txKind }),
      cancelDebt: (id, reason, actor) => dispatch({ type: "CANCEL_DEBT", id, reason, actor }),
      addTransferEvent: (event, tx, actor) =>
        dispatch({ type: "ADD_TRANSFER_EVENT", event, tx, actor }),
      cancelTransferEvent: (id, reason, actor) =>
        dispatch({ type: "CANCEL_TRANSFER_EVENT", id, reason, actor }),
      syncConflicts: (detected) => dispatch({ type: "SYNC_CONFLICTS", detected }),
      resolveConflict: (id, status, resolution, notes, actor) =>
        dispatch({ type: "RESOLVE_CONFLICT", id, status, resolution, notes, actor }),
      readNotifications: (ids) => dispatch({ type: "READ_NOTIFICATIONS", ids }),
      clearNotifications: () => dispatch({ type: "CLEAR_NOTIFICATIONS" }),
      setTheme: (theme) => dispatch({ type: "SET_THEME", theme }),
      markSynced: () => dispatch({ type: "MARK_SYNCED" }),
      reset: () => dispatch({ type: "RESET" }),
      seedDemo: () => dispatch({ type: "SEED_DEMO" }),
      importState: (state) => dispatch({ type: "IMPORT", state }),
    }),
    []
  );

  const value = useMemo(() => ({ state, actions, syncState }), [state, actions, syncState]);
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}

export { STORAGE_KEY, nowTime, todayISO, personBalance };
/** يُستخدم في الاختبارات الآلية (§27) — نفس المخزن الذي تعمل به الشاشات */
export const reducerForTests = reducer;
