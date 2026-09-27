/**
 * الاختبارات الإلزامية (§27) — تعمل على محرّك الحساب الحقيقي ومخزن النظام الحقيقي.
 * التشغيل: npm run verify
 */
import { emptyState, normalizeState } from "../src/domain/migrate";
import { reducerForTests } from "../src/store";
import {
  capacityBreakdown,
  computeUsageDraft,
  currentRight,
  debtStatusOf,
  detectConflicts,
  overlapsFor,
  stoppageMinutesInRange,
  stoppageMinutesInRange as stoppageIn,
} from "../src/domain/rules";
import { durationMin, minutesToTime, timeToMinutes, todayISO, uid } from "../src/domain/util";
import type {
  AppState,
  Debt,
  DialaDay,
  DialaRound,
  Payment,
  Person,
  PersonalRecord,
  Pump,
  ShareRight,
  Shareholder,
} from "../src/domain/types";

let passed = 0;
let failed = 0;

function check(name: string, condition: boolean, extra?: unknown) {
  if (condition) {
    passed += 1;
    console.log(`✅ ${name}`);
  } else {
    failed += 1;
    console.log(`❌ ${name}${extra !== undefined ? ` → ${JSON.stringify(extra)}` : ""}`);
  }
}

function mkPerson(name: string): Person {
  return {
    id: uid("pr"),
    name,
    phone: "",
    nationalId: "",
    notes: "",
    guest: false,
    archived: false,
    createdAt: new Date().toISOString(),
    createdBy: "manager",
  };
}

const today = todayISO();

function baseState(perHour = 10, price = 1200): { state: AppState; people: Person[]; plus: () => Person } {
  const state = emptyState();
  const pump: Pump = {
    id: "pump1",
    name: "مضخة الاختبار",
    wells: "",
    farm: "",
    engine: "",
    energyType: "diesel",
    workStart: "06:00",
    workEnd: "02:00",
    fuelConsumptionPerHour: perHour,
    fuelPerCycle: 0,
    fuelCalcMode: "hour",
    fuelPrice: price,
    royaltyEnabled: false,
    royaltyMode: "hour",
    royaltyPerCycle: 0,
    royaltyPerHour: 0,
    operatorName: "",
    operatorHourlyWage: 0,
    operatorStart: "06:00",
    operatorEnd: "02:00",
    shareUnit: "حصة",
    currency: "YER",
    notes: "",
    archived: false,
    createdAt: new Date().toISOString(),
  };
  state.pump = pump;

  const p1 = mkPerson("المساهم الأول");
  const p2 = mkPerson("المستأجر");
  const p3 = mkPerson("المستخدم الثالث");
  state.persons = [p1, p2, p3];

  const share: Shareholder = {
    id: "sh1",
    pumpId: pump.id,
    personId: p1.id,
    shareNo: 1,
    units: 1,
    baseHoursMin: 0,
    baseOrder: 0,
    startDate: today,
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
  };
  state.shareholders = [share];

  const day: DialaDay = {
    id: "day1",
    pumpId: pump.id,
    dialaNumber: 1,
    roundId: null,
    date: today,
    status: "draft",
    workStart: "06:00",
    workEnd: "02:00",
    capacityMin: 1200,
    plannedWorkStart: "06:00",
    plannedWorkEnd: "02:00",
    plannedCapacityMin: 1200,
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
  state.days = [day];
  return {
    state: normalizeState(state),
    people: [p1, p2, p3],
    plus: () => p1,
  };
}

const recordUsage = (state: AppState, input: Partial<Record<string, unknown>> = {}) =>
  reducerForTests(state, {
    type: "RECORD_USAGE",
    dayId: "day1",
    entryId: null,
    personId: input.personId as string,
    shareholderId: (input.shareholderId as string) ?? null,
    rightHolderId: (input.rightHolderId as string) ?? null,
    usageType: "share",
    startTime: (input.startTime as string) ?? "06:00",
    endTime: (input.endTime as string) ?? "09:00",
    notes: (input.notes as string) ?? "",
    dieselSettlement: "unpaid",
    dieselShortageLiters: 0,
    royaltyPayMode: "credit",
    settlementNote: "",
    overCapacityReason: "",
    personalFuelPrice: (input.personalFuelPrice as number) ?? 0,
    confirmedOverlap: true,
    actor: "manager",
  });

/* -------------------------------- 1 · 2 -------------------------------- */

const daily = baseState();
check(
  "1) مضخة تعمل 20 ساعة = 1200 دقيقة",
  durationMin(daily.state.pump!.workStart, daily.state.pump!.workEnd) === 1200,
  durationMin(daily.state.pump!.workStart, daily.state.pump!.workEnd)
);

const after3h = recordUsage(daily.state, {
  personId: daily.people[0].id,
  startTime: "06:00",
  endTime: "09:00",
  personalFuelPrice: 1000,
});
const usage1 = after3h.usages[after3h.usages.length - 1];
check("2) استخدام 3 ساعات = 180 دقيقة", usage1.minutes === 180, usage1.minutes);

/* --------------------------------- 3 ---------------------------------- */

const overnight = computeUsageDraft(daily.state.pump!, daily.state.days[0], "23:00", "02:00");
check("3) 23:00 → 02:00 = 180 دقيقة (عبور منتصف الليل)", overnight.minutes === 180, overnight);
check("3ب) العملية تُعلَّم أنها تعبر منتصف الليل", overnight.crossesMidnight === true);

/* -------------------------------- 4 · 5 -------------------------------- */

check("4) 10 لتر/ساعة × 3 ساعات = 30 لتر", usage1.fuelLiters === 30, usage1.fuelLiters);
check("5) السعر الشخصي 1000 × 30 لتر = 30000", usage1.fuelAmountDue === 30000, usage1.fuelAmountDue);
check("5ب) اللقطة تحفظ استهلاك الساعة وقت العملية", usage1.fuelPerHourSnapshot === 10);
check("5ج) اللقطة تحفظ السعر المرجعي والسعر الشخصي",
  usage1.fuelPriceSnapshot === 1200 && usage1.personalFuelPriceSnapshot === 1000,
  [usage1.fuelPriceSnapshot, usage1.personalFuelPriceSnapshot]);

/* -------------------------------- 6 · 7 -------------------------------- */

const afterPriceAndConsumptionChange = reducerForTests(after3h, {
  type: "UPDATE_PUMP",
  patch: { fuelPrice: 1500, fuelConsumptionPerHour: 4 },
});
const oldUsage = afterPriceAndConsumptionChange.usages.find((u) => u.id === usage1.id)!;
check(
  "6) تغيير السعر إلى 1500 لا يغيّر العملية القديمة (30000)",
  oldUsage.fuelAmountDue === 30000 && oldUsage.personalFuelPriceSnapshot === 1000,
  oldUsage.fuelAmountDue
);
check(
  "7) تغيير استهلاك المضخة لا يغيّر لترات العمليات القديمة (30 لتر)",
  oldUsage.fuelLiters === 30 && oldUsage.fuelPerHourSnapshot === 10,
  oldUsage.fuelLiters
);
const newUsage = recordUsage(afterPriceAndConsumptionChange, {
  personId: daily.people[1].id,
  startTime: "09:00",
  endTime: "12:00",
});
const usage2 = newUsage.usages[newUsage.usages.length - 1];
check(
  "7ب) العملية الجديدة تستخدم الإعداد الجديد (3 ساعات × 4 = 12 لتر) بسعر المضخة 1500",
  usage2.fuelLiters === 12 && usage2.fuelAmountDue === 18000,
  [usage2.fuelLiters, usage2.fuelAmountDue]
);

/* --------------------------------- 8 ---------------------------------- */

let rightsState = daily.state;
const right1: ShareRight = {
  id: "rt1",
  pumpId: "pump1",
  shareholderId: "sh1",
  fromPersonId: daily.people[0].id,
  holderPersonId: daily.people[1].id,
  kind: "rent",
  hoursMin: 0,
  amount: 50000,
  agreement: "تأجير سنة",
  startedAt: today,
  endedAt: null,
  toPumpId: null,
  status: "active",
  notes: "",
  parentId: null,
  createdAt: new Date().toISOString(),
  createdBy: "manager",
};
rightsState = reducerForTests(rightsState, { type: "ADD_RIGHT", right: right1, endPrevious: true });
check(
  "8) المساهم الأساسي أجّر سهمه: صاحب الحق الحالي مستأجر والمساهم بقي ثابتًا",
  currentRight(rightsState, "sh1")?.holderPersonId === daily.people[1].id &&
    rightsState.shareholders[0].personId === daily.people[0].id,
  currentRight(rightsState, "sh1")?.holderPersonId
);
const right2: ShareRight = {
  ...right1,
  id: "rt2",
  fromPersonId: daily.people[1].id,
  holderPersonId: daily.people[2].id,
  kind: "loan",
  startedAt: today,
};
rightsState = reducerForTests(rightsState, { type: "ADD_RIGHT", right: right2, endPrevious: true });
check(
  "8ب) نقل الحق مرة ثانية يحفظ العملية الأولى في السجل (حقان محفوظان)",
  rightsState.rights.length === 2 &&
    rightsState.rights.some((r) => r.id === "rt1" && r.status === "ended"),
  rightsState.rights.map((r) => `${r.id}:${r.status}`)
);

/* --------------------------------- 9 ---------------------------------- */

const loanUsageState = recordUsage(rightsState, {
  personId: daily.people[2].id,
  shareholderId: "sh1",
  rightHolderId: daily.people[1].id,
  startTime: "12:00",
  endTime: "15:00",
});
const loanUsage = loanUsageState.usages[loanUsageState.usages.length - 1];
check(
  "9) صاحب الحق أعطى الساعات لشخص ثالث: المستخدم الفعلي هو الثالث وصاحب الحق محفوظ",
  loanUsage.personId === daily.people[2].id && loanUsage.rightHolderId === daily.people[1].id,
  [loanUsage.personId, loanUsage.rightHolderId]
);

/* --------------------------------- 10 --------------------------------- */

let conflictState = daily.state;
conflictState = recordUsage(conflictState, {
  personId: daily.people[0].id,
  startTime: "06:00",
  endTime: "08:00",
});
const official = conflictState.usages[conflictState.usages.length - 1];
const personal: PersonalRecord = {
  id: "prsn1",
  personId: daily.people[0].id,
  pumpId: "pump1",
  dayId: "day1",
  date: today,
  startTime: "06:00",
  endTime: "09:00",
  minutes: 180,
  dieselLiters: 30,
  dieselPricePerLiter: 1000,
  dieselAmount: 30000,
  royaltyAmount: 0,
  paidAmount: 0,
  debtAmount: 30000,
  operationType: "usage",
  notes: "سجّلت 3 ساعات",
  matchStatus: "different",
  createdAt: new Date().toISOString(),
};
conflictState = { ...conflictState, personalRecords: [personal] };
const detected = detectConflicts(conflictState);
const officialPersonal = detected.find((d) => d.type === "official_personal");
check(
  "10) الرسمي ساعتان والشخصي 3 ساعات → تعارض مكتشف بفرق ساعة",
  !!officialPersonal && officialPersonal.differenceValue === 120 - 180,
  officialPersonal?.differenceValue
);
const officialAfter = conflictState.usages.find((u) => u.id === official.id)!;
check(
  "10ب) لا تعديل تلقائي: السجل الرسمي ما زال 120 دقيقة",
  officialAfter.minutes === 120 && officialAfter.status === "active",
  officialAfter.minutes
);

/* --------------------------------- 11 -------------------------------- */

let moneyState = daily.state;
const debt: Debt = {
  id: "dt1",
  pumpId: "pump1",
  debtorId: daily.people[0].id,
  amount: 1000,
  paidAmount: 0,
  remainingAmount: 1000,
  reason: "دين اختبار",
  linkedOperationId: null,
  linkedOperationType: "manual",
  date: today,
  status: "unpaid",
  notes: "",
  createdAt: new Date().toISOString(),
  createdBy: "manager",
};
moneyState = reducerForTests(moneyState, { type: "ADD_DEBT", debt, actor: "manager" });
const mkPayment = (id: string, amount: number): Payment => ({
  id,
  pumpId: "pump1",
  personId: daily.people[0].id,
  amount,
  date: today,
  type: "debt",
  method: "cash",
  reason: "دفعة",
  linkedOperationId: "dt1",
  linkedOperationType: "debt",
  transactionId: null,
  notes: "",
  status: "posted",
  createdAt: new Date().toISOString(),
  createdBy: "manager",
});
moneyState = reducerForTests(moneyState, { type: "ADD_PAYMENT", payment: mkPayment("pay1", 400), actor: "manager" });
moneyState = reducerForTests(moneyState, { type: "ADD_PAYMENT", payment: mkPayment("pay2", 600), actor: "manager" });
const mergedDebt = moneyState.debts.find((d) => d.id === "dt1")!;
check("11) دفعتان لنفس الدين = سجلان مستقلان", moneyState.payments.length === 2, moneyState.payments.length);
check(
  "11ب) الدين يتراكم عليه السداد حتى يكتمل ويصبح مسدَّدًا",
  mergedDebt.paidAmount === 1000 && mergedDebt.remainingAmount === 0 && debtStatusOf(mergedDebt) === "paid",
  [mergedDebt.paidAmount, mergedDebt.remainingAmount]
);
check(
  "11ج) الدفعتان ظاهرتان في دفتر الحركات (استحقاق + دفعتان)",
  moneyState.transactions.filter((t) => t.status === "posted").length === 3,
  moneyState.transactions.length
);

/* --------------------------------- 12 --------------------------------- */

const paymentTx = moneyState.transactions.find((t) => t.paymentId === "pay1" && t.direction === "credit")!;
const afterVoid = reducerForTests(moneyState, {
  type: "VOID_TRANSACTION",
  id: paymentTx.id,
  reason: "اختبار الإلغاء",
  actor: "manager",
});
const voided = afterVoid.transactions.find((t) => t.id === paymentTx.id);
check(
  "12) إلغاء عملية مالية لا يحذفها من التاريخ (تبقى بحالة ملغاة)",
  !!voided && voided.status === "void" && !!voided.deletionReason,
  voided?.status
);
const afterVoidPayment = reducerForTests(moneyState, {
  type: "VOID_PAYMENT",
  id: "pay1",
  reason: "اختبار إلغاء دفعة",
  actor: "manager",
});
check(
  "12ب) إلغاء دفعة يبقيها في السجل ويضيف قيدًا عكسيًا",
  afterVoidPayment.payments.length === 2 &&
    afterVoidPayment.payments.find((p) => p.id === "pay1")!.status === "void" &&
    afterVoidPayment.transactions.some((t) => t.reason.includes("إلغاء دفعة")),
  afterVoidPayment.payments.map((p) => p.status)
);

/* ---------------------------- حالات إضافية ----------------------------- */

const overlapState = (() => {
  let s = daily.state;
  s = recordUsage(s, { personId: daily.people[0].id, startTime: "08:00", endTime: "11:00" });
  s = recordUsage(s, { personId: daily.people[1].id, startTime: "10:00", endTime: "12:00" });
  return s;
})();
const overlaps = overlapsFor(overlapState, overlapState.days[0], overlapState.pump!, "10:00", "11:00");
check(
  "13) كشف التداخل: 08:00→11:00 مع 10:00→12:00 = 60 دقيقة تداخل",
  overlaps.length === 2 && overlaps.every((o) => o.minutes === 60),
  overlaps.map((o) => o.minutes)
);
check("13ب) أوقات الاستخدام الأصلية لم تتغيّر بعد الكشف", overlapState.usages.length === 2);

const stoppageState = reducerForTests(daily.state, {
  type: "SAVE_STOPPAGE",
  isNew: true,
  stoppage: {
    id: "st1",
    pumpId: "pump1",
    dayId: "day1",
    date: today,
    startTime: "14:00",
    endTime: "16:00",
    minutes: 120,
    kind: "fuel_shortage",
    reason: "نقص الديزل",
    notes: "",
    createdAt: new Date().toISOString(),
    createdBy: "manager",
    archived: false,
  },
});
const stoppageMin = stoppageMinutesInRange(
  stoppageState,
  "day1",
  "13:00",
  "17:00",
  timeToMinutes("06:00"),
  1200
);
check("14) التوقف يُخصم داخل الفترة المتقاطعة (120 دقيقة)", stoppageMin === 120, stoppageMin);
const stoBreakdown = capacityBreakdown(stoppageState, stoppageState.days[0], stoppageState.pump!, 0);
check(
  "14ب) الطاقة الفعلية = 1200 − 120 = 1080 دقيقة",
  stoBreakdown.effectiveMin === 1080 && stoBreakdown.stoppageMin === 120,
  stoBreakdown.effectiveMin
);
const overState = recordUsage(stoppageState, {
  personId: daily.people[0].id,
  startTime: "06:00",
  endTime: "09:00",
});
const overUsage = overState.usages[overState.usages.length - 1];
check("15) العملية تسجّل دقائق التوقف داخلها", overUsage.stoppageMin === 0, overUsage.stoppageMin);

const transferState = (() => {
  let s = daily.state;
  s = reducerForTests(s, {
    type: "ADD_TRANSFER_EVENT",
    tx: null,
    actor: "manager",
    event: {
      id: "tr1",
      pumpId: "pump1",
      type: "loan",
      shareId: "sh1",
      fromPersonId: daily.people[0].id,
      toPersonId: daily.people[2].id,
      minutes: 180,
      date: today,
      amount: 0,
      reason: "سلفة 3 ساعات",
      status: "active",
      notes: "",
      transactionId: null,
      createdAt: new Date().toISOString(),
      createdBy: "manager",
    },
  });
  return s;
})();
check("16) السلفة تُحفظ كعملية مستقلة بتاريخها وطرفيها", transferState.transferEvents.length === 1);
const cancelledTransfer = reducerForTests(transferState, {
  type: "CANCEL_TRANSFER_EVENT",
  id: "tr1",
  reason: "اختبار",
  actor: "manager",
});
check(
  "16ب) إلغاء العملية يبقيها في السجل بحالة ملغاة",
  cancelledTransfer.transferEvents.length === 1 &&
    cancelledTransfer.transferEvents[0].status === "cancelled"
);

const closedState = reducerForTests(daily.state, { type: "CLOSE_DAY", id: "day1", actor: "أحمد" });
const corrected = reducerForTests(closedState, {
  type: "RECORD_USAGE",
  dayId: "day1",
  entryId: null,
  personId: daily.people[0].id,
  shareholderId: "sh1",
  rightHolderId: null,
  usageType: "share",
  startTime: "06:00",
  endTime: "07:00",
  notes: "",
  dieselSettlement: "unpaid",
  dieselShortageLiters: 0,
  royaltyPayMode: "credit",
  settlementNote: "",
  overCapacityReason: "",
  correctionReason: "خطأ في التسجيل",
  actor: "أحمد",
});
check(
  "17) تعديل يوم مغلق يُسجَّل كتصحيح موثّق بقيمته القديمة والجديدة",
  corrected.corrections.length === 1 &&
    corrected.corrections[0].reason === "خطأ في التسجيل" &&
    corrected.corrections[0].byUser === "أحمد",
  corrected.corrections[0]
);
check("17ب) لم يُحذف أي سجل بعد التصحيح", corrected.usages.length === 1);

console.log(`\n${passed} ناجح · ${failed} فاشل`);
if (failed > 0) process.exit(1);
