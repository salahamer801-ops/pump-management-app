/**
 * عرض اطلاعي (قراءة فقط) لبيانات المضخات المرتبطة بحساب المستخدم.
 * كل ما هنا يُقرأ من سجل المسؤول كما هو مسجَّل في المضخة — بلا أي تعديل أو كتابة.
 */
import type { Membership } from "../auth/types";
import type { AppState, DialaDay, DialaRound, DayEntry, Pump } from "../domain/types";
import {
  baseRosterCapacityMin,
  baseRosterTimeline,
  baseRosterTotalMin,
  dayByDate,
  dayEntries,
  dayNumberInRound,
  nextDialaDay,
  roundForDate,
  roundOfDay,
  type BaseRosterRow,
} from "../domain/rules";
import { localManagerStates, readManagerState } from "../domain/storage";
import { todayISO } from "../domain/util";

export interface MyTurn {
  entry: DayEntry;
  day: DialaDay;
}

export interface PumpMeta {
  pumpId: string;
  pumpCode: string;
  pumpName: string;
  managerName: string | null;
  /** مضخة محفوظة على هذا الجهاز بلا عضوية معتمدة من الخادم */
  localOnly?: boolean;
}

export interface LinkedPumpView extends PumpMeta {
  /** هل بيانات تشغيل هذه المضخة محفوظة على هذا الجهاز؟ */
  hasLocalData: boolean;
  pump: Pump | null;
  round: DialaRound | null;
  totalDays: number;
  /** رقم اليوم الحالي داخل الديالة (1..عدد الأيام) */
  dayNumber: number | null;
  roundStatus: "before" | "inside" | "after" | "none";
  todayDay: DialaDay | null;
  nextDay: DialaDay | null;
  /** الدوام الأساسي (الكشف) */
  baseRows: BaseRosterRow[];
  baseMinutes: number;
  capacityMinutes: number;
  rosterLocked: boolean;
  myBase: BaseRosterRow | null;
  baseBeforeMe: number;
  /** الدوام الفعلي لليوم */
  actualRows: DayEntry[];
  actualDone: number;
  myActual: DayEntry | null;
  myActualIndex: number;
  /** أقرب دور لي كما هو مسجَّل في المضخة */
  nextTurn: MyTurn | null;
  todayTurn: MyTurn | null;
  lastTurn: MyTurn | null;
  state: AppState | null;
}

export function buildLinkedPumpView(m: Membership, personId: string | null): LinkedPumpView {
  const state = readManagerState(m.pumpId);
  /**
   * ربط الحساب بشخصه: الرمز المحلي إن وُجد، وإلا فالاسم المسجَّل في العضوية المعتمدة
   * على الخادم — فيرى المستخدم نصيبه ودوره من أي جهاز.
   */
  const wanted = m.personName?.trim() ?? "";
  const nameOfRow = (row: unknown) => {
    const v = (row as { personName?: unknown }).personName;
    return typeof v === "string" ? v.trim() : "";
  };
  const personByName =
    state && wanted ? state.persons.find((p) => !p.archived && p.name.trim() === wanted) : undefined;
  const rosterRow =
    state && wanted
      ? state.roster.find((r) => !r.archived && nameOfRow(r) === wanted) ?? null
      : null;
  const linked =
    personId ??
    personByName?.id ??
    (rosterRow ? (rosterRow.personId || null) : null);
  return viewFromState(
    {
      pumpId: m.pumpId,
      pumpCode: m.pumpCode,
      pumpName: m.pumpName ?? m.personName ?? "مضخة",
      managerName: m.managerName ?? null,
    },
    state,
    linked
  );
}

export function viewFromState(
  meta: PumpMeta,
  state: AppState | null,
  personId: string | null
): LinkedPumpView {
  const today = todayISO();
  const empty: LinkedPumpView = {
    ...meta,
    hasLocalData: Boolean(state),
    pump: state?.pump ?? null,
    round: null,
    totalDays: 0,
    dayNumber: null,
    roundStatus: "none",
    todayDay: null,
    nextDay: null,
    baseRows: [],
    baseMinutes: 0,
    capacityMinutes: 0,
    rosterLocked: false,
    myBase: null,
    baseBeforeMe: 0,
    actualRows: [],
    actualDone: 0,
    myActual: null,
    myActualIndex: -1,
    nextTurn: null,
    todayTurn: null,
    lastTurn: null,
    state,
  };
  if (!state || !state.pump) return empty;

  const pump = state.pump;
  const todayDay = dayByDate(state, today);
  const round =
    (todayDay ? roundOfDay(state, todayDay) : null) ??
    roundForDate(state, today) ??
    state.rounds
      .filter((r) => !r.archived)
      .slice()
      .sort((a, b) => b.number - a.number)[0] ??
    null;

  let roundStatus: LinkedPumpView["roundStatus"] = "none";
  let dayNumber: number | null = null;
  if (round) {
    if (today < round.startDate) roundStatus = "before";
    else if (today > round.endDate) roundStatus = "after";
    else roundStatus = "inside";
    if (todayDay) dayNumber = dayNumberInRound(state, todayDay);
    else {
      const start = new Date(`${round.startDate}T00:00:00`);
      const now = new Date(`${today}T00:00:00`);
      const diff = Math.round((now.getTime() - start.getTime()) / 86400000) + 1;
      dayNumber = diff >= 1 && diff <= round.days ? diff : null;
    }
  }

  const baseRows = round ? baseRosterTimeline(state, pump, round.id) : [];
  const mine = personId ? baseRows.find((r) => r.personId === personId) ?? null : null;
  const actualRows = todayDay ? dayEntries(state, todayDay.id) : [];
  const myActualIndex = personId
    ? actualRows.findIndex((e) => e.personId === personId || e.actualPersonId === personId)
    : -1;

  /* أدواري كما سجّلها المسؤول: اليوم، ثم الأقرب قادمًا، ثم آخر دور مضى */
  const daysById = new Map(state.days.map((d) => [d.id, d]));
  const myDays = personId
    ? state.entries
        .filter(
          (e) =>
            !e.archived &&
            (e.personId === personId || e.actualPersonId === personId) &&
            daysById.has(e.dayId) &&
            !daysById.get(e.dayId)!.archived
        )
        .map((e) => ({ entry: e, day: daysById.get(e.dayId)! }))
        .sort((a, b) => (a.day.date === b.day.date ? a.entry.orderIndex - b.entry.orderIndex : a.day.date < b.day.date ? -1 : 1))
    : [];

  const todayTurn = myDays.find((x) => x.day.date === today) ?? null;
  const nextTurn =
    myDays.find((x) => x.day.date > today && x.entry.status !== "cancelled") ?? null;
  const lastTurn =
    myDays
      .filter((x) => x.day.date < today)
      .slice()
      .reverse()
      .find(() => true) ?? null;

  return {
    ...empty,
    hasLocalData: true,
    pump,
    round,
    totalDays: round?.days ?? 0,
    dayNumber,
    roundStatus,
    todayDay,
    nextDay: nextDialaDay(state),
    baseRows,
    baseMinutes: round ? baseRosterTotalMin(state, round.id) : 0,
    capacityMinutes: baseRosterCapacityMin(pump),
    rosterLocked: Boolean(round?.rosterLocked),
    myBase: mine,
    baseBeforeMe: mine ? mine.order : 0,
    actualRows,
    actualDone: actualRows.filter((e) => e.status === "done").length,
    myActual: myActualIndex >= 0 ? actualRows[myActualIndex] : null,
    myActualIndex,
    nextTurn,
    todayTurn,
    lastTurn,
  };
}

/** مضخات الوضع المحلي: سجلات محفوظة على هذا الجهاز دون عضوية معتمدة */
export function localPumpViews(personId: string | null, excludeIds: string[] = []): LinkedPumpView[] {
  const skip = new Set(excludeIds);
  const out: LinkedPumpView[] = [];
  for (const st of localManagerStates()) {
    const pump = st.pump;
    if (!pump || skip.has(pump.id)) continue;
    out.push(
      viewFromState(
        {
          pumpId: pump.id,
          pumpCode: pump.pumpCode ?? "—",
          pumpName: pump.name,
          managerName: null,
          localOnly: true,
        },
        st,
        personId
      )
    );
  }
  return out;
}

/** كل المضخات التي وافق المسؤول على ارتباطي بها */
export function approvedMemberships(memberships: Membership[]): Membership[] {
  return memberships.filter((m) => m.status === "approved");
}

export function linkedPumpViews(
  memberships: Membership[],
  personId: string | null
): LinkedPumpView[] {
  return approvedMemberships(memberships).map((m) => buildLinkedPumpView(m, personId));
}

/** أقرب دور لي بين كل المضخات المرتبطة */
export function nearestTurnAcross(views: LinkedPumpView[]): { view: LinkedPumpView; turn: MyTurn } | null {
  const candidates: { view: LinkedPumpView; turn: MyTurn; date: string }[] = [];
  for (const v of views) {
    if (v.todayTurn) candidates.push({ view: v, turn: v.todayTurn, date: v.todayTurn.day.date });
    if (v.nextTurn) candidates.push({ view: v, turn: v.nextTurn, date: v.nextTurn.day.date });
  }
  candidates.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return candidates.length ? { view: candidates[0].view, turn: candidates[0].turn } : null;
}
