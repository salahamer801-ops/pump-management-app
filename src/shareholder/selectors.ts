import type {
  DayContributor,
  ShareholderCycle,
  ShareholderPump,
  ShareholderState,
  ShareholderTurn,
} from "./types";
import { cycleDayDate } from "./calc";

export function activePumps(state: ShareholderState): ShareholderPump[] {
  return state.pumps.filter((p) => !p.archived);
}

export function activeCycles(state: ShareholderState): ShareholderCycle[] {
  return state.cycles.filter((c) => !c.archived);
}

export function findPump(state: ShareholderState, id: string): ShareholderPump | undefined {
  return state.pumps.find((p) => p.id === id);
}

export function findCycle(state: ShareholderState, id: string): ShareholderCycle | undefined {
  return state.cycles.find((c) => c.id === id);
}

export function turnsOfCycle(state: ShareholderState, cycleId: string): ShareholderTurn[] {
  return state.turns
    .filter((t) => t.cycleId === cycleId && !t.archived)
    .sort((a, b) => a.dayIndex - b.dayIndex);
}

export function turnsOfPump(state: ShareholderState, pumpId: string): ShareholderTurn[] {
  return state.turns.filter((t) => t.pumpId === pumpId && !t.archived);
}

export function dayContributors(
  state: ShareholderState,
  cycleId: string,
  dayIndex: number
): DayContributor[] {
  return state.dayContributors
    .filter((c) => c.cycleId === cycleId && c.dayIndex === dayIndex && !c.archived)
    .sort((a, b) => a.startTime.localeCompare(b.startTime));
}

export function dayFilledHours(
  state: ShareholderState,
  cycleId: string,
  dayIndex: number
): number {
  return state.dayContributors
    .filter((c) => c.cycleId === cycleId && c.dayIndex === dayIndex && !c.archived)
    .reduce((sum, c) => sum + (c.hours || 0), 0);
}

/** يوم الدياله الحالي (يبدأ من 1) لدورة معينة، أو null إذا انتهت/لم تبدأ */
export function currentDayOfCycle(cycle: ShareholderCycle): number | null {
  const start = new Date(cycle.startDate);
  start.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((today.getTime() - start.getTime()) / 86400000);
  const dayIndex = diff + 1;
  if (dayIndex < 1 || dayIndex > cycle.days) return null;
  return dayIndex;
}

export function cycleEndDate(cycle: ShareholderCycle): Date {
  return cycleDayDate(cycle.startDate, cycle.days);
}

export interface PumpSummary {
  pump: ShareholderPump;
  cycles: ShareholderCycle[];
  turns: ShareholderTurn[];
  dieselCost: number;
  dieselLiters: number;
  royaltyDue: number;
  royaltyPaid: number;
  lent: number; // لي (سلفت)
  borrowed: number; // علي (تسلفت)
}

export function pumpSummaries(state: ShareholderState): PumpSummary[] {
  return activePumps(state).map((pump) => {
    const cycles = activeCycles(state).filter((c) => c.pumpId === pump.id);
    const turns = state.turns.filter((t) => t.pumpId === pump.id && !t.archived);
    let dieselCost = 0;
    let dieselLiters = 0;
    let royaltyDue = 0;
    let royaltyPaid = 0;
    let lent = 0;
    let borrowed = 0;
    for (const t of turns) {
      dieselCost += t.dieselCost;
      dieselLiters += t.dieselLiters;
      royaltyDue += pump.royaltyCost;
      royaltyPaid += t.royaltyPaid ? pump.royaltyCost : 0;
      if (t.direction === "lend") lent += t.lendCost;
      if (t.direction === "borrow") borrowed += t.lendCost;
    }
    return {
      pump,
      cycles,
      turns,
      dieselCost,
      dieselLiters,
      royaltyDue,
      royaltyPaid,
      lent,
      borrowed,
    };
  });
}

export interface TurnView {
  turn: ShareholderTurn;
  pump: ShareholderPump | undefined;
  cycle: ShareholderCycle | undefined;
}

export function turnViews(state: ShareholderState): TurnView[] {
  return state.turns
    .filter((t) => !t.archived)
    .map((turn) => ({
      turn,
      pump: findPump(state, turn.pumpId),
      cycle: findCycle(state, turn.cycleId),
    }))
    .sort((a, b) => (a.turn.date < b.turn.date ? -1 : a.turn.date > b.turn.date ? 1 : 0));
}
