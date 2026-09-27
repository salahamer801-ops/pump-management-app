/**
 * الترحيل من الإصدار القديم (v1) إلى النموذج الجديد (v2)
 * + بيانات تجريبية تغطي حالات النظام الحقيقية.
 * قاعدة: لا نحذف بيانات حقيقية — كل ما كان موجودًا يُنقل كسجل تاريخي.
 */
import type {
  ActualUsage,
  AppState,
  AuditLog,
  BaseRosterMember,
  ContributorV1,
  CycleV1,
  DialaDay,
  DialaRound,
  DayEntry,
  Debt,
  EntryRole,
  OtherChargeV1,
  Person,
  Pump,
  PumpV1,
  Shareholder,
  Transaction,
  TransferEvent,
} from "./types";
import { addDaysISO, durationMin, isoToShort, minutesToTime, timeToMinutes, todayISO, uid } from "./util";
import { computeUsageDraft, isoRangeDays } from "./rules";
import { generatePumpCode } from "../lib/auth";

export function emptyState(): AppState {
  return {
    version: 3,
    pump: null,
    persons: [],
    shareholders: [],
    rights: [],
    rounds: [],
    days: [],
    roster: [],
    entries: [],
    usages: [],
    stoppages: [],
    fuelRecords: [],
    operatorRecords: [],
    transactions: [],
    personalRecords: [],
    settlements: [],
    conflictAcks: [],
    payments: [],
    debts: [],
    conflicts: [],
    transferEvents: [],
    corrections: [],
    notifications: [],
    auditLogs: [],
    syncQueue: [],
    settings: {
      theme: "light",
      language: "ar",
      deviceId: uid("dev"),
      lastSyncAt: "",
    },
    counters: { diala: 1, round: 1 },
  };
}

/**
 * كل يوم فعلي يجب أن ينتمي إلى ديالة (§ الديالة أم أيام المساهمة).
 * الأيام القديمة التي أُنشئت بلا ديالة تُربط تلقائيًا: الأيام المتتابعة تُجمَّع في ديالة،
 * ويُحفظ ترتيبها فتصبح «اليوم الأول»، «اليوم الثاني»… ولا يُحذف أي يوم.
 */
function linkDaysToRounds(input: AppState): Pick<AppState, "rounds" | "days" | "counters"> {
  const rounds: DialaRound[] = [...(input.rounds ?? [])];
  const known = new Set(rounds.map((r) => r.id));
  const days: DialaDay[] = [...(input.days ?? [])];
  const counters = { ...input.counters };
  const loose = days.filter((d) => !d.roundId || !known.has(d.roundId));
  if (loose.length === 0) return { rounds, days, counters };

  const sorted = loose.slice().sort((a, b) => (a.date < b.date ? -1 : 1));
  const groups: DialaDay[][] = [];
  for (const d of sorted) {
    const last = groups[groups.length - 1];
    if (last && addDaysISO(last[last.length - 1].date, 1) === d.date) last.push(d);
    else groups.push([d]);
  }

  let number = Math.max(counters.round || 1, 1);
  const assign = new Map<string, { roundId: string; number: number }>();
  for (const group of groups) {
    const startDate = group[0].date;
    const endDate = group[group.length - 1].date;
    if (group.length === 1) {
      const covering = rounds.find(
        (r) => !r.archived && r.startDate <= startDate && startDate <= r.endDate
      );
      if (covering) {
        assign.set(group[0].id, { roundId: covering.id, number: covering.number });
        continue;
      }
    }
    const round: DialaRound = {
      id: uid("rnd"),
      pumpId: group[0].pumpId,
      number,
      startDate,
      days: Math.max(1, isoRangeDays(startDate, endDate).length),
      endDate,
      locked: false,
      lockedAt: "",
      lockedBy: "",
      notes: "ديالة مرتبطة تلقائيًا من أيام مسجّلة سابقًا",
      createdAt: new Date().toISOString(),
      createdBy: "system",
      archived: false,
    };
    rounds.push(round);
    for (const d of group) assign.set(d.id, { roundId: round.id, number });
    number += 1;
  }

  const maxDiala = days.reduce((m, d) => Math.max(m, d.dialaNumber || 0), counters.diala || 1);
  return {
    rounds,
    days: days.map((d) => {
      const a = assign.get(d.id);
      return a ? { ...d, roundId: a.roundId, dialaNumber: a.number } : d;
    }),
    counters: {
      round: Math.max(counters.round || 1, number),
      diala: Math.max(maxDiala, number),
    },
  };
}

/** سطر كشف كما كان محفوظًا سابقًا (مفتاحه يوم أو ديالة) */
type RawRosterRow = Partial<BaseRosterMember> & { dayId?: string };

/** مدة الصف المخطَّط كما كان مسجَّلًا (قراءة فقط) */
function plannedMinOf(entry: DayEntry): number {
  if (entry.startTime && entry.endTime) return durationMin(entry.startTime, entry.endTime);
  return entry.plannedMin || 0;
}

/**
 * ترحيل ناعم إلى **كشف الديالة** (ترتيب واحد لكل أيام الديالة):
 *
 * 1) أي أسطر كشف قديمة كانت مفتاحها **اليوم** (`dayId`) تُجمع بالديالة وبالشخص:
 *    شخص واحد = سطر واحد، ونصيبه = **الأكبر** بين أيامه (لا يُقلَّص نصيب أحد)،
 *    والأسطر القديمة تبقى **مؤرشفة** وموسومة بـ `legacyDayId` — لا يُحذف أي سجل.
 * 2) أي ديالة لا كشف لها تُبنى من صفوف أيامها المسجّلة (شخص + نصيب اليوم الأكبر).
 * 3) الديالات التي لها كشف تبقى كما هي — لا تُعاد بناؤها ولا تُلمس.
 */
export function migrateRosterToRounds(
  rounds: DialaRound[],
  days: DialaDay[],
  entries: DayEntry[],
  raw: RawRosterRow[] | undefined
): BaseRosterMember[] {
  const now = new Date().toISOString();
  const roundByLegacyDay = new Map<string, string>();
  for (const d of days) if (d.roundId) roundByLegacyDay.set(d.id, d.roundId);

  const kept: BaseRosterMember[] = [];
  const legacy: BaseRosterMember[] = [];
  const byRoundPerson = new Map<string, BaseRosterMember>();

  for (const row of raw ?? []) {
    if (!row.personId) continue;
    const personId = row.personId;
    if (row.roundId) {
      /* سطر كشف حديث — يبقى كما هو */
      kept.push({
        id: row.id ?? uid("rst"),
        pumpId: row.pumpId ?? "",
        roundId: row.roundId,
        personId,
        shareMin: row.shareMin ?? 0,
        order: row.order ?? 0,
        role: row.role ?? "shareholder",
        notes: row.notes ?? "",
        archived: row.archived ?? false,
        createdAt: row.createdAt ?? now,
        createdBy: row.createdBy ?? "system",
      });
      continue;
    }
    if (!row.dayId) continue;
    const roundId = roundByLegacyDay.get(row.dayId);
    if (!roundId) continue;
    legacy.push({
      id: row.id ?? uid("rst"),
      pumpId: row.pumpId ?? "",
      roundId,
      personId,
      shareMin: row.shareMin ?? 0,
      order: row.order ?? 0,
      role: row.role ?? "shareholder",
      notes: row.notes ?? "",
      archived: true,
      deletedAt: now,
      deletedBy: "system",
      deletionReason: "نُقل إلى كشف الديالة (ترحيل ناعم)",
      createdAt: row.createdAt ?? now,
      createdBy: row.createdBy ?? "system",
      legacyDayId: row.dayId,
    });
    if (row.archived) continue;
    const key = `${roundId}::${personId}`;
    const existing = byRoundPerson.get(key);
    const share = row.shareMin ?? 0;
    if (existing) {
      if (share > existing.shareMin) existing.shareMin = share;
      if ((row.order ?? 0) < existing.order) existing.order = row.order ?? 0;
      existing.notes = "جُمع من قوائم أيام الديالة (أكبر نصيب)";
    } else {
      byRoundPerson.set(key, {
        id: uid("rst"),
        pumpId: row.pumpId ?? "",
        roundId,
        personId,
        shareMin: share,
        order: row.order ?? 0,
        role: row.role ?? "shareholder",
        notes: "جُمع من قوائم أيام الديالة",
        archived: false,
        createdAt: now,
        createdBy: "system",
        legacyDayId: row.dayId,
      });
    }
  }

  /* الديالات التي لها كشف فعلًا — لا تُبنى من جديد */
  const covered = new Set<string>();
  for (const row of kept) if (!row.archived) covered.add(row.roundId);
  for (const row of byRoundPerson.values()) covered.add(row.roundId);

  const seeded: BaseRosterMember[] = [];
  for (const round of rounds.filter((r) => !r.archived)) {
    if (covered.has(round.id)) continue;
    const roundDays = days
      .filter((d) => d.roundId === round.id && !d.archived)
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    const perPerson = new Map<string, { shareMin: number; order: number; role: EntryRole; dayId: string }>();
    let index = 0;
    for (const day of roundDays) {
      const rows = entries
        .filter((e) => e.dayId === day.id && !e.archived)
        .sort((a, b) => a.orderIndex - b.orderIndex);
      const dayTotals = new Map<string, { min: number; role: EntryRole }>();
      for (const e of rows) {
        const minutes = plannedMinOf(e);
        const seen = dayTotals.get(e.personId);
        if (seen) seen.min += minutes;
        else dayTotals.set(e.personId, { min: minutes, role: e.role });
      }
      for (const [personId, info] of dayTotals) {
        const seen = perPerson.get(personId);
        if (seen) {
          if (info.min > seen.shareMin) {
            seen.shareMin = info.min;
            seen.dayId = day.id;
          }
        } else {
          perPerson.set(personId, { shareMin: info.min, order: index++, role: info.role, dayId: day.id });
        }
      }
    }
    if (perPerson.size === 0) continue;
    for (const [personId, info] of [...perPerson.entries()].sort((a, b) => a[1].order - b[1].order)) {
      seeded.push({
        id: uid("rst"),
        pumpId: round.pumpId,
        roundId: round.id,
        personId,
        shareMin: info.shareMin,
        order: info.order,
        role: info.role ?? "shareholder",
        notes: "قُرئ من صفوف أيام الديالة المسجّلة",
        archived: false,
        createdAt: now,
        createdBy: "system",
        legacyDayId: info.dayId,
      });
    }
  }

  /* ترتيب نهائي لكل ديالة: من 0 إلى n بلا فراغات — والترتيب يُثبَّت ويُورَّث */
  const all = [...kept, ...byRoundPerson.values(), ...seeded];
  const byRound = new Map<string, BaseRosterMember[]>();
  for (const row of all) {
    const list = byRound.get(row.roundId) ?? [];
    list.push(row);
    byRound.set(row.roundId, list);
  }
  const ordered: BaseRosterMember[] = [];
  for (const list of byRound.values()) {
    list
      .slice()
      .sort((a, b) => a.order - b.order)
      .forEach((row, i) => ordered.push({ ...row, order: i }));
  }
  return [...ordered, ...legacy];
}

/**
 * تصفية الحالة المقروءة من التخزين: نضمن وجود الحقول الحديثة
 * (حالة استخدام السهم، حالة تسديد الديزل، نوع سداد الرواسة، الدفعات، الديون،
 * التعارضات، السلف، التصحيحات) وأن كل يوم فعلي داخل ديالة — دون حذف أي بيانات قديمة.
 *
 * قاعدة §17: لا يُعاد حساب أي قيمة تاريخية هنا. القيم القديمة
 * (اللترات، سعر اللتر، الاستحقاق، الاستهلاك/ساعة) تبقى كما حُفظت وقت العملية.
 */
export function normalizeState(
  input: Partial<AppState> & { version?: number }
): AppState {
  const base = emptyState();
  const linked = linkDaysToRounds({ ...base, ...input } as AppState);
  const usages = (input.usages ?? []).map((u) => ({
    ...u,
    dieselSettlement: u.dieselSettlement ?? "unpaid",
    dieselShortageLiters: u.dieselShortageLiters ?? 0,
    royaltyPayMode: u.royaltyPayMode ?? "credit",
    settlementNote: u.settlementNote ?? "",
    /* الحقول الجديدة تُملأ بقيم محايدة — والقيم المحسوبة القديمة لا تُلمس */
    personalFuelPriceSnapshot: u.personalFuelPriceSnapshot ?? 0,
    fuelCost: u.fuelCost ?? u.fuelAmountDue ?? 0,
    stoppageMin: u.stoppageMin ?? 0,
    overCapacityMin: u.overCapacityMin ?? 0,
    source: u.source ?? ("manager" as const),
    updatedAt: u.updatedAt ?? u.createdAt ?? new Date().toISOString(),
  }));
  return {
    ...base,
    ...input,
    version: 3,
    rounds: linked.rounds.map((r) => ({
      ...r,
      locked: r.locked ?? false,
      lockedAt: r.lockedAt ?? "",
      lockedBy: r.lockedBy ?? "",
    })),
    days: linked.days.map((d) => ({
      ...d,
      /* الجدول الأساسي يُثبَّت مرة واحدة ثم لا يتغيّر بتعديل اليوم الفعلي (§4) */
      plannedWorkStart: d.plannedWorkStart ?? d.workStart ?? "06:00",
      plannedWorkEnd: d.plannedWorkEnd ?? d.workEnd ?? "18:00",
      plannedCapacityMin:
        d.plannedCapacityMin ?? d.capacityMin ?? durationMin(d.workStart, d.workEnd),
    })),
    entries: (input.entries ?? []).map((e) => ({ ...e, archived: e.archived ?? false })),
    /* كشف الديالة: أسطر الديالة تبقى، والأسطر اليومية القديمة تُجمع في كشف ديالتها
       بلا حذف أي سجل (تبقى مؤرشفة موسومة بـ legacyDayId) */
    roster: migrateRosterToRounds(
      linked.rounds,
      linked.days,
      input.entries ?? [],
      input.roster as RawRosterRow[] | undefined
    ),
    usages,
    stoppages: (input.stoppages ?? []).map((s) => ({ ...s, archived: s.archived ?? false })),
    operatorRecords: (input.operatorRecords ?? []).map((o) => {
      const paid = o.paidAmount ?? 0;
      const remaining = o.remainingAmount ?? Math.max(0, (o.dueAmount ?? 0) - paid);
      return {
        ...o,
        attendantPersonId: o.attendantPersonId ?? null,
        ratePerHourSnapshot: o.ratePerHourSnapshot ?? o.hourlyWage ?? 0,
        paidAmount: paid,
        remainingAmount: remaining,
        status:
          o.status ??
          (o.archived
            ? "cancelled"
            : remaining <= 0 && (o.dueAmount ?? 0) > 0
              ? "settled"
              : paid > 0
                ? "partial"
                : "open"),
      };
    }),
    personalRecords: (input.personalRecords ?? []).map((p) => ({
      ...p,
      source: p.source ?? ("user" as const),
    })),
    payments: input.payments ?? [],
    debts: input.debts ?? [],
    conflicts: input.conflicts ?? [],
    transferEvents: input.transferEvents ?? [],
    corrections: input.corrections ?? [],
    counters: { ...base.counters, ...input.counters, ...linked.counters },
    settings: { ...base.settings, ...input.settings },
    shareholders: (input.shareholders ?? []).map((s) => ({
      ...s,
      useStatus: s.useStatus ?? "continuing",
      counterpartPersonId: s.counterpartPersonId ?? null,
      counterpartPhone: s.counterpartPhone ?? "",
      useStatusAt: s.useStatusAt ?? "",
      useStatusNote: s.useStatusNote ?? "",
    })),
  };
}

/* ------------------------------ ترحيل v1 ------------------------------- */

export function pumpFromV1(p: PumpV1): Pump {
  return {
    id: uid("pump"),
    /* رقم تعريف محلي للمضخة المرحَّلة — لا يمنح أي صلاحية، ويُستبدل برقم الخادم عند تسجيلها هناك */
    pumpCode: generatePumpCode(),
    name: p.name || "المضخة",
    wells: p.wells || "",
    farm: p.farm || "",
    engine: "",
    energyType: p.energyType || "diesel",
    workStart: p.workStart || "06:00",
    workEnd: p.workEnd || "18:00",
    fuelConsumptionPerHour: p.fuelConsumptionPerHour || 0,
    fuelPerCycle: p.fuelPerCycle || 0,
    fuelCalcMode: p.fuelCalcMode || "hour",
    fuelPrice: p.fuelPrice || 0,
    royaltyEnabled: !!p.hasRoyalty,
    royaltyMode: p.royaltyMode || "cycle",
    royaltyPerCycle: p.royaltyPerCycle || 0,
    royaltyPerHour: p.royaltyPerHour || 0,
    operatorName: "",
    operatorHourlyWage: 0,
    operatorStart: p.workStart || "06:00",
    operatorEnd: p.workEnd || "18:00",
    shareUnit: p.shareUnit || "حصة",
    currency: p.currency || "YER",
    notes: p.notes || "",
    archived: false,
    createdAt: new Date().toISOString(),
  };
}

export function migrateV1(raw: unknown): AppState {
  const state = emptyState();
  if (!raw || typeof raw !== "object") return state;
  const v1 = raw as {
    pump?: PumpV1 | null;
    contributors?: ContributorV1[];
    cycles?: CycleV1[];
    otherCharges?: OtherChargeV1[];
    history?: { id: string; at: string; text: string }[];
  };

  if (v1.pump) state.pump = pumpFromV1(v1.pump);
  const pumpId = state.pump?.id ?? "pump_legacy";

  // المساهمون → أشخاص + أسهم
  const personByContributor = new Map<string, Person>();
  (v1.contributors ?? []).forEach((c, index) => {
    const person: Person = {
      id: uid("pr"),
      name: c.name,
      phone: c.phone || "",
      nationalId: "",
      notes: c.notes || "",
      guest: false,
      archived: !!c.archived,
      createdAt: c.createdAt || new Date().toISOString(),
      createdBy: "manager",
    };
    personByContributor.set(c.id, person);
    state.persons.push(person);
    const sh: Shareholder = {
      id: uid("sh"),
      pumpId,
      personId: person.id,
      shareNo: index + 1,
      units: c.shares || 0,
      baseHoursMin: 0,
      baseOrder: index,
      startDate: (c.createdAt || new Date().toISOString()).slice(0, 10),
      endDate: null,
      status: c.archived ? "ended" : "active",
      useStatus: "continuing",
      counterpartPersonId: null,
      counterpartPhone: "",
      useStatusAt: "",
      useStatusNote: "",
      notes: "",
      archived: !!c.archived,
      createdAt: c.createdAt || new Date().toISOString(),
    };
    state.shareholders.push(sh);
  });

  // الديالات → أيام فعلية
  (v1.cycles ?? []).forEach((cycle) => {
    const date = (cycle.createdAt || new Date().toISOString()).slice(0, 10);
    const day: DialaDay = {
      id: uid("day"),
      pumpId,
      dialaNumber: cycle.number || state.counters.diala,
      date,
      status: cycle.archived
        ? "closed"
        : cycle.turns?.some((t) => t.status === "in_progress")
          ? "in_progress"
          : cycle.turns?.some((t) => t.status === "completed")
            ? "completed"
            : "draft",
      workStart: cycle.workStart,
      workEnd: cycle.workEnd,
      capacityMin: durationMin(cycle.workStart, cycle.workEnd),
      plannedWorkStart: cycle.workStart,
      plannedWorkEnd: cycle.workEnd,
      plannedCapacityMin: durationMin(cycle.workStart, cycle.workEnd),
      notes: "",
      openedBy: "manager",
      closedBy: "",
      closedAt: "",
      reopenedBy: "",
      reopenedAt: "",
      reopenReason: "",
      revision: 0,
      createdAt: cycle.createdAt,
      updatedAt: cycle.createdAt,
      archived: !!cycle.archived,
    };
    state.days.push(day);
    state.counters.diala = Math.max(state.counters.diala, (cycle.number || 0) + 1);

    (cycle.turns ?? []).forEach((turn, i) => {
      const person = personByContributor.get(turn.contributorId);
      if (!person) return;
      const shareholder = state.shareholders.find((s) => s.personId === person.id) ?? null;
      const entry: DayEntry = {
        id: uid("en"),
        dayId: day.id,
        pumpId,
        orderIndex: i,
        personId: person.id,
        role: "shareholder",
        shareholderId: shareholder?.id ?? null,
        rightId: null,
        startTime: turn.plannedStart,
        endTime: turn.plannedEnd,
        plannedMin: turn.durationMin,
        actualPersonId: null,
        usageId: null,
        status:
          turn.status === "completed"
            ? "done"
            : turn.status === "in_progress"
              ? "planned"
              : turn.status === "postponed"
                ? "postponed"
                : "planned",
        postponeToDayId: null,
        reason: "",
        notes: turn.note || "",
        createdAt: cycle.createdAt,
        createdBy: "manager",
        archived: false,
      };
      state.entries.push(entry);

      // استخدام فعلي إن وُجدت أوقات فعلية
      if (turn.actualStart && turn.actualEnd && state.pump) {
        const draft = computeUsageDraft(state.pump, day, turn.actualStart, turn.actualEnd);
        const usage: ActualUsage = {
          id: uid("us"),
          pumpId,
          dayId: day.id,
          entryId: entry.id,
          personId: person.id,
          rightHolderId: null,
          shareholderId: shareholder?.id ?? null,
          date: day.date,
          startTime: turn.actualStart,
          endTime: turn.actualEnd,
          minutes: draft.minutes,
          crossesMidnight: draft.crossesMidnight,
          usageType: "share",
          fuelPerHourSnapshot: draft.fuelPerHourSnapshot,
          fuelLiters: draft.fuelLiters,
          fuelPriceSnapshot: draft.fuelPriceSnapshot,
          personalFuelPriceSnapshot: 0,
          fuelCost: draft.fuelAmountDue,
          fuelAmountDue: draft.fuelAmountDue,
          royaltyHourlySnapshot: draft.royaltyHourlySnapshot,
          royaltyAmountDue: draft.royaltyAmountDue,
          stoppageMin: 0,
          dieselSettlement: "unpaid",
          dieselShortageLiters: 0,
          royaltyPayMode: "credit",
          settlementNote: "حالة مرجعية من النظام القديم — الحركات المالية محفوظة كما وردت",
          overCapacity: false,
          overCapacityReason: "",
          overCapacityMin: 0,
          notes: "مُرحَّل من النظام القديم",
          source: "manager",
          status: "active",
          createdAt: cycle.createdAt,
          createdBy: "manager",
          updatedAt: cycle.createdAt,
        };
        state.usages.push(usage);
        entry.usageId = usage.id;
      }

      // المالية القديمة → حركات
      if (turn.fuelDue > 0) {
        state.transactions.push(
          legacyTx(pumpId, person.id, shareholder?.id ?? null, day.id, "fuel", "debit", turn.fuelDue, day.date, "استحقاق ديزل (مُرحَّل)")
        );
      }
      if (turn.royaltyDue > 0) {
        state.transactions.push(
          legacyTx(pumpId, person.id, shareholder?.id ?? null, day.id, "royalty", "debit", turn.royaltyDue, day.date, "استحقاق رواسة (مُرحَّل)")
        );
      }
      if (turn.fuelPaid > 0) {
        state.transactions.push(
          legacyTx(pumpId, person.id, shareholder?.id ?? null, day.id, "payment", "credit", turn.fuelPaid, (turn.fuelPaidDate || day.date).slice(0, 10), "دفعة ديزل (مُرحَّلة)")
        );
      }
      if (turn.royaltyPaid > 0) {
        state.transactions.push(
          legacyTx(pumpId, person.id, shareholder?.id ?? null, day.id, "payment", "credit", turn.royaltyPaid, (turn.royaltyPaidDate || day.date).slice(0, 10), "دفعة رواسة (مُرحَّلة)")
        );
      }
    });
  });

  // الرسوم الأخرى → حركات
  for (const charge of v1.otherCharges ?? []) {
    const person = personByContributor.get(charge.contributorId);
    if (!person) continue;
    if (charge.amount > 0) {
      state.transactions.push(
        legacyTx(pumpId, person.id, null, null, "debt", "debit", charge.amount, (charge.date || todayISO()).slice(0, 10), charge.label || "دين (مُرحَّل)")
      );
    }
    if (charge.paid > 0) {
      state.transactions.push(
        legacyTx(pumpId, person.id, null, null, "payment", "credit", charge.paid, (charge.date || todayISO()).slice(0, 10), `دفعة ${charge.label || ""} (مُرحَّلة)`)
      );
    }
  }

  // السجل القديم → سجل تدقيق
  for (const h of v1.history ?? []) {
    const log: AuditLog = {
      id: uid("lg"),
      at: h.at,
      actor: "manager",
      actorRole: "manager",
      action: "legacy",
      entity: "history",
      entityId: h.id,
      summary: h.text,
      before: "",
      after: "",
      reason: "مُرحَّل من الإصدار الأول",
      deviceId: state.settings.deviceId,
      synced: true,
    };
    state.auditLogs.push(log);
  }

  state.auditLogs.unshift({
    id: uid("lg"),
    at: new Date().toISOString(),
    actor: "manager",
    actorRole: "manager",
    action: "migrate",
    entity: "state",
    entityId: "v1",
    summary: `تم ترحيل البيانات القديمة: ${state.persons.length} شخص، ${state.shareholders.length} سهم، ${state.days.length} يوم، ${state.transactions.length} حركة مالية`,
    before: "",
    after: JSON.stringify({ persons: state.persons.length, days: state.days.length }),
    reason: "ترقية النظام",
    deviceId: state.settings.deviceId,
    synced: true,
  });

  return state;
}

function legacyTx(
  pumpId: string,
  personId: string,
  shareholderId: string | null,
  dayId: string | null,
  kind: Transaction["kind"],
  direction: Transaction["direction"],
  amount: number,
  date: string,
  reason: string
): Transaction {
  return {
    id: uid("tx"),
    pumpId,
    kind,
    direction,
    personId,
    shareholderId,
    dayId,
    usageId: null,
    operatorRecordId: null,
    fuelRecordId: null,
    amount,
    date: date || todayISO(),
    reason,
    status: "posted",
    correctsTxId: null,
    notes: "",
    source: "manager",
    createdAt: new Date().toISOString(),
    createdBy: "manager",
  };
}

/* ---------------------------- بيانات تجريبية --------------------------- */

export function seedDemo(): AppState {
  const state = emptyState();
  const today = todayISO();
  const yesterday = addDaysISO(today, -1);
  const pumpId = "pump_demo";

  state.pump = {
    id: pumpId,
    name: "مضخة العليا",
    wells: "بئر الحافة",
    farm: "وادي الحمراء",
    engine: "محرك 60 حصان",
    energyType: "diesel",
    workStart: "06:00",
    workEnd: "02:00",
    fuelConsumptionPerHour: 6,
    fuelPerCycle: 120,
    fuelCalcMode: "hour",
    fuelPrice: 1200,
    royaltyEnabled: true,
    royaltyMode: "hour",
    royaltyPerCycle: 0,
    royaltyPerHour: 500,
    operatorName: "سالم الرواس",
    operatorHourlyWage: 1500,
    operatorStart: "06:00",
    operatorEnd: "02:00",
    shareUnit: "حصة",
    currency: "YER",
    notes: "المضخة تعمل 20 ساعة يوميًا مع توقف يومي للتشحيل",
    archived: false,
    createdAt: new Date().toISOString(),
  };

  const mkPerson = (name: string, phone = "", notes = ""): Person => ({
    id: uid("pr"),
    name,
    phone,
    nationalId: "",
    notes,
    guest: false,
    archived: false,
    createdAt: new Date().toISOString(),
    createdBy: "manager",
  });

  const ahmed = mkPerson("أحمد خليل", "777111111");
  const mohammedK = mkPerson("محمد كريم", "777222222");
  const khaled = mkPerson("خالد أحمد", "777333333");
  const ali = mkPerson("علي حسن", "777444444");
  const mohammedA1 = mkPerson("محمد أحمد", "777555551", "ساكن الجهة الشرقية");
  const mohammedA2 = mkPerson("محمد أحمد", "777555552", "ساكن الجهة الغربية — شخص مختلف تمامًا");
  state.persons.push(ahmed, mohammedK, khaled, ali, mohammedA1, mohammedA2);

  const mkShare = (person: Person, units: number, baseHours: number, order: number): Shareholder => ({
    id: uid("sh"),
    pumpId,
    personId: person.id,
    shareNo: order + 1,
    units,
    baseHoursMin: baseHours * 60,
    baseOrder: order,
    startDate: addDaysISO(today, -120),
    endDate: null,
    status: "active",
    useStatus: "continuing",
    counterpartPersonId: null,
    counterpartPhone: "",
    useStatusAt: "",
    useStatusNote: "",
    notes: "",
    archived: false,
    createdAt: new Date().toISOString(),
  });

  const shAhmed = mkShare(ahmed, 2, 6, 0);
  const shMohammed = mkShare(mohammedK, 3, 8, 1);
  const shAli = mkShare(ali, 1.5, 4, 2);
  const shMohA1 = mkShare(mohammedA1, 0.5, 2, 3);
  state.shareholders.push(shAhmed, shMohammed, shAli, shMohA1);

  // حالة 2 و3: أحمد أجّر سهمه لمحمد كريم لمدة سنة
  state.rights.push({
    id: uid("rt"),
    pumpId,
    shareholderId: shAhmed.id,
    fromPersonId: ahmed.id,
    holderPersonId: mohammedK.id,
    kind: "rent",
    hoursMin: shAhmed.baseHoursMin,
    amount: 50000,
    agreement: "تأجير سنة كاملة",
    startedAt: addDaysISO(today, -30),
    endedAt: addDaysISO(today, 335),
    toPumpId: null,
    status: "active",
    notes: "أحمد = المساهم الأساسي، محمد = صاحب الحق الحالي",
    parentId: null,
    createdAt: new Date().toISOString(),
    createdBy: "manager",
  });

  // حالة استخدام السهم: أحمد مؤاجر (المستأجر محمد كريم) — المساهم الأساسي يبقى ثابتًا
  shAhmed.useStatus = "rented";
  shAhmed.counterpartPersonId = mohammedK.id;
  shAhmed.counterpartPhone = mohammedK.phone;
  shAhmed.useStatusAt = addDaysISO(today, -30);
  shAhmed.useStatusNote = "مؤاجر لمحمد كريم لمدة سنة";

  // يوم أمس: مُغلق مع استخدام فعلي
  const mkDay = (date: string, number: number, status: DialaDay["status"]): DialaDay => ({
    id: uid("day"),
    pumpId,
    dialaNumber: number,
    date,
    status,
    workStart: "06:00",
    workEnd: "02:00",
    capacityMin: 20 * 60,
    plannedWorkStart: "06:00",
    plannedWorkEnd: "02:00",
    plannedCapacityMin: 20 * 60,
    notes: "",
    openedBy: "manager",
    closedBy: status === "closed" ? "manager" : "",
    closedAt: status === "closed" ? new Date().toISOString() : "",
    reopenedBy: "",
    reopenedAt: "",
    reopenReason: "",
    revision: 0,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    archived: false,
  });

  // كل يوم فعلي داخل ديالة — الديالة أم أيام المساهمة
  const demoRound: DialaRound = {
    id: uid("rnd"),
    pumpId,
    number: 41,
    startDate: yesterday,
    days: 2,
    endDate: today,
    locked: true,
    lockedAt: new Date().toISOString(),
    lockedBy: "manager",
    notes: "ديالة تدور كل يومين — محفوظة فلا تُحذف أيامها بسهولة",
    createdAt: new Date().toISOString(),
    createdBy: "manager",
    archived: false,
  };
  state.rounds.push(demoRound);

  const dayYes = mkDay(yesterday, 41, "closed");
  const dayToday = mkDay(today, 41, "draft");
  dayYes.roundId = demoRound.id;
  dayToday.roundId = demoRound.id;
  state.days.push(dayYes, dayToday);
  state.counters.diala = 42;
  state.counters.round = 42;

  const plan = (
    day: DialaDay,
    rows: { holder: Person; shareholder: Shareholder; hours: number; actual?: Person; role?: DayEntry["role"] }[],
    startOffsetMin = 0
  ) => {
    let cursor = timeToMinutes(day.workStart) + startOffsetMin;
    rows.forEach((row, i) => {
      const start = cursor;
      const end = cursor + row.hours * 60;
      cursor = end;
      const entry: DayEntry = {
        id: uid("en"),
        dayId: day.id,
        pumpId,
        orderIndex: i,
        personId: row.holder.id,
        role: row.role ?? (row.shareholder.personId === row.holder.id ? "shareholder" : "tenant"),
        shareholderId: row.shareholder.id,
        rightId: null,
        startTime: minutesToTime(start),
        endTime: minutesToTime(end),
        plannedMin: row.hours * 60,
        actualPersonId: row.actual?.id ?? null,
        usageId: null,
        status: "planned",
        postponeToDayId: null,
        reason: "",
        notes: "",
        createdAt: new Date().toISOString(),
        createdBy: "manager",
        archived: false,
      };
      state.entries.push(entry);
    });
  };

  // أمس: محمد (صاحب حق سهم أحمد) 6 ساعات، محمد كريم 8 ساعات، وخالد أخذ سهم علي (شخص ثالث)
  plan(dayYes, [
    { holder: mohammedK, shareholder: shAhmed, hours: 6, role: "tenant" },
    { holder: mohammedK, shareholder: shMohammed, hours: 8 },
    { holder: ali, shareholder: shAli, hours: 4, actual: khaled, role: "shareholder" },
  ]);

  const yesEntries = state.entries.filter((e) => e.dayId === dayYes.id);
  let cursor = timeToMinutes(dayYes.workStart);
  for (const entry of yesEntries) {
    const start = minutesToTime(cursor);
    const end = minutesToTime(cursor + entry.plannedMin);
    cursor += entry.plannedMin;
    entry.status = "done";
    const draft = computeUsageDraft(state.pump!, dayYes, start, end);
    const personId = entry.actualPersonId ?? entry.personId;
    const usage: ActualUsage = {
      id: uid("us"),
      pumpId,
      dayId: dayYes.id,
      entryId: entry.id,
      personId,
      rightHolderId: entry.personId,
      shareholderId: entry.shareholderId,
      date: dayYes.date,
      startTime: start,
      endTime: end,
      minutes: draft.minutes,
      crossesMidnight: draft.crossesMidnight,
      usageType: entry.actualPersonId ? "loan" : "share",
      fuelPerHourSnapshot: draft.fuelPerHourSnapshot,
      fuelLiters: draft.fuelLiters,
      fuelPriceSnapshot: draft.fuelPriceSnapshot,
      personalFuelPriceSnapshot: 0,
      fuelCost: draft.fuelAmountDue,
      fuelAmountDue: draft.fuelAmountDue,
      royaltyHourlySnapshot: draft.royaltyHourlySnapshot,
      royaltyAmountDue: draft.royaltyAmountDue,
      stoppageMin: 0,
      dieselSettlement: entry.actualPersonId ? "unpaid" : "paid",
      dieselShortageLiters: 0,
      royaltyPayMode: entry.actualPersonId ? "credit" : "cash",
      settlementNote: entry.actualPersonId
        ? "ديزل غير مسدد — استحقاق على المستخدم الفعلي"
        : "سدّد الديزل والرواسة نقدًا",
      overCapacity: false,
      overCapacityReason: "",
      overCapacityMin: 0,
      notes: entry.actualPersonId ? "أخذ الساعات من صاحب الدور" : "",
      source: "manager",
      status: "active",
      createdAt: new Date().toISOString(),
      createdBy: "manager",
      updatedAt: new Date().toISOString(),
    };
    state.usages.push(usage);
    entry.usageId = usage.id;
    // استحقاقات
    state.transactions.push(
      tx(pumpId, personId, entry.shareholderId, dayYes.id, usage.id, "fuel", "debit", usage.fuelAmountDue, dayYes.date, "استحقاق ديزل"),
      tx(pumpId, personId, entry.shareholderId, dayYes.id, usage.id, "royalty", "debit", usage.royaltyAmountDue, dayYes.date, "استحقاق رواسة")
    );
  }

  // اليوم: مسودة من الجدول (مع إتاحة التعديل الكامل)
  plan(dayToday, [
    { holder: mohammedK, shareholder: shAhmed, hours: 6, role: "tenant" },
    { holder: mohammedK, shareholder: shMohammed, hours: 8 },
    { holder: ali, shareholder: shAli, hours: 4 },
    { holder: mohammedA1, shareholder: shMohA1, hours: 2 },
  ]);

  // توقف أمس بسبب نقص الديزل
  state.stoppages.push({
    id: uid("st"),
    pumpId,
    dayId: dayYes.id,
    date: dayYes.date,
    startTime: "14:00",
    endTime: "16:00",
    minutes: 120,
    kind: "fuel_shortage",
    reason: "نقص الديزل",
    notes: "توقف مؤقت حتى وصول الديزل",
    createdAt: new Date().toISOString(),
    createdBy: "manager",
    archived: false,
  });

  state.fuelRecords.push({
    id: uid("fr"),
    pumpId,
    dayId: dayYes.id,
    date: dayYes.date,
    hoursRun: 18,
    litersPerHour: 6,
    liters: 108,
    shortageLiters: 12,
    fuelPrice: 1200,
    notes: "ديزل عادي",
    createdAt: new Date().toISOString(),
    createdBy: "manager",
    archived: false,
  });

  state.operatorRecords.push({
    id: uid("op"),
    pumpId,
    dayId: dayYes.id,
    date: dayYes.date,
    attendantPersonId: null,
    operatorName: "سالم الرواس",
    ratePerHourSnapshot: 1500,
    paidAmount: 0,
    remainingAmount: 24000,
    status: "open",
    hourlyWage: 1500,
    startTime: "06:00",
    endTime: "22:00",
    minutes: 16 * 60,
    dueAmount: 24000,
    notes: "",
    createdAt: new Date().toISOString(),
    createdBy: "manager",
    archived: false,
  });

  // دفعة جزئية من محمد كريم
  state.transactions.push(
    tx(pumpId, mohammedK.id, shMohammed.id, dayYes.id, null, "payment", "credit", 60000, yesterday, "دفعة نقدية")
  );

  // السجل الشخصي لخالد: 5 ساعات بينما السجل الرسمي 4 ساعات (حالة 13)
  state.personalRecords.push({
    id: uid("pr"),
    personId: khaled.id,
    pumpId,
    dayId: dayYes.id,
    date: yesterday,
    startTime: "18:00",
    endTime: "23:00",
    minutes: 300,
    dieselLiters: 30,
    dieselPricePerLiter: 1200,
    dieselAmount: 36000,
    royaltyAmount: 2500,
    paidAmount: 20000,
    debtAmount: 18500,
    operationType: "usage",
    notes: "أخذت 5 ساعات فعلًا",
    matchStatus: "different",
    createdAt: new Date().toISOString(),
  });

  /* دين مستقل + دفعتان مستقلتان لنفس الدين (§12, §13) */
  const demoDebt: Debt = {
    id: uid("dt"),
    pumpId,
    debtorId: khaled.id,
    amount: 36000,
    paidAmount: 20000,
    remainingAmount: 16000,
    reason: "قيمة ديزل غير مسددة — 30 لتر",
    linkedOperationId: null,
    linkedOperationType: "usage",
    date: yesterday,
    status: "partially_paid",
    notes: "أُسجّل كدين مستقل عن الاستخدام",
    createdAt: new Date().toISOString(),
    createdBy: "manager",
    updatedAt: new Date().toISOString(),
  };
  state.debts.push(demoDebt);

  state.payments.push(
    {
      id: uid("pay"),
      pumpId,
      personId: khaled.id,
      amount: 12000,
      date: yesterday,
      type: "debt",
      method: "cash",
      reason: "دفعة أولى على دين الديزل",
      linkedOperationId: demoDebt.id,
      linkedOperationType: "debt",
      transactionId: null,
      notes: "",
      status: "posted",
      createdAt: new Date().toISOString(),
      createdBy: "manager",
    },
    {
      id: uid("pay"),
      pumpId,
      personId: khaled.id,
      amount: 8000,
      date: today,
      type: "debt",
      method: "transfer",
      reason: "دفعة ثانية على نفس الدين",
      linkedOperationId: demoDebt.id,
      linkedOperationType: "debt",
      transactionId: null,
      notes: "الدفعتان مستقلتان ولا تُستبدل الأولى",
      status: "posted",
      createdAt: new Date().toISOString(),
      createdBy: "manager",
    }
  );

  /* سلفة ساعات: خالد أخذ 3 ساعات من دور علي — عملية مستقلة لا تعديل حقول (§14) */
  const demoTransfer: TransferEvent = {
    id: uid("tr"),
    pumpId,
    type: "loan",
    shareId: shAli.id,
    fromPersonId: ali.id,
    toPersonId: khaled.id,
    minutes: 180,
    date: yesterday,
    amount: 0,
    reason: "سلفة 3 ساعات",
    status: "active",
    notes: "المعير: علي — المستعير: خالد — والمستخدم الفعلي هو خالد",
    transactionId: null,
    createdAt: new Date().toISOString(),
    createdBy: "manager",
  };
  state.transferEvents.push(demoTransfer);

  /* تعارض محفوظ: رسمي ساعتان? لا — هنا رسمي 4 ساعات وشخصي 5 ساعات (§18) */
  state.conflicts.push({
    id: uid("cf"),
    pumpId,
    type: "official_personal",
    key: `${khaled.id}|${yesterday}|minutes`,
    dayId: dayYes.id,
    personId: khaled.id,
    officialRecordId: null,
    personalRecordId: state.personalRecords[state.personalRecords.length - 1]?.id ?? null,
    officialValue: "4 ساعات",
    personalValue: "5 ساعات",
    difference: "ساعة واحدة",
    differenceValue: -60,
    unit: "minutes",
    status: "open",
    createdAt: new Date().toISOString(),
    resolvedAt: "",
    resolvedBy: "",
    resolution: "",
    notes: "النظام عرض الاختلاف ولم يعدّل أي سجل",
  });

  state.notifications.push(
    {
      id: uid("nt"),
      at: new Date().toISOString(),
      kind: "difference",
      level: "warn",
      title: "اختلاف في الساعات",
      body: `في يوم ${isoToShort(yesterday)}: السجل الرسمي 4 ساعات والسجل الشخصي 5 ساعات (خالد أحمد).`,
      personId: khaled.id,
      dayId: dayYes.id,
      read: false,
    },
    {
      id: uid("nt"),
      at: new Date().toISOString(),
      kind: "stoppage",
      level: "warn",
      title: "توقف المضخة",
      body: `توقف بسبب نقص الديزل لمدة ساعتين يوم ${isoToShort(yesterday)}.`,
      personId: null,
      dayId: dayYes.id,
      read: false,
    },
    {
      id: uid("nt"),
      at: new Date().toISOString(),
      kind: "debt",
      level: "danger",
      title: "مبالغ غير مسددة",
      body: "يوجد مساهمون عليهم مبالغ غير مسددة — راجع قسم المالية.",
      personId: null,
      dayId: null,
      read: false,
    }
  );

  state.auditLogs.push({
    id: uid("lg"),
    at: new Date().toISOString(),
    actor: "manager",
    actorRole: "manager",
    action: "seed",
    entity: "state",
    entityId: "demo",
    summary: "تم تحميل بيانات تجريبية للاستعراض",
    before: "",
    after: "",
    reason: "استعراض",
    deviceId: state.settings.deviceId,
    synced: true,
  });

  return state;
}

export function tx(
  pumpId: string,
  personId: string | null,
  shareholderId: string | null,
  dayId: string | null,
  usageId: string | null,
  kind: Transaction["kind"],
  direction: Transaction["direction"],
  amount: number,
  date: string,
  reason: string
): Transaction {
  return {
    id: uid("tx"),
    pumpId,
    kind,
    direction,
    personId,
    shareholderId,
    dayId,
    usageId,
    operatorRecordId: null,
    fuelRecordId: null,
    amount,
    date,
    reason,
    status: "posted",
    correctsTxId: null,
    notes: "",
    source: "manager",
    createdAt: new Date().toISOString(),
    createdBy: "manager",
  };
}
