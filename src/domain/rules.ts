/**
 * طبقة الحساب والقواعد — مصدر واحد لكل حساب في النظام.
 * لا تُكرَّر أي معادلة داخل الواجهات؛ كل الصفحات تستدعي من هنا.
 */
import type {
  ActualUsage,
  AppState,
  BaseRosterMember,
  Conflict,
  ConflictKind,
  ConflictStatus,
  DayEntry,
  DayIssueSeverity,
  Debt,
  DebtStatus,
  DialaDay,
  DialaRound,
  DieselSettlement,
  EntryRole,
  Payment,
  PaymentMethod,
  PaymentType,
  Person,
  Pump,
  RightKind,
  RoyaltyPayMode,
  Shareholder,
  ShareholderUseStatus,
  ShareRight,
  Transaction,
  TransferEvent,
  TransferType,
  TxDirection,
  TxKind,
  UsageType,
} from "./types";
import { uid } from "./util";
export type { DayIssueSeverity };

import {
  addDaysISO,
  clamp,
  durationMin,
  isOvernight,
  isoToShort,
  minutesToTime,
  nowTime,
  rawDurationMin,
  rangesOverlap,
  timeInterval,
  timeToMinutes,
  toHours,
  todayISO,
} from "./util";

/* ------------------------------- استعلامات ------------------------------ */

export function findPerson(state: AppState, id: string | null): Person | null {
  if (!id) return null;
  return state.persons.find((p) => p.id === id) ?? null;
}

export function personName(state: AppState, id: string | null): string {
  const p = findPerson(state, id);
  if (p) return p.name;
  return "—";
}

export function findShareholder(state: AppState, id: string | null): Shareholder | null {
  if (!id) return null;
  return state.shareholders.find((s) => s.id === id) ?? null;
}

export function activeShareholders(state: AppState, pumpId: string): Shareholder[] {
  return state.shareholders
    .filter((s) => s.pumpId === pumpId && !s.archived && s.status !== "ended")
    .sort((a, b) => a.baseOrder - b.baseOrder);
}

export function totalUnits(state: AppState, pumpId: string): number {
  return activeShareholders(state, pumpId).reduce((s, sh) => s + (sh.units || 0), 0);
}

export function shareholderOfPerson(
  state: AppState,
  pumpId: string,
  personId: string
): Shareholder | null {
  return (
    state.shareholders.find(
      (s) => s.pumpId === pumpId && s.personId === personId && !s.archived
    ) ?? null
  );
}

export function isShareholder(state: AppState, pumpId: string, personId: string): boolean {
  return !!shareholderOfPerson(state, pumpId, personId);
}

export function rightsOfShareholder(state: AppState, shareholderId: string): ShareRight[] {
  return state.rights
    .filter((r) => r.shareholderId === shareholderId)
    .sort((a, b) => (a.startedAt < b.startedAt ? -1 : 1));
}

/** السلسلة الكاملة للحق — لا يُحفظ اسم صاحب الحق فقط */
export function rightChain(state: AppState, shareholderId: string): ShareRight[] {
  return rightsOfShareholder(state, shareholderId);
}

export function currentRight(
  state: AppState,
  shareholderId: string,
  date = todayISO()
): ShareRight | null {
  const list = rightsOfShareholder(state, shareholderId).filter((r) => r.status === "active");
  const applicable = list.filter(
    (r) => r.startedAt <= date && (!r.endedAt || r.endedAt >= date)
  );
  if (applicable.length === 0) return null;
  return applicable[applicable.length - 1];
}

/** صاحب الحق الحالي للمساهم (أو المساهم نفسه إن لم يوجد حق) */
export function rightHolderId(state: AppState, sh: Shareholder, date = todayISO()): string {
  const right = currentRight(state, sh.id, date);
  return right ? right.holderPersonId : sh.personId;
}

export function personPumpRelations(
  state: AppState,
  pumpId: string,
  personId: string
): { label: string; tone: "green" | "amber" | "blue" | "gray" }[] {
  const tags: { label: string; tone: "green" | "amber" | "blue" | "gray" }[] = [];
  const sh = shareholderOfPerson(state, pumpId, personId);
  if (sh) tags.push({ label: "مساهم أساسي", tone: "green" });
  const rights = state.rights.filter(
    (r) => r.pumpId === pumpId && r.holderPersonId === personId
  );
  if (rights.some((r) => r.status === "active" && r.kind === "rent"))
    tags.push({ label: "مستأجر حالي", tone: "amber" });
  else if (rights.some((r) => r.status === "active"))
    tags.push({ label: "صاحب حق حالي", tone: "blue" });
  if (rights.some((r) => r.status === "ended"))
    tags.push({ label: "حق منتهٍ", tone: "gray" });
  const usages = state.usages.filter((u) => u.pumpId === pumpId && u.personId === personId);
  if (usages.length > 0) tags.push({ label: "مستخدم سابق", tone: "gray" });
  return tags;
}

export function hasPendingRightPlan(state: AppState, personId: string, pumpId: string): boolean {
  return state.rights.some(
    (r) => r.holderPersonId === personId && r.pumpId === pumpId && r.status === "active"
  );
}

/* --------------------------------- الأيام ------------------------------- */

export function pumpWindow(
  pump: Pump,
  day?: DialaDay | null
): { start: string; end: string; capacityMin: number } {
  const start = day?.workStart || pump.workStart || "06:00";
  const end = day?.workEnd || pump.workEnd || "18:00";
  return { start, end, capacityMin: durationMin(start, end) };
}

export function dayEntries(state: AppState, dayId: string): DayEntry[] {
  return state.entries
    .filter((e) => e.dayId === dayId && !e.archived)
    .sort((a, b) => a.orderIndex - b.orderIndex);
}

export function sortedDays(state: AppState): DialaDay[] {
  return state.days
    .filter((d) => !d.archived)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.dialaNumber - a.dialaNumber));
}

export function dayByDate(state: AppState, date: string): DialaDay | null {
  return (
    state.days.find((d) => !d.archived && d.date === date) ??
    null
  );
}

export function currentDialaDay(state: AppState): DialaDay | null {
  const today = todayISO();
  const exact = dayByDate(state, today);
  if (exact) return exact;
  const past = sortedDays(state).filter((d) => d.date < today);
  return past[0] ?? null;
}

export function nextDialaDay(state: AppState): DialaDay | null {
  const today = todayISO();
  const future = sortedDays(state)
    .filter((d) => d.date > today)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  return future[0] ?? null;
}

/* ------------------------------- الديالات ------------------------------- */

/** تاريخ نهاية الديالة = يوم البداية + (عدد الأيام − 1) */
export function roundEndDate(startDate: string, days: number): string {
  const count = clamp(Math.floor(days || 1), 1, 400);
  return addDaysISO(startDate, count - 1);
}

/** كل تواريخ الديالة من تاريخ البداية وعدد الأيام */
export function roundDates(startDate: string, days: number): string[] {
  const count = clamp(Math.floor(days || 1), 1, 400);
  return isoRangeDays(startDate, addDaysISO(startDate, count - 1));
}

/** الديالات المسجّلة — الأحدث بدايةً أولًا */
export function dialaRounds(state: AppState, includeArchived = false): DialaRound[] {
  return state.rounds
    .filter((r) => includeArchived || !r.archived)
    .slice()
    .sort((a, b) =>
      a.startDate < b.startDate ? 1 : a.startDate > b.startDate ? -1 : b.number - a.number
    );
}

export function findRound(state: AppState, id?: string | null): DialaRound | null {
  if (!id) return null;
  return state.rounds.find((r) => r.id === id) ?? null;
}

/** أيام الديالة مرتّبة من اليوم الأول إلى الأخير */
export function roundDays(state: AppState, roundId: string, includeArchived = false): DialaDay[] {
  return state.days
    .filter((d) => d.roundId === roundId && (includeArchived || !d.archived))
    .slice()
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.dialaNumber - b.dialaNumber));
}

/** وصف اليوم: «ديالة 1 · اليوم الثالث» — لا يوجد يوم خارج الديالة */
export function dialaDayLabel(state: AppState, day: DialaDay): string {
  const round = roundOfDay(state, day);
  const n = dayNumberInRound(state, day);
  return round ? `ديالة ${round.number} · اليوم ${dayOrdinal(n)}` : `اليوم ${dayOrdinal(n)} للديالة ${day.dialaNumber}`;
}

/** اسم اليوم بصيغة كاملة: «اليوم الثالث للديالة 2» */
export function dialaDayTitle(state: AppState, day: DialaDay): string {
  const round = roundOfDay(state, day);
  const n = dayNumberInRound(state, day);
  return `اليوم ${dayOrdinal(n)} للديالة ${round ? round.number : day.dialaNumber}`;
}

/** الأرقام الترتيبية العربية لأيام الديالة */
const ORDINALS = [
  "الأول",
  "الثاني",
  "الثالث",
  "الرابع",
  "الخامس",
  "السادس",
  "السابع",
  "الثامن",
  "التاسع",
  "العاشر",
  "الحادي عشر",
  "الثاني عشر",
];

export function dayOrdinal(n: number): string {
  const i = Math.round(n);
  if (i >= 1 && i <= ORDINALS.length) return ORDINALS[i - 1];
  return `${i}`;
}

/** الديالة التي يقع تاريخها داخل مدتها — كل يوم فعلي تنتمي إلى ديالة */
export function roundForDate(state: AppState, date: string): DialaRound | null {
  const rounds = state.rounds
    .filter((r) => !r.archived)
    .slice()
    .sort((a, b) => (a.startDate < b.startDate ? 1 : a.startDate > b.startDate ? -1 : b.number - a.number));
  return rounds.find((r) => r.startDate <= date && date <= r.endDate) ?? null;
}

/** الديالة التي ينتمي إليها اليوم (بالمعرّف أو بالتاريخ) */
export function roundOfDay(state: AppState, day: DialaDay): DialaRound | null {
  return findRound(state, day.roundId) ?? roundForDate(state, day.date);
}

/** رقم اليوم داخل الديالة (الأول، الثاني، …) */
export function dayNumberInRound(state: AppState, day: DialaDay): number {
  const round = roundOfDay(state, day);
  if (!round) return 1;
  const index = roundDates(round.startDate, round.days).indexOf(day.date);
  if (index >= 0) return index + 1;
  const days = roundDays(state, round.id, true)
    .slice()
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  const i = days.findIndex((d) => d.id === day.id);
  return i >= 0 ? i + 1 : 1;
}

/** عدد أيام الديالة المقترح للديالة الجديدة (نفس مدة آخر ديالة) */
export function suggestRoundDays(state: AppState): number {
  const rounds = dialaRounds(state);
  return rounds[0]?.days && rounds[0].days > 0 ? Math.min(rounds[0].days, 400) : 7;
}

export function entryMinutes(entry: DayEntry): number {
  if (entry.plannedMin > 0 && !entry.startTime && !entry.endTime) return entry.plannedMin;
  if (!entry.startTime || !entry.endTime) return entry.plannedMin || 0;
  return durationMin(entry.startTime, entry.endTime);
}

/** الجدول الأساسي — مرجعي فقط، لا يتغير بتغير اليوم الفعلي */
export interface ScheduleRow {
  shareholder: Shareholder;
  person: Person | null;
  holderId: string;
  holderName: string;
  units: number;
  baseHoursMin: number;
  derivedHoursMin: number;
  order: number;
}

export function scheduleRows(state: AppState, pump: Pump): ScheduleRow[] {
  const list = activeShareholders(state, pump.id);
  const units = totalUnits(state, pump.id);
  const capacity = pumpWindow(pump).capacityMin;
  return list.map((s) => {
    const person = findPerson(state, s.personId);
    const holderId = rightHolderId(state, s);
    const derived =
      s.baseHoursMin > 0
        ? s.baseHoursMin
        : units > 0
          ? Math.round(capacity * (s.units / units))
          : 0;
    return {
      shareholder: s,
      person,
      holderId,
      holderName: personName(state, holderId),
      units: s.units,
      baseHoursMin: derived,
      derivedHoursMin: derived,
      order: s.baseOrder,
    };
  });
}

/** بناء صفوف اليوم من الجدول الأساسي (نقطة بداية قابلة للتعديل بالكامل) */
export function planEntriesFromSchedule(
  state: AppState,
  pump: Pump,
  workStart: string,
  workEnd: string
): Omit<DayEntry, "dayId">[] {
  const rows = scheduleRows(state, pump);
  const window = durationMin(workStart, workEnd);
  const units = rows.reduce((s, r) => s + r.units, 0) || 1;
  const base = timeToMinutes(workStart);
  let cursor = 0;
  return rows.map((row, i) => {
    const share = row.baseHoursMin > 0 ? row.baseHoursMin : Math.round(window * (row.units / units));
    const start = base + cursor;
    const end = base + cursor + share;
    cursor += share;
    const right = currentRight(state, row.shareholder.id);
    return {
      id: uid("en"),
      pumpId: pump.id,
      orderIndex: i,
      personId: row.holderId,
      role: right
        ? right.kind === "rent"
          ? "tenant"
          : "right_holder"
        : "shareholder",
      shareholderId: row.shareholder.id,
      rightId: right?.id ?? null,
      startTime: minutesToTime(start),
      endTime: minutesToTime(end),
      plannedMin: share,
      actualPersonId: null,
      usageId: null,
      status: "planned",
      postponeToDayId: null,
      reason: "",
      notes: "",
      createdAt: new Date().toISOString(),
      createdBy: "manager",
      archived: false,
    };
  });
}

/* ------------- كشف الدوام الأساسي (كشف واحد لكل ديالة، يُثبَّت) ------------- */

export interface BaseRosterRow {
  member: BaseRosterMember;
  personId: string;
  person: Person | null;
  name: string;
  phone: string;
  /** نصيبه في الدور بالدقائق */
  shareMin: number;
  order: number;
  role: EntryRole;
  /** مساهم في المضخة (يُعرض كمرجع فقط — لا يشترط أن يكون) */
  isShareholder: boolean;
  /** وقت بدايته/نهايته المتوقّعة بالتسلسل من بداية التشغيل */
  startTime: string;
  endTime: string;
}

/**
 * أسطر كشف الدوام الأساسي لديالة واحدة — مرتّبة.
 * القاعدة: الكشف واحد للديالة كلها (كل أيامها)، وترتيبه ونصيبه يُثبَّتان ويُورَّثان.
 */
export function baseRosterRows(state: AppState, roundId: string | null): BaseRosterRow[] {
  if (!roundId) return [];
  const rows = (state.roster ?? [])
    .filter((r) => r.roundId === roundId && !r.archived)
    .slice()
    .sort((a, b) => a.order - b.order || (a.createdAt < b.createdAt ? -1 : 1));
  return rows.map((member) => {
    const person = findPerson(state, member.personId);
    return {
      member,
      personId: member.personId,
      person,
      name: person?.name ?? "—",
      phone: person?.phone ?? "",
      shareMin: member.shareMin ?? 0,
      order: member.order ?? 0,
      role: member.role ?? "shareholder",
      isShareholder: !!person && isShareholder(state, member.pumpId, member.personId),
      startTime: "",
      endTime: "",
    };
  });
}

/** ساعات تشغيل الدوام الأساسي للمضخة (نافذة التشغيل) */
export function baseRosterCapacityMin(pump: Pump): number {
  return pumpWindow(pump).capacityMin;
}

/** مجموع نصبب كشف الديالة بالدقائق */
export function baseRosterTotalMin(state: AppState, roundId: string | null): number {
  return baseRosterRows(state, roundId).reduce((sum, r) => sum + (r.shareMin || 0), 0);
}

/** المتبقي من ساعات التشغيل بعد الكشف (لا يقل عن صفر) */
export function baseRosterRemainingMin(state: AppState, pump: Pump, roundId: string | null): number {
  return Math.max(0, baseRosterCapacityMin(pump) - baseRosterTotalMin(state, roundId));
}

/** هل تتّسع ساعات التشغيل لنصيب إضافي؟ (بوابة المنع التام) */
export function baseRosterFits(
  state: AppState,
  pump: Pump,
  roundId: string | null,
  extraMin: number,
  ignoreId?: string
): boolean {
  const used = baseRosterRows(state, roundId)
    .filter((r) => r.member.id !== ignoreId)
    .reduce((sum, r) => sum + (r.shareMin || 0), 0);
  return used + Math.max(0, extraMin) <= baseRosterCapacityMin(pump);
}

/**
 * نصيب مقترح تلقائيًا من سهم الشخص في المضخة:
 * سهمه ÷ مجموع الأسهم × ساعات التشغيل (أو ساعاته الأساسية المسجّلة إن وُجدت).
 * ومن لا سهم له → صفر ليُملأ يدويًا.
 */
export function suggestShareMin(state: AppState, pump: Pump, personId: string): number {
  const rows = scheduleRows(state, pump);
  const own = rows.find((r) => r.person?.id === personId || r.holderId === personId);
  if (own) return own.derivedHoursMin || own.baseHoursMin || 0;
  const linked = rows.find((r) => r.shareholder?.personId === personId);
  if (linked) return linked.derivedHoursMin || linked.baseHoursMin || 0;
  return 0;
}

/** وقت كل سطر متوقَّعًا بالتسلسل من بداية التشغيل — للعرض فقط */
export function baseRosterTimeline(
  state: AppState,
  pump: Pump,
  roundId: string | null
): BaseRosterRow[] {
  const base = timeToMinutes(pump.workStart);
  let cursor = 0;
  return baseRosterRows(state, roundId).map((row) => {
    const start = base + cursor;
    cursor += row.shareMin || 0;
    return { ...row, startTime: minutesToTime(start), endTime: minutesToTime(start + (row.shareMin || 0)) };
  });
}

/**
 * بناء صفوف **الدوام الفعلي** لليوم من كشف ديالته: بالتسلسل من بداية تشغيل اليوم
 * وبمدة نصيب كل شخص. كشف فارغ ⇒ لا صفوف تُبنى.
 */
export function planEntriesFromBaseRoster(
  state: AppState,
  pump: Pump,
  day: DialaDay
): Omit<DayEntry, "dayId">[] {
  const base = timeToMinutes(day.workStart);
  let cursor = 0;
  return baseRosterRows(state, day.roundId ?? null).map((row, index) => {
    const share = row.shareMin > 0 ? row.shareMin : 0;
    const shareholder = shareholderOfPerson(state, pump.id, row.personId);
    const right = shareholder ? currentRight(state, shareholder.id) : null;
    const start = base + cursor;
    cursor += share;
    return {
      id: uid("en"),
      pumpId: pump.id,
      orderIndex: index,
      personId: row.personId,
      role: right
        ? right.kind === "rent"
          ? "tenant"
          : "right_holder"
        : shareholder
          ? "shareholder"
          : row.role ?? "guest",
      shareholderId: shareholder?.id ?? null,
      rightId: right?.id ?? null,
      startTime: minutesToTime(start),
      endTime: minutesToTime(start + share),
      plannedMin: share,
      actualPersonId: null,
      usageId: null,
      status: "planned",
      postponeToDayId: null,
      reason: "",
      notes: "",
      createdAt: new Date().toISOString(),
      createdBy: "manager",
      archived: false,
    };
  });
}

/** هل هذا الشخص في كشف ديالة هذا اليوم؟ */
export function isBaseRosterPerson(
  state: AppState,
  roundId: string | null,
  personId: string
): boolean {
  if (!roundId) return false;
  return (state.roster ?? []).some(
    (r) => r.roundId === roundId && r.personId === personId && !r.archived
  );
}

/** ملخص يوم داخل الديالة: عدد أساسيي الكشف ومجموع نصيبهم (الكشف واحد لكل الأيام) */
export interface RosterDaySummary {
  day: DialaDay;
  dayNumber: number;
  membersCount: number;
  totalMin: number;
  names: string[];
}

export function rosterDaySummaries(state: AppState, roundId: string): RosterDaySummary[] {
  const rows = baseRosterRows(state, roundId);
  const totalMin = rows.reduce((sum, r) => sum + (r.shareMin || 0), 0);
  return roundDays(state, roundId, true)
    .slice()
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .map((day) => ({
      day,
      dayNumber: dayNumberInRound(state, day),
      membersCount: rows.length,
      totalMin,
      names: rows.map((r) => r.name),
    }));
}

/**
 * تداول الديالة: لكل شخص في الكشف نصيبه، وأي أيام ظهر فيها في **الدوام الفعلي**،
 * ومجموع ما سُجّل له فعليًا مقابل نصيبه — عرض ومقارنة فقط، بلا منع.
 */
export interface RosterPersonSummary {
  personId: string;
  name: string;
  baseMin: number;
  dayNumbers: number[];
  actualTotalMin: number;
  diffMin: number;
}

export function rosterPersonSummaries(state: AppState, round: DialaRound): RosterPersonSummary[] {
  const rows = baseRosterRows(state, round.id);
  const days = roundDays(state, round.id, true);
  return rows
    .map((row) => {
      const dayNumbers: number[] = [];
      let actualTotalMin = 0;
      for (const day of days) {
        const own = state.entries.filter(
          (e) => e.dayId === day.id && e.personId === row.personId && !e.archived
        );
        if (own.length === 0) continue;
        dayNumbers.push(dayNumberInRound(state, day));
        actualTotalMin += own.reduce((s, e) => s + entryMinutes(e), 0);
      }
      return {
        personId: row.personId,
        name: row.name,
        baseMin: row.shareMin,
        dayNumbers: dayNumbers.slice().sort((a, b) => a - b),
        actualTotalMin,
        diffMin: actualTotalMin - row.shareMin,
      };
    })
    .sort((a, b) => b.baseMin - a.baseMin);
}

/* -------------------------- الاقتراحات والبحث (§11) -------------------- */

export interface Suggestion {
  person: Person;
  tier: 1 | 2 | 3 | 4 | 5;
  tags: string[];
  lastSeen: string;
}

const TIER_LABEL: Record<number, string> = {
  1: "مساهم أساسي في المضخة",
  2: "صاحب حق حالي",
  3: "استخدم المضخة سابقًا",
  4: "مرتبط بالسهم",
  5: "شخص مسجّل",
};

export function tierLabel(tier: number): string {
  return TIER_LABEL[tier] ?? "";
}

/**
 * ترتيب الاقتراحات (§20): مساهمو نفس المضخة ← أصحاب الحق الحاليين ←
 * من استخدم المضخة سابقًا ← المرتبطون بالسهم ← البحث العام.
 * ظهور الشخص هنا لا ينشئ سهمًا ولا حقًا ولا دينًا (§20).
 */
export function suggestPeople(
  state: AppState,
  pumpId: string,
  query: string,
  limit = 40
): Suggestion[] {
  const q = query.trim();
  const today = todayISO();
  const map = new Map<string, Suggestion>();

  const push = (person: Person, tier: 1 | 2 | 3 | 4 | 5, tag: string, lastSeen: string) => {
    const existing = map.get(person.id);
    if (existing) {
      if (!existing.tags.includes(tag)) existing.tags.push(tag);
      if (tier < existing.tier) existing.tier = tier;
      if (lastSeen > existing.lastSeen) existing.lastSeen = lastSeen;
      return;
    }
    map.set(person.id, { person, tier, tags: [tag], lastSeen });
  };

  // 1) المساهمون الأساسيون في نفس المضخة
  for (const sh of activeShareholders(state, pumpId)) {
    const p = findPerson(state, sh.personId);
    if (p) push(p, 1, "مساهم أساسي", sh.startDate || "");
  }

  // 2) أصحاب الحقوق الحاليون (سجل الحقوق هو المصدر)
  for (const r of state.rights.filter((r) => r.pumpId === pumpId && r.status === "active")) {
    if (r.endedAt && r.endedAt < today) continue;
    const p = findPerson(state, r.holderPersonId);
    if (!p) continue;
    push(p, 2, r.kind === "rent" ? "مستأجر حالي" : "صاحب حق حالي", r.startedAt || "");
  }

  // 3) من استخدم المضخة سابقًا
  for (const u of state.usages.filter((u) => u.pumpId === pumpId)) {
    const p = findPerson(state, u.personId);
    if (p) push(p, 3, "مستخدم سابق", u.date || "");
  }
  const pumpDays = new Set(state.days.filter((d) => d.pumpId === pumpId).map((d) => d.id));
  for (const e of state.entries) {
    if (!pumpDays.has(e.dayId)) continue;
    const p = findPerson(state, e.personId);
    if (p) push(p, 3, "سُجّل في يوم سابق", "");
    const a = findPerson(state, e.actualPersonId);
    if (a) push(a, 3, "استخدم سابقًا", "");
  }

  // 4) المرتبطون بالسهم (طرف آخر مسجَّل أو ناقل حق)
  for (const sh of state.shareholders.filter((s) => s.pumpId === pumpId && !s.archived)) {
    const c = findPerson(state, sh.counterpartPersonId ?? null);
    if (c) push(c, 4, sh.useStatus === "rented" ? "مرتبط بالتأجير" : "مرتبط بالسهم", sh.useStatusAt || "");
  }
  for (const r of state.rights.filter((r) => r.pumpId === pumpId)) {
    const from = findPerson(state, r.fromPersonId);
    if (from) push(from, 4, "ناقل حق سابق", r.startedAt || "");
  }
  for (const t of state.transferEvents.filter((t) => t.pumpId === pumpId)) {
    const from = findPerson(state, t.fromPersonId);
    const to = findPerson(state, t.toPersonId);
    if (from) push(from, 4, "طرف في سلفة", t.date || "");
    if (to) push(to, 4, "طرف في سلفة", t.date || "");
  }

  // 5) البحث العام في كل الأشخاص المسجّلين
  for (const p of state.persons) {
    if (!p.archived) push(p, 5, "شخص مسجّل", "");
  }

  let list = Array.from(map.values());
  if (q) {
    list = list.filter(
      (s) =>
        s.person.name.includes(q) ||
        (s.person.phone && s.person.phone.includes(q)) ||
        s.tags.some((t) => t.includes(q))
    );
  }
  list.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier;
    return a.person.name.localeCompare(b.person.name, "ar");
  });
  return list.slice(0, limit);
}

/* --------------------- كشف التعارضات والتحقق (§17-19,65) --------------- */

export type DayIssueKind =
  | ConflictKind
  | "outside_window"
  | "missing_time"
  | "no_person"
  | "empty_day";

export interface DayIssue {
  kind: DayIssueKind;
  severity: DayIssueSeverity;
  key: string;
  message: string;
  entryIds: string[];
}

export function isAcked(
  state: AppState,
  dayId: string | null,
  kind: ConflictKind,
  key: string
): boolean {
  return state.conflictAcks.some(
    (a) => a.kind === kind && a.key === key && (dayId ? a.dayId === dayId : true)
  );
}

export function dayIssues(state: AppState, day: DialaDay, pump: Pump): DayIssue[] {
  const issues: DayIssue[] = [];
  const entries = dayEntries(state, day.id);
  if (entries.length === 0) {
    issues.push({
      kind: "empty_day",
      severity: "warn",
      key: `empty-${day.id}`,
      message: "لا يوجد أي شخص في هذا اليوم بعد.",
      entryIds: [],
    });
  }

  const window = pumpWindow(pump, day);
  const anchor = timeToMinutes(window.start);
  const intervals = entries.map((e) => {
    const hasTimes = !!e.startTime && !!e.endTime;
    const span = hasTimes ? entryInterval(anchor, e.startTime, e.endTime, window.capacityMin) : null;
    return {
      entry: e,
      hasTimes,
      from: span ? span.from : 0,
      to: span ? span.to : 0,
    };
  });

  // تداخل غير مقصود — لا يُحذف أي سجل تلقائيًا
  for (let i = 0; i < intervals.length; i++) {
    for (let j = i + 1; j < intervals.length; j++) {
      const a = intervals[i];
      const b = intervals[j];
      if (!a.hasTimes || !b.hasTimes) continue;
      const overlap = rangesOverlap({ from: a.from, to: a.to }, { from: b.from, to: b.to });
      if (overlap > 0) {
        const key = `overlap-${a.entry.id}-${b.entry.id}`;
        issues.push({
          kind: "overlap",
          severity: "warn",
          key,
          message: `تداخل في أوقات الاستخدام بين ${personName(state, a.entry.personId)} و${personName(
            state,
            b.entry.personId
          )} (${Math.round(overlap)} دقيقة).`,
          entryIds: [a.entry.id, b.entry.id],
        });
      }
    }
  }

  // تكرار غير مقصود لنفس الشخص (بنفس السهم) — لا يُحذف أي سجل
  const byPerson = new Map<string, DayEntry[]>();
  for (const e of entries) {
    if (!e.personId) continue;
    const list = byPerson.get(e.personId) ?? [];
    list.push(e);
    byPerson.set(e.personId, list);
  }
  for (const [personId, list] of byPerson) {
    if (list.length < 2) continue;
    const shares = new Set(list.map((e) => e.shareholderId ?? "none"));
    if (shares.size > 1) continue; // شخص يملك أكثر من سهم — ليس تكرارًا
    issues.push({
      kind: "duplicate",
      severity: "warn",
      key: `dup-${personId}`,
      message: `${personName(state, personId)} مسجَّل ${list.length} مرات في نفس اليوم.`,
      entryIds: list.map((e) => e.id),
    });
  }

  // خارج أوقات التشغيل
  for (const interval of intervals) {
    const e = interval.entry;
    if (!e.startTime) {
      issues.push({
        kind: "missing_time",
        severity: "error",
        key: `missing-${e.id}`,
        message: `${personName(state, e.personId)}: وقت البداية غير محدد.`,
        entryIds: [e.id],
      });
      continue;
    }
    if (interval.from < -1 || interval.to > window.capacityMin + 1) {
      issues.push({
        kind: "outside_window",
        severity: "warn",
        key: `outside-${e.id}`,
        message: `${personName(state, e.personId)}: الوقت خارج نافذة تشغيل المضخة (${window.start} → ${window.end}).`,
        entryIds: [e.id],
      });
    }
  }

  // تجاوز إجمالي ساعات التشغيل — مع مراعاة التوقفات (§8, §22)
  const dayStoppageMin = state.stoppages
    .filter((s) => s.dayId === day.id && !s.archived)
    .reduce((s, st) => s + st.minutes, 0);
  const effectiveMin = Math.max(0, window.capacityMin - dayStoppageMin);
  const total = entries
    .filter((e) => e.status !== "cancelled")
    .reduce((s, e) => s + entryMinutes(e), 0);
  if (total > effectiveMin + 1) {
    issues.push({
      kind: "over_capacity",
      severity: "warn",
      key: `capacity-${day.id}`,
      message: `مجموع ساعات الترتيب ${toHours(total)} ساعة يتجاوز الطاقة المتاحة (${toHours(
        effectiveMin
      )} ساعة = ${toHours(window.capacityMin)} ساعة تشغيل − ${toHours(dayStoppageMin)} ساعة توقف) بمقدار ${toHours(
        total - effectiveMin
      )} ساعة.`,
      entryIds: [],
    });
  }

  // تعارض الاستخدامات الفعلية (§7) — يُعرض تحذيرًا، ولا يُحذف أي سجل تلقائيًا
  const dayUsages = state.usages.filter((u) => u.dayId === day.id && u.status === "active");
  const usageSpans = dayUsages.map((u) => ({
    usage: u,
    span: entryInterval(anchor, u.startTime, u.endTime, window.capacityMin),
  }));
  for (let i = 0; i < usageSpans.length; i++) {
    for (let j = i + 1; j < usageSpans.length; j++) {
      const a = usageSpans[i];
      const b = usageSpans[j];
      const overlap = rangesOverlap(a.span, b.span);
      if (overlap > 0) {
        issues.push({
          kind: "overlap",
          severity: "warn",
          key: `usage-overlap-${a.usage.id}-${b.usage.id}`,
          message: `تداخل في الاستخدام الفعلي بين ${personName(
            state,
            a.usage.personId
          )} (${a.usage.startTime} → ${a.usage.endTime}) و${personName(
            state,
            b.usage.personId
          )} (${b.usage.startTime} → ${b.usage.endTime}) بمقدار ${Math.round(overlap)} دقيقة.`,
          entryIds: [],
        });
      }
    }
  }

  // تجاوز ساعات المضخة بحسب الاستخدام الفعلي — بالتفصيل (§8)
  const usageTotal = dayUsages.reduce((s, u) => s + u.minutes, 0);
  if (usageTotal > effectiveMin + 1) {
    const over = usageTotal - effectiveMin;
    const reasons = dayUsages
      .filter((u) => u.overCapacity)
      .map((u) => u.overCapacityReason)
      .filter(Boolean);
    issues.push({
      kind: "over_capacity",
      severity: "warn",
      key: `usage-capacity-${day.id}`,
      message: `إجمالي الاستخدام الفعلي ${toHours(usageTotal)} ساعة · ساعات المضخة المتاحة ${toHours(
        effectiveMin
      )} ساعة (${toHours(window.capacityMin)} تشغيل − ${toHours(dayStoppageMin)} توقف) · مقدار التجاوز ${toHours(
        over
      )} ساعة${reasons.length ? ` · سبب مسجَّل: ${reasons.join(" | ")}` : " · لا يوجد سبب مسجَّل"}.`,
      entryIds: [],
    });
  }

  return issues;
}

/**
 * موضع الفترة داخل نافذة تشغيل المضخة بالدقائق (يدعم عبور منتصف الليل):
 * الفترة التي تبدأ بعد منتصف الليل داخل نافذة تنتهي في اليوم التالي تُحسب في نهايتها الصحيحة.
 */
export function entryInterval(
  anchorMin: number,
  start: string,
  end: string,
  capacityMin: number
): { from: number; to: number; minutes: number } {
  const minutes = durationMin(start, end);
  const base = timeToMinutes(start) - anchorMin;
  const candidates = [base, base + 1440, base - 1440];
  const fit = candidates.find((c) => c >= -1 && c + minutes <= capacityMin + 1);
  const from = fit !== undefined ? fit : base < 0 ? base + 1440 : base;
  return { from, to: from + minutes, minutes };
}

export function openIssues(state: AppState, day: DialaDay, pump: Pump): DayIssue[] {
  return dayIssues(state, day, pump).filter((i) => !isAcked(state, day.id, i.kind as ConflictKind, i.key));
}

/* ------------------------------ ملخص اليوم ----------------------------- */

export interface DaySummary {
  dayId: string;
  persons: number;
  plannedMin: number;
  usageMin: number;
  capacityMin: number;
  /** طاقة الجدول الأساسي وقت إنشاء اليوم (§4) */
  plannedCapacityMin: number;
  /** الطاقة الفعلية = طاقة النافذة − التوقفات (§22) */
  effectiveMin: number;
  remainingMin: number;
  overMin: number;
  liters: number;
  fuelAmount: number;
  /** مجموع التكاليف المسجّلة بسعر المستخدم الشخصي */
  personalFuelCost: number;
  royaltyAmount: number;
  usageAmount: number;
  stoppageMin: number;
  issues: number;
}

export function daySummary(state: AppState, day: DialaDay, pump: Pump): DaySummary {
  const entries = dayEntries(state, day.id).filter((e) => e.status !== "cancelled");
  const usages = state.usages.filter((u) => u.dayId === day.id && u.status === "active");
  const window = pumpWindow(pump, day);
  const plannedMin = entries.reduce((s, e) => s + entryMinutes(e), 0);
  const usageMin = usages.reduce((s, u) => s + u.minutes, 0);
  const liters = usages.reduce((s, u) => s + u.fuelLiters, 0);
  const personalFuelCost = usages.reduce(
    (s, u) => s + (u.personalFuelPriceSnapshot > 0 ? u.fuelCost : 0),
    0
  );
  const fuelAmount = usages.reduce((s, u) => s + u.fuelAmountDue, 0);
  const royaltyAmount = usages.reduce((s, u) => s + u.royaltyAmountDue, 0);
  const stoppageMin = state.stoppages
    .filter((s) => s.dayId === day.id && !s.archived)
    .reduce((s, st) => s + st.minutes, 0);
  /** الساعات الفعلية المتوقّعة: الاستخدام الفعلي إن وُجد، وإلا المخطط */
  const measured = usageMin > 0 ? usageMin : plannedMin;
  const effectiveMin = Math.max(0, window.capacityMin - stoppageMin);
  return {
    dayId: day.id,
    persons: entries.length,
    plannedMin,
    usageMin,
    capacityMin: window.capacityMin,
    plannedCapacityMin: day.plannedCapacityMin || window.capacityMin,
    effectiveMin,
    remainingMin: Math.max(0, effectiveMin - measured),
    overMin: Math.max(0, measured - effectiveMin),
    liters: Math.round(liters * 10) / 10,
    fuelAmount: Math.round(fuelAmount),
    personalFuelCost: Math.round(personalFuelCost),
    royaltyAmount: Math.round(royaltyAmount),
    usageAmount: Math.round(fuelAmount + royaltyAmount),
    stoppageMin,
    issues: openIssues(state, day, pump).length,
  };
}

/* --------------------------- الاستخدام الفعلي (§17,22) ------------------ */

export interface UsageDraft {
  minutes: number;
  /** الساعات الفعلية (من الأوقات الفعلية فقط — لا من نسبة السهم) */
  hours: number;
  crossesMidnight: boolean;
  fuelPerHourSnapshot: number;
  fuelLiters: number;
  /** السعر المرجعي للمضخة وقت العملية */
  fuelPriceSnapshot: number;
  /** السعر الشخصي الذي سجّله المستخدم (0 = لم يُسجَّل فيُستخدم المرجعي) */
  personalFuelPriceSnapshot: number;
  /** تكلفة الديزل باللترات × السعر المستخدم */
  fuelCost: number;
  fuelAmountDue: number;
  royaltyHourlySnapshot: number;
  royaltyAmountDue: number;
  /** دقائق توقف المضخة داخل فترة هذه العملية */
  stoppageMin: number;
}

export interface UsageDraftOptions {
  /** سعر الديزل الذي يسجّله المستخدم لهذه العملية (§9) */
  personalFuelPrice?: number;
  royaltyProrate?: boolean;
  /** دقائق التوقف الداخلة في الفترة — تُمرَّر من المخزن بعد حسابها */
  stoppageMin?: number;
}

/**
 * حساب العملية (§6, §9, §10, §17):
 * الساعات من الأوقات الفعلية فقط (مع عبور منتصف الليل)،
 * واللترات = الساعات × استهلاك المضخة في الساعة،
 * والتكلفة = اللترات × السعر الشخصي إن سجّله المستخدم وإلا السعر المرجعي.
 * كل هذه القيم تُحفظ كـ Snapshot داخل العملية ولا تتأثر بتغيّر الإعدادات لاحقًا.
 */
export function computeUsageDraft(
  pump: Pump,
  day: DialaDay,
  startTime: string,
  endTime: string,
  opts: UsageDraftOptions = {}
): UsageDraft {
  const minutes = durationMin(startTime, endTime);
  const window = pumpWindow(pump, day);
  const hours = toHours(minutes);
  const liters =
    pump.energyType === "solar"
      ? 0
      : pump.fuelCalcMode === "cycle"
        ? window.capacityMin > 0
          ? Math.round(pump.fuelPerCycle * (minutes / window.capacityMin) * 100) / 100
          : 0
        : Math.round(hours * pump.fuelConsumptionPerHour * 100) / 100;
  const referencePrice = pump.fuelPrice || 0;
  const personalPrice = Math.max(0, opts.personalFuelPrice ?? 0);
  /** السعر المستخدم للعملية: السعر الشخصي أولًا، والمرجعي بديلًا (§9) */
  const usedPrice = personalPrice > 0 ? personalPrice : referencePrice;
  const fuelCost = Math.round(liters * usedPrice);
  const royalty =
    !pump.royaltyEnabled
      ? 0
      : pump.royaltyMode === "hour"
        ? Math.round(hours * pump.royaltyPerHour)
        : (opts.royaltyProrate ?? true) && window.capacityMin > 0
          ? Math.round(pump.royaltyPerCycle * (minutes / window.capacityMin))
          : 0;
  return {
    minutes,
    hours,
    crossesMidnight: isOvernight(startTime, endTime),
    fuelPerHourSnapshot: pump.fuelConsumptionPerHour,
    fuelLiters: liters,
    fuelPriceSnapshot: referencePrice,
    personalFuelPriceSnapshot: personalPrice,
    fuelCost,
    fuelAmountDue: fuelCost,
    royaltyHourlySnapshot: pump.royaltyMode === "hour" ? pump.royaltyPerHour : pump.royaltyPerCycle,
    royaltyAmountDue: royalty,
    stoppageMin: Math.max(0, Math.round(opts.stoppageMin ?? 0)),
  };
}

export function usageTypeLabel(t: UsageType): string {
  switch (t) {
    case "share":
      return "حصة أساسية";
    case "rental":
      return "تأجير";
    case "loan":
      return "إعارة";
    case "purchase":
      return "شراء ساعات";
    case "extra":
      return "ساعات إضافية";
    default:
      return "ضيف";
  }
}

/* -------------------- حالة استخدام السهم عند المساهم (§5,6,7) ---------- */

export const USE_STATUS_OPTIONS: {
  id: ShareholderUseStatus;
  label: string;
  hint: string;
}[] = [
  { id: "continuing", label: "مستمر", hint: "يستخدم سهمه بنفسه — بلا تأجير ولا بيع" },
  { id: "rented", label: "مؤاجر", hint: "أجّر سهمه — سجّل اسم المستأجر ورقمه" },
  { id: "transferred", label: "مناقل", hint: "نقل سهمه (تنازل) لشخص آخر — سجّل اسمه ورقمه" },
  { id: "sold", label: "بايع", hint: "باع سهمه — سجّل اسم المالك الجديد ورقمه" },
];

export function shareholderUseStatus(sh: Shareholder): ShareholderUseStatus {
  return sh.useStatus ?? "continuing";
}

export function useStatusLabel(status: ShareholderUseStatus): string {
  return USE_STATUS_OPTIONS.find((o) => o.id === status)?.label ?? "مستمر";
}

export function useStatusTone(status: ShareholderUseStatus): "green" | "amber" | "blue" | "gray" {
  switch (status) {
    case "rented":
      return "amber";
    case "transferred":
      return "blue";
    case "sold":
      return "gray";
    default:
      return "green";
  }
}

/** هل هذه الحالة تحتاج تسجيل طرف آخر (مستأجر أو مالك جديد)؟ */
export function useStatusNeedsCounterpart(status: ShareholderUseStatus): boolean {
  return status !== "continuing";
}

/** نوع العلاقة المسجّل في سجل الحقوق مقابل حالة الاستخدام */
export function useStatusRightKind(status: ShareholderUseStatus): RightKind {
  return status === "rented" ? "rent" : "transfer";
}

/** الطرف الآخر للمساهم: المستأجر / المالك الجديد / المتنازل له */
export function shareholderCounterpart(
  state: AppState,
  sh: Shareholder
): { person: Person; phone: string } | null {
  const person = findPerson(state, sh.counterpartPersonId ?? null);
  if (!person) return null;
  return { person, phone: sh.counterpartPhone || person.phone };
}

/**
 * المساهمون الأساسيون المرتبطون بمضخة ومَن يستخدم سهمهم الآن
 * — سجل مرجعي ثابت لا يتأثر بترتيب اليوم الفعلي.
 */
export interface ShareholderUsageRow {
  shareholder: Shareholder;
  person: Person | null;
  status: ShareholderUseStatus;
  counterpart: Person | null;
  counterpartPhone: string;
  activeRight: ShareRight | null;
  currentHolder: Person | null;
}

export function shareholderUsageRows(state: AppState, pumpId: string): ShareholderUsageRow[] {
  return activeShareholders(state, pumpId).map((sh) => {
    const status = shareholderUseStatus(sh);
    const counterpart = findPerson(state, sh.counterpartPersonId ?? null);
    const activeRight = currentRight(state, sh.id);
    const holderId = activeRight ? activeRight.holderPersonId : sh.personId;
    return {
      shareholder: sh,
      person: findPerson(state, sh.personId),
      status,
      counterpart,
      counterpartPhone: sh.counterpartPhone || counterpart?.phone || "",
      activeRight,
      currentHolder: findPerson(state, holderId),
    };
  });
}

/* ------------------- تسديد الديزل والرواسة لكل مستخدم (§21-24) --------- */

export const DIESEL_SETTLEMENT_OPTIONS: {
  id: DieselSettlement;
  label: string;
  action: string;
}[] = [
  { id: "paid", label: "مسدد", action: "يُسجَّل استحقاق ودفعة نقدية — لا يبقى عليه ديزل" },
  { id: "shortage", label: "نقص", action: "يُسجَّل النقص فقط دينًا عليه" },
  { id: "unpaid", label: "غير مسدد", action: "يُسجَّل كامل قيمة الديزل دينًا عليه" },
];

export const ROYALTY_MODE_OPTIONS: { id: RoyaltyPayMode; label: string; action: string }[] = [
  { id: "cash", label: "نقد", action: "رواسة مدفوعة نقدًا — لا دين" },
  { id: "credit", label: "أجل", action: "رواسة آجلة — تُسجَّل دينًا" },
];

export function dieselSettlementLabel(v: DieselSettlement): string {
  return DIESEL_SETTLEMENT_OPTIONS.find((o) => o.id === v)?.label ?? "غير مسدد";
}

export function royaltyModeLabel(v: RoyaltyPayMode): string {
  return v === "cash" ? "نقد" : "أجل";
}

/** قيمة نقص الديزل المحسوبة من اللترات بسعر العملية (Snapshot) */
export function shortageAmountOf(usage: {
  dieselShortageLiters: number;
  fuelPriceSnapshot: number;
  fuelAmountDue: number;
}): number {
  const raw = Math.round((usage.dieselShortageLiters || 0) * (usage.fuelPriceSnapshot || 0));
  return clamp(raw, 0, Math.round(usage.fuelAmountDue || 0));
}

export interface SettlementPosting {
  kind: TxKind;
  direction: TxDirection;
  amount: number;
  reason: string;
  notes: string;
}

/**
 * الحركات المالية الناتجة عن حالة التسديد — مصدر واحد لكل الشاشات.
 * كل خيار له أثر مختلف: مسدد (استحقاق + سداد)، نقص (استحقاق + سداد جزئي)،
 * غير مسدد (استحقاق كامل)، والرواسة: نقد (استحقاق + سداد) أو أجل (استحقاق فقط).
 */
export function settlementPostings(usage: ActualUsage): SettlementPosting[] {
  const out: SettlementPosting[] = [];
  const diesel = usage.dieselSettlement ?? "unpaid";
  const royaltyMode = usage.royaltyPayMode ?? "credit";
  const fuelDue = Math.round(usage.fuelAmountDue || 0);
  const royaltyDue = Math.round(usage.royaltyAmountDue || 0);

  if (fuelDue > 0) {
    out.push({
      kind: "fuel",
      direction: "debit",
      amount: fuelDue,
      reason: "استحقاق ديزل",
      notes: `محسوبة من ${usage.fuelLiters} لتر × ${usage.fuelPriceSnapshot} (استهلاك وقت العملية ${usage.fuelPerHourSnapshot} لتر/ساعة)`,
    });
    if (diesel === "paid") {
      out.push({
        kind: "payment",
        direction: "credit",
        amount: fuelDue,
        reason: "سداد ديزل نقدًا",
        notes: usage.settlementNote || "",
      });
    } else if (diesel === "shortage") {
      const paidPart = fuelDue - shortageAmountOf(usage);
      if (paidPart > 0) {
        out.push({
          kind: "payment",
          direction: "credit",
          amount: paidPart,
          reason: `سداد جزئي — نقص ${usage.dieselShortageLiters} لتر`,
          notes: usage.settlementNote || "",
        });
      }
    }
  }

  if (royaltyDue > 0) {
    out.push({
      kind: "royalty",
      direction: "debit",
      amount: royaltyDue,
      reason: royaltyMode === "cash" ? "استحقاق رواسة" : "رواسة آجلة (دين)",
      notes: usage.settlementNote || "",
    });
    if (royaltyMode === "cash") {
      out.push({
        kind: "payment",
        direction: "credit",
        amount: royaltyDue,
        reason: "سداد رواسة نقدًا",
        notes: "",
      });
    }
  }

  return out;
}

export interface DaySettlementTotals {
  users: number;
  dieselDue: number;
  dieselPaid: number;
  dieselOwed: number;
  shortageLiters: number;
  shortageAmount: number;
  unpaidCount: number;
  shortageCount: number;
  paidCount: number;
  royaltyDue: number;
  royaltyCash: number;
  royaltyCredit: number;
  cashCount: number;
  creditCount: number;
}

/** ملخص تسديدات اليوم: ديزل مسدد/نقص/غير مسدد ورواسة نقد/أجل */
export function daySettlementTotals(state: AppState, dayId: string): DaySettlementTotals {
  const usages = state.usages.filter((u) => u.dayId === dayId && u.status === "active");
  const totals: DaySettlementTotals = {
    users: usages.length,
    dieselDue: 0,
    dieselPaid: 0,
    dieselOwed: 0,
    shortageLiters: 0,
    shortageAmount: 0,
    unpaidCount: 0,
    shortageCount: 0,
    paidCount: 0,
    royaltyDue: 0,
    royaltyCash: 0,
    royaltyCredit: 0,
    cashCount: 0,
    creditCount: 0,
  };
  for (const u of usages) {
    const diesel = u.dieselSettlement ?? "unpaid";
    const mode = u.royaltyPayMode ?? "credit";
    const fuelDue = Math.round(u.fuelAmountDue || 0);
    totals.dieselDue += fuelDue;
    if (diesel === "paid") {
      totals.paidCount += 1;
      totals.dieselPaid += fuelDue;
    } else if (diesel === "shortage") {
      totals.shortageCount += 1;
      const short = shortageAmountOf(u);
      totals.shortageLiters += u.dieselShortageLiters || 0;
      totals.shortageAmount += short;
      totals.dieselPaid += fuelDue - short;
      totals.dieselOwed += short;
    } else {
      totals.unpaidCount += 1;
      totals.dieselOwed += fuelDue;
    }
    const royaltyDue = Math.round(u.royaltyAmountDue || 0);
    totals.royaltyDue += royaltyDue;
    if (mode === "cash") {
      totals.cashCount += 1;
      totals.royaltyCash += royaltyDue;
    } else {
      totals.creditCount += 1;
      totals.royaltyCredit += royaltyDue;
    }
  }
  totals.shortageLiters = Math.round(totals.shortageLiters * 100) / 100;
  return totals;
}

/* ------------------------------- المالية (§27) ------------------------- */

export function txSignedAmount(t: Transaction): number {
  return t.direction === "debit" ? t.amount : -t.amount;
}

export function personTransactions(state: AppState, personId: string): Transaction[] {
  return state.transactions
    .filter((t) => t.personId === personId && t.status === "posted")
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.createdAt < a.createdAt ? 1 : -1));
}

export interface PersonBalance {
  personId: string;
  debit: number;
  credit: number;
  balance: number;
  byKind: Record<string, { debit: number; credit: number }>;
}

export function personBalance(state: AppState, personId: string): PersonBalance {
  const byKind: Record<string, { debit: number; credit: number }> = {};
  let debit = 0;
  let credit = 0;
  for (const t of personTransactions(state, personId)) {
    const bucket = (byKind[t.kind] ??= { debit: 0, credit: 0 });
    if (t.direction === "debit") {
      debit += t.amount;
      bucket.debit += t.amount;
    } else {
      credit += t.amount;
      bucket.credit += t.amount;
    }
  }
  return { personId, debit, credit, balance: debit - credit, byKind };
}

export function debtors(state: AppState): PersonBalance[] {
  return state.persons
    .filter((p) => !p.archived)
    .map((p) => personBalance(state, p.id))
    .filter((b) => b.balance > 0)
    .sort((a, b) => b.balance - a.balance);
}

export function txKindLabel(kind: TxKind): string {
  switch (kind) {
    case "fuel":
      return "ديزل";
    case "royalty":
      return "رواسة";
    case "payment":
      return "دفعة";
    case "debt":
      return "دين";
    case "loan":
      return "سلفة";
    case "advance":
      return "ساعات مقدمة";
    case "postpone_fee":
      return "أجر تأجيل";
    case "operators":
      return "أجور الرواسة";
    case "correction":
      return "تصحيح";
    default:
      return "أخرى";
  }
}

export interface PumpFinancials {
  charging: number;
  collected: number;
  outstanding: number;
  fuelCharged: number;
  royaltyCharged: number;
  operatorDue: number;
  operatorPaid: number;
  fuelLiters: number;
  fuelShortage: number;
}

export function pumpFinancials(state: AppState, from?: string, to?: string): PumpFinancials {
  const inRange = (d: string) => (!from || d >= from) && (!to || d <= to);
  let charging = 0;
  let collected = 0;
  let fuelCharged = 0;
  let royaltyCharged = 0;
  for (const t of state.transactions) {
    if (t.status !== "posted" || !inRange(t.date)) continue;
    if (t.direction === "debit") {
      charging += t.amount;
      if (t.kind === "fuel") fuelCharged += t.amount;
      if (t.kind === "royalty") royaltyCharged += t.amount;
    } else {
      collected += t.amount;
    }
  }
  let operatorDue = 0;
  for (const r of state.operatorRecords.filter((r) => !r.archived && inRange(r.date))) {
    operatorDue += r.dueAmount;
  }
  const records = state.fuelRecords.filter((r) => !r.archived && inRange(r.date));
  return {
    charging,
    collected,
    outstanding: charging - collected,
    fuelCharged,
    royaltyCharged,
    operatorDue,
    operatorPaid: state.transactions
      .filter((t) => t.status === "posted" && t.kind === "operators" && inRange(t.date))
      .reduce((s, t) => s + t.amount, 0),
    fuelLiters: Math.round(records.reduce((s, r) => s + r.liters, 0) * 10) / 10,
    fuelShortage: Math.round(records.reduce((s, r) => s + r.shortageLiters, 0) * 10) / 10,
  };
}

export function operatorPaidFor(state: AppState, operatorRecordId: string): number {
  return state.transactions
    .filter(
      (t) =>
        t.operatorRecordId === operatorRecordId && t.status === "posted"
    )
    .reduce((s, t) => s + t.amount, 0);
}

/* ------------------- السجل الرسمي مقابل السجل الشخصي (§31-33) ---------- */

export interface CompareRow {
  date: string;
  dayId: string | null;
  dayLabel: string;
  officialMinutes: number;
  personalMinutes: number;
  minutesDiff: number;
  officialAmount: number;
  personalAmount: number;
  amountDiff: number;
  status: "matched" | "different" | "personal_only" | "official_only" | "settled";
}

export interface PersonComparison {
  rows: CompareRow[];
  officialMinutes: number;
  personalMinutes: number;
  officialAmount: number;
  personalAmount: number;
  differences: number;
}

export function officialAmountForUsage(u: ActualUsage): number {
  return u.fuelAmountDue + u.royaltyAmountDue;
}

/** ما سجّله المسؤول عن هذا الشخص في يوم معيّن */
export function officialForDay(
  state: AppState,
  day: DialaDay,
  personId: string
): { minutes: number; amount: number; usageIds: string[] } {
  const usages = state.usages.filter(
    (u) => u.dayId === day.id && u.personId === personId && u.status === "active"
  );
  if (usages.length > 0) {
    return {
      minutes: usages.reduce((s, u) => s + u.minutes, 0),
      amount: usages.reduce((s, u) => s + officialAmountForUsage(u), 0),
      usageIds: usages.map((u) => u.id),
    };
  }
  if (day.status === "completed" || day.status === "closed" || day.status === "revised") {
    const entries = dayEntries(state, day.id).filter(
      (e) =>
        (e.actualPersonId ?? e.personId) === personId && e.status !== "cancelled"
    );
    return {
      minutes: entries.reduce((s, e) => s + entryMinutes(e), 0),
      amount: 0,
      usageIds: [],
    };
  }
  return { minutes: 0, amount: 0, usageIds: [] };
}

export function comparePerson(
  state: AppState,
  personId: string
): PersonComparison {
  const personal = state.personalRecords.filter((r) => r.personId === personId);
  const days = state.days.filter((d) => !d.archived);
  const dates = Array.from(
    new Set<string>([...days.map((d) => d.date), ...personal.map((r) => r.date)])
  ).sort((a, b) => (a < b ? 1 : -1));

  const rows: CompareRow[] = [];
  const settlementFor = (_date: string, dayId: string | null) =>
    dayId
      ? state.settlements.find((s) => s.personId === personId && s.dayId === dayId)
      : undefined;

  for (const date of dates) {
    const day = days.find((d) => d.date === date) ?? null;
    const official = day
      ? officialForDay(state, day, personId)
      : { minutes: 0, amount: 0, usageIds: [] };
    const mine = personal.filter((r) => r.date === date);
    const personalMinutes = mine.reduce((s, r) => s + r.minutes, 0);
    const personalAmount = mine.reduce((s, r) => s + r.dieselAmount + r.royaltyAmount, 0);
    if (official.minutes === 0 && personalMinutes === 0 && personalAmount === 0) continue;
    const minutesDiff = official.minutes - personalMinutes;
    const amountDiff = official.amount - personalAmount;
    let status: CompareRow["status"] = "matched";
    if (official.minutes > 0 && personalMinutes === 0) status = "official_only";
    else if (personalMinutes > 0 && official.minutes === 0) status = "personal_only";
    else if (minutesDiff !== 0 || amountDiff !== 0) status = "different";
    const settled = settlementFor(date, day?.id ?? null);
    if (settled) status = "settled";
    rows.push({
      date,
      dayId: day?.id ?? null,
      dayLabel: isoToShort(date),
      officialMinutes: official.minutes,
      personalMinutes,
      minutesDiff,
      officialAmount: official.amount,
      personalAmount,
      amountDiff,
      status,
    });
  }

  return {
    rows,
    officialMinutes: rows.reduce((s, r) => s + r.officialMinutes, 0),
    personalMinutes: rows.reduce((s, r) => s + r.personalMinutes, 0),
    officialAmount: rows.reduce((s, r) => s + r.officialAmount, 0),
    personalAmount: rows.reduce((s, r) => s + r.personalAmount, 0),
    differences: rows.filter((r) => r.status === "different" || r.status === "official_only" || r.status === "personal_only")
      .length,
  };
}

export function matchStatusLabel(s: CompareRow["status"]): string {
  switch (s) {
    case "matched":
      return "مطابق";
    case "different":
      return "مختلف";
    case "personal_only":
      return "شخصي فقط";
    case "official_only":
      return "رسمي فقط";
    case "settled":
      return "تمت التسوية";
    default:
      return "قيد المراجعة";
  }
}

/* ----------------------- دور الشخص: الحالي والقادم --------------------- */

export interface PersonTurnInfo {
  day: DialaDay;
  entry: DayEntry;
  isCurrent: boolean;
}

export function personTurns(state: AppState, personId: string): PersonTurnInfo[] {
  const list: PersonTurnInfo[] = [];
  for (const day of sortedDays(state)) {
    for (const entry of dayEntries(state, day.id)) {
      const owner = entry.actualPersonId ?? entry.personId;
      if (owner === personId || entry.personId === personId) {
        list.push({ day, entry, isCurrent: day.date === todayISO() });
      }
    }
  }
  return list;
}

export function personCurrentTurn(state: AppState, personId: string): PersonTurnInfo | null {
  const now = nowTime();
  const today = todayISO();
  const turns = personTurns(state, personId);
  const todayTurn = turns.find((t) => t.day.date === today && t.entry.status !== "cancelled");
  if (todayTurn) return todayTurn;
  const timeNow = timeToMinutes(now);
  const live = turns.find(
    (t) =>
      t.day.date === today &&
      t.entry.status !== "cancelled" &&
      t.entry.startTime &&
      timeToMinutes(t.entry.startTime) <= timeNow &&
      timeNow < timeToMinutes(t.entry.startTime) + entryMinutes(t.entry)
  );
  return live ?? null;
}

export function personNextTurn(state: AppState, personId: string): PersonTurnInfo | null {
  const today = todayISO();
  const future = personTurns(state, personId)
    .filter((t) => t.day.date > today && t.entry.status !== "cancelled")
    .sort((a, b) => (a.day.date < b.day.date ? -1 : 1));
  return future[0] ?? null;
}

export function remainingMinutesForEntry(entry: DayEntry): number {
  if (entry.status === "done") return 0;
  const minutes = entryMinutes(entry);
  if (entry.startTime) {
    const elapsed = durationMin(entry.startTime, nowTime());
    return Math.max(0, minutes - elapsed);
  }
  return minutes;
}

/* -------------------------------- إشعارات ------------------------------ */

export function unreadNotifications(state: AppState) {
  return state.notifications.filter((n) => !n.read);
}

export function notificationTone(level: "info" | "warn" | "danger") {
  return level === "danger" ? "red" : level === "warn" ? "amber" : "blue";
}

/* --------------------------- تقارير ومساعدات --------------------------- */

export function groupBy<T>(list: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of list) {
    const k = key(item);
    const arr = map.get(k) ?? [];
    arr.push(item);
    map.set(k, arr);
  }
  return map;
}

export function formatHoursLabel(min: number): string {
  return `${toHours(min)} س`;
}

export function dayCapacity(min: number, total: number): number {
  return clamp(Math.round((min / (total || 1)) * 100), 0, 100);
}

export function isoRangeDays(fromISO: string, toISO: string): string[] {
  const out: string[] = [];
  let cur = fromISO;
  let guard = 0;
  while (cur <= toISO && guard < 400) {
    out.push(cur);
    cur = addDaysISO(cur, 1);
    guard += 1;
  }
  return out;
}

/* --------------- التوقفات والتقاطع مع استخدام فعلي (§7, §22) ------------ */

/** دقائق توقفات المضخة المتقاطعة مع فترة [startTime → endTime] */
export function stoppageMinutesInRange(
  state: AppState,
  dayId: string,
  startTime: string,
  endTime: string,
  anchorMin: number,
  capacityMin: number
): number {
  const target = entryInterval(anchorMin, startTime, endTime, capacityMin);
  let total = 0;
  for (const s of state.stoppages) {
    if (s.archived || s.dayId !== dayId) continue;
    const span = entryInterval(anchorMin, s.startTime, s.endTime, capacityMin);
    total += rangesOverlap(target, span);
  }
  return Math.round(total);
}

export interface UsageOverlap {
  usageId: string;
  personId: string;
  personName: string;
  startTime: string;
  endTime: string;
  /** مقدار التداخل بالدقائق */
  minutes: number;
}

/**
 * كشف تداخل فترة جديدة مع الاستخدامات المسجّلة في اليوم (§7).
 * لا يحذف ولا يعدّل أي سجل — يعيد قائمة التعارضات للعرض والتأكيد فقط.
 */
export function overlapsFor(
  state: AppState,
  day: DialaDay,
  pump: Pump,
  startTime: string,
  endTime: string,
  ignoreUsageId: string | null = null
): UsageOverlap[] {
  const window = pumpWindow(pump, day);
  const anchor = timeToMinutes(window.start);
  const candidate = entryInterval(anchor, startTime, endTime, window.capacityMin);
  const out: UsageOverlap[] = [];
  for (const u of state.usages) {
    if (u.dayId !== day.id || u.status !== "active" || u.id === ignoreUsageId) continue;
    const span = entryInterval(anchor, u.startTime, u.endTime, window.capacityMin);
    const overlap = Math.round(rangesOverlap(candidate, span));
    if (overlap > 0) {
      out.push({
        usageId: u.id,
        personId: u.personId,
        personName: personName(state, u.personId),
        startTime: u.startTime,
        endTime: u.endTime,
        minutes: overlap,
      });
    }
  }
  return out;
}

export interface CapacityBreakdown {
  /** مجموع الاستخدام الفعلي (اختياريًا مع فترة قيد التسجيل) */
  usageTotalMin: number;
  plannedTotalMin: number;
  capacityMin: number;
  stoppageMin: number;
  effectiveMin: number;
  overMin: number;
  over: boolean;
  overReasons: string[];
  liters: number;
  currency?: string;
}

/** تفصيل الطاقة والساعات والتجاوز قبل الحفظ (§8) */
export function capacityBreakdown(
  state: AppState,
  day: DialaDay,
  pump: Pump,
  extraMinutes = 0,
  ignoreUsageId: string | null = null
): CapacityBreakdown {
  const window = pumpWindow(pump, day);
  const usages = state.usages.filter(
    (u) => u.dayId === day.id && u.status === "active" && u.id !== ignoreUsageId
  );
  const usageTotalMin = usages.reduce((s, u) => s + u.minutes, 0) + extraMinutes;
  const plannedTotalMin = dayEntries(state, day.id)
    .filter((e) => e.status !== "cancelled")
    .reduce((s, e) => s + entryMinutes(e), 0);
  const stoppageMin = state.stoppages
    .filter((s) => s.dayId === day.id && !s.archived)
    .reduce((s, st) => s + st.minutes, 0);
  const effectiveMin = Math.max(0, window.capacityMin - stoppageMin);
  return {
    usageTotalMin,
    plannedTotalMin,
    capacityMin: window.capacityMin,
    stoppageMin,
    effectiveMin,
    overMin: Math.max(0, usageTotalMin - effectiveMin),
    over: usageTotalMin > effectiveMin + 1,
    overReasons: usages.map((u) => u.overCapacityReason).filter(Boolean),
    liters: Math.round(usages.reduce((s, u) => s + u.fuelLiters, 0) * 10) / 10,
    currency: pump.currency,
  };
}

/** تكلفة الديزل المحفوظة داخل العملية (Snapshot) */
export function usageFuelCost(u: ActualUsage): number {
  return Math.round(u.fuelCost ?? u.fuelAmountDue ?? 0);
}

/** هل سجّل المستخدم سعرًا شخصيًا لهذه العملية؟ */
export function hasPersonalFuelPrice(u: ActualUsage): boolean {
  return (u.personalFuelPriceSnapshot ?? 0) > 0;
}

/* ------------------ الدفعات والديون (§12, §13) ------------------------- */

export function debtsOf(state: AppState, personId: string): Debt[] {
  return state.debts
    .filter((d) => d.debtorId === personId && d.status !== "cancelled")
    .slice()
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

export function allDebts(state: AppState): Debt[] {
  return state.debts
    .filter((d) => d.status !== "cancelled")
    .slice()
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

export function openDebts(state: AppState): Debt[] {
  return allDebts(state).filter((d) => d.remainingAmount > 0);
}

export function debtRemaining(debt: Debt): number {
  return Math.max(0, Math.round((debt.amount || 0) - (debt.paidAmount || 0)));
}

/** حالة الدين من مبالغه — تُخزَّن أيضًا لتسهيل العرض */
export function debtStatusOf(debt: Debt): DebtStatus {
  if (debt.status === "cancelled") return "cancelled";
  const remaining = debtRemaining(debt);
  if (remaining <= 0) return "paid";
  if ((debt.paidAmount || 0) > 0) return "partially_paid";
  return "unpaid";
}

export function debtStatusLabel(s: DebtStatus): string {
  switch (s) {
    case "paid":
      return "مسدَّد";
    case "partially_paid":
      return "مسدَّد جزئيًا";
    case "cancelled":
      return "ملغى";
    default:
      return "غير مسدَّد";
  }
}

export function debtStatusTone(s: DebtStatus): "green" | "amber" | "red" | "gray" {
  switch (s) {
    case "paid":
      return "green";
    case "partially_paid":
      return "amber";
    case "cancelled":
      return "gray";
    default:
      return "red";
  }
}

export function paymentsOf(state: AppState, personId: string): Payment[] {
  return state.payments
    .filter((p) => p.personId === personId && p.status !== "void")
    .slice()
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

export function allPayments(state: AppState): Payment[] {
  return state.payments
    .filter((p) => p.status !== "void")
    .slice()
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

export function paymentsForDebt(state: AppState, debtId: string): Payment[] {
  return state.payments.filter(
    (p) => p.linkedOperationType === "debt" && p.linkedOperationId === debtId && p.status !== "void"
  );
}

export function paymentMethodLabel(m: PaymentMethod): string {
  switch (m) {
    case "cash":
      return "نقدًا";
    case "transfer":
      return "حوالة";
    case "credit_note":
      return "قيد";
    case "in_kind":
      return "عينيًا";
    default:
      return "أخرى";
  }
}

export function paymentTypeLabel(t: PaymentType): string {
  switch (t) {
    case "debt":
      return "سداد دين";
    case "fuel":
      return "ديزل";
    case "royalty":
      return "رواسة";
    case "attendants":
      return "أجور الرواس";
    case "rights":
      return "حق/تأجير";
    case "loan":
      return "سلفة";
    default:
      return "أخرى";
  }
}

export const PAYMENT_METHOD_OPTIONS: { id: PaymentMethod; label: string }[] = [
  { id: "cash", label: "نقدًا" },
  { id: "transfer", label: "حوالة" },
  { id: "credit_note", label: "قيد" },
  { id: "in_kind", label: "عينيًا" },
  { id: "other", label: "أخرى" },
];

export const PAYMENT_TYPE_OPTIONS: { id: PaymentType; label: string }[] = [
  { id: "debt", label: "سداد دين" },
  { id: "fuel", label: "ديزل" },
  { id: "royalty", label: "رواسة" },
  { id: "attendants", label: "أجور الرواس" },
  { id: "rights", label: "حق / تأجير" },
  { id: "loan", label: "سلفة" },
  { id: "other", label: "أخرى" },
];

export interface PersonMoneySummary {
  debtTotal: number;
  debtPaid: number;
  debtRemaining: number;
  openDebts: number;
  paidDebts: number;
  paymentsTotal: number;
  paymentsCount: number;
}

/** ملخص مالي من سجلات الديون والدفعات المستقلة */
export function personMoneySummary(state: AppState, personId: string): PersonMoneySummary {
  const debts = state.debts.filter((d) => d.debtorId === personId && d.status !== "cancelled");
  const payments = paymentsOf(state, personId);
  const debtTotal = debts.reduce((s, d) => s + (d.amount || 0), 0);
  const debtPaid = debts.reduce((s, d) => s + (d.paidAmount || 0), 0);
  return {
    debtTotal,
    debtPaid,
    debtRemaining: Math.max(0, debtTotal - debtPaid),
    openDebts: debts.filter((d) => debtRemaining(d) > 0).length,
    paidDebts: debts.filter((d) => debtRemaining(d) <= 0).length,
    paymentsTotal: payments.reduce((s, p) => s + (p.amount || 0), 0),
    paymentsCount: payments.length,
  };
}

/* ------------- السلف والإعارة والتحويل وتقديم الدور (§14) -------------- */

export function transferTypeLabel(t: TransferType): string {
  switch (t) {
    case "loan":
      return "إعارة ساعات (سلفت)";
    case "borrow":
      return "استلاف ساعات (تسلفت)";
    case "transfer":
      return "تحويل حق/ساعات";
    case "advance":
      return "ساعات مقدمة";
    case "postpone":
      return "تأخير الدور";
    case "gift":
      return "هبة";
    default:
      return "إعادة";
  }
}

export const TRANSFER_TYPE_OPTIONS: { id: TransferType; label: string }[] = [
  { id: "loan", label: "إعارة ساعات (سلفت)" },
  { id: "borrow", label: "استلاف ساعات (تسلفت)" },
  { id: "transfer", label: "تحويل حق / ساعات" },
  { id: "advance", label: "ساعات مقدمة" },
  { id: "postpone", label: "تأخير الدور" },
  { id: "gift", label: "هبة" },
  { id: "return", label: "إعادة ساعات" },
];

export function transferEventsOf(state: AppState, personId: string): TransferEvent[] {
  return state.transferEvents
    .filter((t) => t.fromPersonId === personId || t.toPersonId === personId)
    .slice()
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

export function allTransferEvents(state: AppState): TransferEvent[] {
  return state.transferEvents.slice().sort((a, b) => (a.date < b.date ? 1 : -1));
}

/** رصيد السلف/الاستلافات لشخص (بالدقائق) */
export function transferBalanceMinutes(state: AppState, personId: string): number {
  let balance = 0;
  for (const t of state.transferEvents) {
    if (t.status === "cancelled") continue;
    if (t.type === "loan" || t.type === "gift") {
      if (t.fromPersonId === personId) balance += t.minutes;
      if (t.toPersonId === personId) balance -= t.minutes;
    } else if (t.type === "borrow") {
      if (t.toPersonId === personId) balance -= t.minutes;
    } else {
      if (t.fromPersonId === personId) balance += t.minutes;
      if (t.toPersonId === personId) balance -= t.minutes;
    }
  }
  return Math.round(balance);
}

/* ------------------ التعارضات المحفوظة (§18) --------------------------- */

export type DetectedConflict = Omit<
  Conflict,
  | "id"
  | "status"
  | "createdAt"
  | "resolvedAt"
  | "resolvedBy"
  | "resolution"
  | "pumpId"
>;

/**
 * كشف التعارضات من البيانات الحالية: الرسمي مقابل الشخصي، التداخل، التجاوز، والتكرار.
 * الكشف لا يعدّل أي سجل — ينتج قائمة تُحفظ ثم تُحلّ يدويًا.
 */
export function detectConflicts(state: AppState): DetectedConflict[] {
  const pump = state.pump;
  const out: DetectedConflict[] = [];
  if (!pump) return out;

  for (const person of state.persons) {
    const comparison = comparePerson(state, person.id);
    for (const row of comparison.rows) {
      if (row.status === "matched" || row.status === "settled") continue;
      const officialUsageIds = row.dayId
        ? state.usages
            .filter((u) => u.dayId === row.dayId && u.personId === person.id && u.status === "active")
            .map((u) => u.id)
        : [];
      const personalIds = state.personalRecords
        .filter((p) => p.personId === person.id && p.date === row.date && !p.archived)
        .map((p) => p.id);
      out.push({
        type: "official_personal",
        key: `${person.id}|${row.date}|minutes`,
        dayId: row.dayId,
        personId: person.id,
        officialRecordId: officialUsageIds[0] ?? null,
        personalRecordId: personalIds[0] ?? null,
        officialValue: `${toHours(row.officialMinutes)} ساعة · ${row.officialAmount} مبلغ`,
        personalValue: `${toHours(row.personalMinutes)} ساعة · ${row.personalAmount} مبلغ`,
        difference: `${toHours(Math.abs(row.minutesDiff))} ساعة · ${Math.abs(row.amountDiff)} مبلغ`,
        differenceValue: row.minutesDiff,
        unit: "minutes",
        notes: "عرض فقط — لا يُعدَّل أي سجل تلقائيًا",
      });
    }
  }

  for (const day of state.days.filter((d) => !d.archived)) {
    const usages = state.usages.filter((u) => u.dayId === day.id && u.status === "active");
    const window = pumpWindow(pump, day);
    const anchor = timeToMinutes(window.start);
    for (let i = 0; i < usages.length; i++) {
      for (let j = i + 1; j < usages.length; j++) {
        const a = usages[i];
        const b = usages[j];
        const spanA = entryInterval(anchor, a.startTime, a.endTime, window.capacityMin);
        const spanB = entryInterval(anchor, b.startTime, b.endTime, window.capacityMin);
        const overlap = Math.round(rangesOverlap(spanA, spanB));
        if (overlap > 0) {
          out.push({
            type: "overlap",
            key: `${day.id}|overlap|${a.id}|${b.id}`,
            dayId: day.id,
            personId: a.personId,
            officialRecordId: a.id,
            personalRecordId: null,
            officialValue: `${personName(state, a.personId)}: ${a.startTime} → ${a.endTime}`,
            personalValue: `${personName(state, b.personId)}: ${b.startTime} → ${b.endTime}`,
            difference: `${overlap} دقيقة تداخل`,
            differenceValue: -overlap,
            unit: "minutes",
            notes: "تداخل بين استخدامين فعليين — لم يُحذف أي سجل",
          });
        }
      }
    }

    const usageTotal = usages.reduce((s, u) => s + u.minutes, 0);
    const stoppageMin = state.stoppages
      .filter((s) => s.dayId === day.id && !s.archived)
      .reduce((s, st) => s + st.minutes, 0);
    const effectiveMin = Math.max(0, window.capacityMin - stoppageMin);
    if (usageTotal > effectiveMin + 1) {
      out.push({
        type: "over_capacity",
        key: `${day.id}|capacity`,
        dayId: day.id,
        personId: null,
        officialRecordId: null,
        personalRecordId: null,
        officialValue: `ساعات المضخة المتاحة: ${toHours(effectiveMin)}`,
        personalValue: `إجمالي الاستخدام الفعلي: ${toHours(usageTotal)}`,
        difference: `${toHours(usageTotal - effectiveMin)} ساعة تجاوز`,
        differenceValue: -(usageTotal - effectiveMin),
        unit: "minutes",
        notes: "تجاوز موثّق — البيانات محفوظة كما هي",
      });
    }

    const byPerson = new Map<string, number>();
    for (const u of usages) byPerson.set(u.personId, (byPerson.get(u.personId) ?? 0) + 1);
    for (const [personId, count] of byPerson) {
      if (count > 1) {
        out.push({
          type: "duplicate",
          key: `${day.id}|dup|${personId}`,
          dayId: day.id,
          personId,
          officialRecordId: null,
          personalRecordId: null,
          officialValue: `${personName(state, personId)}: ${count} سجلات في نفس اليوم`,
          personalValue: "",
          difference: `${count - 1} سجل إضافي`,
          differenceValue: count - 1,
          unit: "count",
          notes: "تكرار محتمل — يبقى القرار للمسؤول",
        });
      }
    }
  }

  return out;
}

/**
 * دمج التعارضات المكتشفة مع المحفوظة: لا يُحذف أي تعارض سابق،
 * ولا يُعاد فتح تعارض حُلّ أو أُهمل (§18).
 */
export function mergeConflicts(
  existing: Conflict[],
  detected: DetectedConflict[],
  pumpId: string
): Conflict[] {
  const byKey = new Map(existing.map((c) => [c.key, c]));
  const at = new Date().toISOString();
  const out = existing.slice();
  for (const d of detected) {
    const prev = byKey.get(d.key);
    if (!prev) {
      const created: Conflict = {
        ...d,
        pumpId,
        id: uid("cf"),
        status: "open",
        createdAt: at,
        resolvedAt: "",
        resolvedBy: "",
        resolution: "",
      };
      out.push(created);
      byKey.set(d.key, created);
      continue;
    }
    if (prev.status === "resolved" || prev.status === "ignored") continue;
    const index = out.findIndex((c) => c.id === prev.id);
    if (index >= 0) {
      out[index] = {
        ...prev,
        officialValue: d.officialValue,
        personalValue: d.personalValue,
        difference: d.difference,
        differenceValue: d.differenceValue,
        officialRecordId: d.officialRecordId ?? prev.officialRecordId,
        personalRecordId: d.personalRecordId ?? prev.personalRecordId,
        notes: d.notes || prev.notes,
      };
    }
  }
  return out;
}

export function conflictsOf(state: AppState, personId: string): Conflict[] {
  return state.conflicts.filter((c) => c.personId === personId);
}

export function openConflicts(state: AppState): Conflict[] {
  return state.conflicts.filter((c) => c.status === "open" || c.status === "under_review");
}

export function conflictTypeLabel(t: ConflictKind): string {
  switch (t) {
    case "overlap":
      return "تداخل أوقات";
    case "over_capacity":
      return "تجاوز الساعات";
    case "duplicate":
      return "تكرار";
    case "official_personal":
      return "رسمي مقابل شخصي";
    default:
      return "علاقة غير مؤكدة";
  }
}

export function conflictStatusLabel(s: ConflictStatus): string {
  switch (s) {
    case "resolved":
      return "محلول";
    case "ignored":
      return "مُهمل";
    case "under_review":
      return "قيد المراجعة";
    default:
      return "قائم";
  }
}

export { rawDurationMin, timeInterval };
