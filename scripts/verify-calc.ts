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
  daySettlementTotals,
  dayTimeline,
  debtStatusOf,
  detectConflicts,
  dieselPaidPartOf,
  fuelCostFor,
  fuelLitersFor,
  nextAvailableStart,
  overlapsFor,
  royaltyCashPartOf,
  royaltyDeferredPartOf,
  scheduleConflicts,
  settlementPostings,
  stoppageMinutesInRange,
  stoppageMinutesInRange as stoppageIn,
} from "../src/domain/rules";
import { durationMin, formatTimeAmPm, formatTimeRange, minutesToTime, timeToMinutes, todayISO, uid } from "../src/domain/util";
import {
  formatRelativeAr,
  isStaleSince,
  lastUpdateLabel,
  myNotifications,
  unreadNotifications,
} from "../src/domain/syncStatus";
import { applyPayload, payloadFromState } from "../src/domain/serverSync";
import { mergeReadIds } from "../src/shareholder/officialSync";
import { urlBase64ToUint8Array } from "../src/shareholder/push";
import { newNotifications, pushEndpointProblem } from "../server/src/push-payload.js";
import {
  contactPhone,
  isValidLinkCode,
  newLinkCode,
  samePhone,
  startPayload,
} from "../server/src/telegram-payload.js";
import {
  codeShapeProblem,
  cooldownLeft,
  dailyLimitHit,
  newOtpCode,
  newTicket,
} from "../server/src/otp-payload.js";
import type {
  AppState,
  BaseRosterMember,
  Debt,
  DialaDay,
  DieselSettlement,
  RoyaltyPayMode,
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
    dieselSettlement: (input.dieselSettlement as DieselSettlement) ?? "unpaid",
    dieselShortageLiters: (input.dieselShortageLiters as number) ?? 0,
    dieselPaidAmount: (input.dieselPaidAmount as number) ?? 0,
    royaltyPayMode: (input.royaltyPayMode as RoyaltyPayMode) ?? "credit",
    royaltyCashAmount: (input.royaltyCashAmount as number) ?? 0,
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

/* ----------------- 18) الترتيب الزمني ومنع التعارض في المخزن ---------------- */

/** صف مشارك في اليوم الفعلي */
function mkEntry(id: string, personId: string, startTime: string, endTime: string) {
  return {
    id,
    dayId: "day1",
    pumpId: "pump1",
    orderIndex: 0,
    personId,
    role: "shareholder" as const,
    shareholderId: null,
    rightId: null,
    startTime,
    endTime,
    plannedMin: durationMin(startTime, endTime),
    actualPersonId: null,
    usageId: null,
    status: "planned" as const,
    postponeToDayId: null,
    reason: "",
    notes: "",
    createdAt: new Date().toISOString(),
    createdBy: "manager",
    archived: false,
  };
}

const first = reducerForTests(daily.state, {
  type: "SAVE_ENTRY",
  isNew: true,
  entry: mkEntry("e1", daily.people[0].id, "06:00", "09:00"),
});
check("18) صف مشارك داخل نافذة التشغيل يُقبل", first.entries.length === 1, first.entries.length);

const overlapped = reducerForTests(first, {
  type: "SAVE_ENTRY",
  isNew: true,
  entry: mkEntry("e2", daily.people[1].id, "08:00", "11:00"),
});
check(
  "18ب) صف متداخل مع مشارك آخر يُرفض ولا يُحفظ",
  overlapped.entries.length === 1 && !overlapped.entries.some((e) => e.id === "e2"),
  overlapped.entries.length
);

const outsideWindow = reducerForTests(first, {
  type: "SAVE_ENTRY",
  isNew: true,
  entry: mkEntry("e3", daily.people[1].id, "03:00", "05:00"),
});
check(
  "18ج) صف خارج نافذة تشغيل اليوم يُرفض",
  outsideWindow.entries.length === 1 && !outsideWindow.entries.some((e) => e.id === "e3")
);

const zeroSpan = reducerForTests(first, {
  type: "SAVE_ENTRY",
  isNew: true,
  entry: { ...mkEntry("e4", daily.people[1].id, "", ""), plannedMin: 0 },
});
check("18د) صف بمدة صفرية يُرفض", zeroSpan.entries.length === 1);

const second = reducerForTests(first, {
  type: "SAVE_ENTRY",
  isNew: true,
  entry: mkEntry("e5", daily.people[2].id, "09:00", "12:00"),
});
check("19) الصف التالي يبدأ من نهاية المشارك السابق", second.entries.length === 2);
check(
  "19ب) البداية المقترحة = نهاية آخر مشارك (12:00)",
  nextAvailableStart(second, second.days[0], second.pump!) === "12:00",
  nextAvailableStart(second, second.days[0], second.pump!)
);

const timeline = dayTimeline(second, second.days[0], second.pump!);
check(
  "19ج) الشريط الزمني: الموزَّع 360 دقيقة والمتبقي 840",
  timeline.distributedMin === 360 && timeline.remainingMin === 840,
  { distributed: timeline.distributedMin, remaining: timeline.remainingMin }
);
check(
  "19د) الفراغ الزمني القادم يبدأ من 12:00",
  timeline.nextGap?.startTime === "12:00",
  timeline.nextGap
);
check(
  "19هـ) الصفوف مرتبة زمنيًا (لا ترتيب يدوي)",
  second.entries.length === 2 && second.entries[0].startTime === "06:00"
);

const conflicts = scheduleConflicts(second, second.days[0], second.pump!, {
  startTime: "07:00",
  endTime: "10:00",
  personId: daily.people[1].id,
});
check(
  "19و) محرّك التعارض يعطي تداخلًا مع وقت بديل مقترح",
  conflicts.some((c) => c.kind === "overlap" && c.suggestedStart === "09:00") ||
    conflicts.some((c) => c.kind === "overlap" && Boolean(c.suggestedStart)),
  conflicts.map((c) => `${c.kind}:${c.message}`)
);

/* ------------------ 20) لا حجز تلقائي لساعات اليوم من الكشف --------------- */

const withRoster: AppState = {
  ...daily.state,
  rounds: [
    {
      ...daily.state.rounds[0],
      id: "r1",
      pumpId: "pump1",
      number: 1,
      startDate: today,
      endDate: today,
      days: 5,
      locked: false,
      rosterLocked: false,
      status: "open",
      notes: "",
      archived: false,
    },
  ],
  roster: [
    {
      id: "rm1",
      pumpId: "pump1",
      roundId: "r1",
      personId: daily.people[0].id,
      shareMin: 180,
      order: 0,
      role: "shareholder",
      notes: "",
      archived: false,
      createdAt: new Date().toISOString(),
      createdBy: "manager",
    },
    {
      id: "rm2",
      pumpId: "pump1",
      roundId: "r1",
      personId: daily.people[1].id,
      shareMin: 180,
      order: 1,
      role: "shareholder",
      notes: "",
      archived: false,
      createdAt: new Date().toISOString(),
      createdBy: "manager",
    },
  ] as BaseRosterMember[],
};
const createdDay = reducerForTests(withRoster, {
  type: "CREATE_DAY",
  planFromSchedule: true,
  day: { ...daily.state.days[0], id: "day9", date: today, roundId: "r1" },
  entries: [],
});
check(
  "20) إنشاء يوم جديد لا يبني أي صف تلقائيًا من كشف الديالة",
  createdDay.entries.filter((e) => e.dayId === "day9").length === 0,
  createdDay.entries.length
);

/* ------------------- 21) الرواسة الجزئية والديزل المدفوع ------------------ */

const feeState: AppState = {
  ...daily.state,
  pump: {
    ...daily.state.pump!,
    royaltyEnabled: true,
    royaltyMode: "hour",
    royaltyPerHour: 2000,
  },
};
const partialState = recordUsage(feeState, {
  personId: daily.people[0].id,
  startTime: "06:00",
  endTime: "09:00",
  dieselSettlement: "shortage",
  dieselShortageLiters: 10,
  royaltyPayMode: "partial",
  royaltyCashAmount: 3000,
});
const partialUsage = partialState.usages[partialState.usages.length - 1];
check(
  "21) الرواسة الجزئية: نقد 3000 والآجل 3000 من أصل 6000",
  royaltyCashPartOf(partialUsage) === 3000 && royaltyDeferredPartOf(partialUsage) === 3000,
  { cash: royaltyCashPartOf(partialUsage), deferred: royaltyDeferredPartOf(partialUsage) }
);
const partialPostings = settlementPostings(partialUsage);
check(
  "21ب) الحركات: استحقاق رواسة كامل + سداد الجزء النقدي فقط",
  partialPostings.filter((x) => x.kind === "royalty").length === 1 &&
    partialPostings.some((x) => x.kind === "payment" && x.amount === 3000),
  partialPostings.map((x) => `${x.kind}/${x.direction}/${x.amount}`)
);
check(
  "21ج) الديزل الناقص: استحقاق كامل + سداد الباقي (10 لتر × 1200 نقصًا)",
  partialUsage.dieselSettlement === "shortage" &&
    dieselPaidPartOf(partialUsage) === Math.round(partialUsage.fuelAmountDue) - 10 * 1200,
  { paid: dieselPaidPartOf(partialUsage), due: partialUsage.fuelAmountDue }
);
const totals = daySettlementTotals(partialState, "day1");
check(
  "21د) ملخص اليوم يعدّ الرواسة الجزئية نقدًا وآجلًا معًا",
  totals.partialCount === 1 && totals.royaltyCash === 3000 && totals.royaltyCredit === 3000,
  { partial: totals.partialCount, cash: totals.royaltyCash, credit: totals.royaltyCredit }
);

const editedSettlement = reducerForTests(partialState, {
  type: "SET_USAGE_SETTLEMENT",
  usageId: partialUsage.id,
  dieselSettlement: "shortage",
  dieselShortageLiters: 10,
  royaltyPayMode: "partial",
  settlementNote: "تعديل سرعة الديزل",
  reason: "اختبار",
  actor: "manager",
});
const kept = editedSettlement.usages.find((u) => u.id === partialUsage.id)!;
check(
  "21هـ) تعديل التسديد لا يُفقد الجزء النقدي المسجَّل",
  kept.royaltyCashAmount === 3000 && kept.royaltyPayMode === "partial",
  { cash: kept.royaltyCashAmount, mode: kept.royaltyPayMode }
);

/* --------------------- 22) معادلة الوقود مصدر واحد ----------------------- */

check(
  "22) معادلة الوقود: 3 ساعات × 10 لتر/ساعة = 30 لتر = 36000 بسعر 1200",
  fuelLitersFor(180, { energyType: "diesel", fuelCalcMode: "hour", fuelConsumptionPerHour: 10 }) === 30 &&
    fuelCostFor(30, 1200) === 36000
);
check(
  "22ب) المضخة الشمسية بلا وقود",
  fuelLitersFor(180, { energyType: "solar", fuelConsumptionPerHour: 10 }) === 0
);

/* ---------------------- 23) الوقت بصيغة 12 ساعة (ص/م) ------------------- */

check(
  "23) الصباح والظهر والعصر بصيغة ص/م",
  formatTimeAmPm("06:00") === "6:00 ص" &&
    formatTimeAmPm("15:30") === "3:30 م" &&
    formatTimeAmPm("09:05") === "9:05 ص",
  [formatTimeAmPm("06:00"), formatTimeAmPm("15:30"), formatTimeAmPm("09:05")]
);
check(
  "23ب) منتصف الليل والظهر يُكتبان 12 لا 0",
  formatTimeAmPm("00:00") === "12:00 ص" && formatTimeAmPm("12:00") === "12:00 م",
  [formatTimeAmPm("00:00"), formatTimeAmPm("12:00")]
);
check(
  "23ج) نافذة تشغيل تعبر منتصف الليل: 6:00 ص → 2:00 ص",
  `${formatTimeAmPm("06:00")} → ${formatTimeAmPm("02:00")}` === "6:00 ص → 2:00 ص"
);
check("23د) وقت فارغ يُعرض شرطة", formatTimeAmPm("") === "—");

check(
  "23هـ) النطاق الزمني يُكتب من اليمين إلى اليسار (الأول على اليمين)",
  formatTimeRange("06:00", "09:00") === "6:00 ص ← 9:00 ص" &&
    formatTimeRange("06:00", "18:00") === "6:00 ص ← 6:00 م",
  [formatTimeRange("06:00", "09:00"), formatTimeRange("06:00", "18:00")]
);
check(
  "23و) نطاق يعبر منتصف الليل: 6:00 ص ← 2:00 ص",
  formatTimeRange("06:00", "02:00") === "6:00 ص ← 2:00 ص"
);

/* ------------- 24) المزامنة: «آخر تحديث» و«جديد» وإشعارات المسؤول --------- */

const now = new Date("2026-05-10T12:00:00.000Z");
check(
  "24) صيغة «آخر تحديث» بالعربية: الآن · دقيقة · دقيقتين · 5 دقائق",
  formatRelativeAr("2026-05-10T11:59:50.000Z", now) === "الآن" &&
    formatRelativeAr("2026-05-10T11:59:00.000Z", now) === "قبل دقيقة" &&
    formatRelativeAr("2026-05-10T11:58:00.000Z", now) === "قبل دقيقتين" &&
    formatRelativeAr("2026-05-10T11:55:00.000Z", now) === "قبل 5 دقائق",
  [
    formatRelativeAr("2026-05-10T11:59:00.000Z", now),
    formatRelativeAr("2026-05-10T11:58:00.000Z", now),
    formatRelativeAr("2026-05-10T11:55:00.000Z", now),
  ]
);
check(
  "24ب) الساعات والأيام: ساعتين · 3 ساعات · أمس · —",
  formatRelativeAr("2026-05-10T10:00:00.000Z", now) === "قبل ساعتين" &&
    formatRelativeAr("2026-05-10T09:00:00.000Z", now) === "قبل 3 ساعات" &&
    formatRelativeAr("2026-05-09T09:00:00.000Z", now) === "أمس" &&
    formatRelativeAr(null, now) === "—"
);
check(
  "24ج) «لم يُحدَّث بعد» عند غياب وقت المزامنة",
  lastUpdateLabel(null, now) === "لم يُحدَّث بعد على هذا الجهاز" &&
    lastUpdateLabel("2026-05-10T11:55:00.000Z", now) === "آخر تحديث: قبل 5 دقائق"
);
check(
  "24د) كشف القِدم: بلا وقت = قديم · قبل 3 ساعات = قديم · قبل دقيقة = حديث",
  isStaleSince(null, 30, now) === true &&
    isStaleSince("2026-05-10T09:00:00.000Z", 30, now) === true &&
    isStaleSince("2026-05-10T11:59:00.000Z", 30, now) === false
);

/* إشعاراتي: العامة + الموجَّهة لي فقط، و«جديد» علم شخصي */
const notifications = [
  { id: "n1", personId: null, read: false },
  { id: "n2", personId: "p-me", read: false },
  { id: "n3", personId: "p-other", read: false },
  { id: "n4", personId: "p-me", read: false },
];
check(
  "24هـ) إشعاراتي = العامة + الموجَّهة إليّ (بلا إشعارات غيري)",
  myNotifications(notifications, "p-me")
    .map((n) => n.id)
    .join(",") === "n1,n2,n4"
);
check(
  "24و) «جديد» يسقط بما قرأته أنا فقط، ولا يمسّ إشعارات غيري",
  unreadNotifications(notifications, ["n1"], "p-me")
    .map((n) => n.id)
    .join(",") === "n2,n4" &&
    unreadNotifications(notifications, ["n2", "n4"], "p-me").map((n) => n.id).join(",") === "n1" &&
    unreadNotifications(notifications, [], "p-other").map((n) => n.id).join(",") === "n1,n3"
);
check(
  "24ز) دمج معرّفات القراءة (الخادم + المحلي) بلا تكرار",
  mergeReadIds(["a", "b"], ["b", "c", undefined as unknown as string]).join(",") === "a,b,c"
);

/* إشعارات المسؤول تُرفع إلى الخادم وتُستعاد على جهاز آخر (المزامنة عبر الأجهزة) */
const notifyState: AppState = {
  ...emptyState(),
  notifications: [
    {
      id: "notif-1",
      at: "2026-05-10T08:00:00.000Z",
      kind: "turn_changed",
      level: "warn",
      title: "تغيير دورك",
      body: "دورك اليوم صار 8:00 ص",
      personId: "p-me",
      dayId: null,
      read: false,
    },
  ],
};
const notifyPayload = payloadFromState(notifyState);
check(
  "24ح) إشعارات المسؤول تُرفع مع بيانات التشغيل (extra.notifications)",
  Array.isArray((notifyPayload.extra as { notifications?: unknown[] })?.notifications) &&
    (notifyPayload.extra as { notifications: unknown[] }).notifications.length === 1
);
const restored = applyPayload(emptyState(), notifyPayload);
check(
  "24ط) جهاز جديد يستعيد إشعارات المسؤول من الخادم",
  restored.notifications.length === 1 && restored.notifications[0].title === "تغيير دورك"
);

/* ------------------- 25) الإشعارات الفورية (Web Push) ------------------- */

const previousExtra = { notifications: [{ id: "n-old", title: "قديم", body: "" }] };
const nextExtra = {
  notifications: [
    { id: "n-new-1", title: "تغيير دورك اليوم", body: "صار دورك 6:00 ص ← 8:00 ص", level: "warn" },
    { id: "n-new-2", title: "تذكير: دورك غدًا", body: "جهّز نفسك", level: "info" },
    { id: "n-old", title: "قديم", body: "" },
    { id: "n-new-3", title: "توقّف المضخة", body: "عطل", level: "danger" },
    { id: "n-new-4", title: "خامس", body: "" },
  ],
};
const fresh = newNotifications(previousExtra, nextExtra);
check(
  "25) الإشعار الفوري يُرسَل للإشعارات الجديدة فقط (وبحد ٣ في المرة)",
  fresh.map((n) => n.id).join(",") === "n-new-1,n-new-2,n-new-3",
  fresh.map((n) => n.id)
);
check(
  "25ب) الإشعار الفوري يحمل العنوان والنص والمستوى، وبلا تكرار عند إعادة الحفظ",
  fresh[0].title === "تغيير دورك اليوم" &&
    fresh[0].level === "warn" &&
    newNotifications({ notifications: nextExtra.notifications }, nextExtra).length === 0
);
check(
  "25ج) إشعار بلا عنوان يأخذ نصًّا افتراضيًا (لا يظهر فارغًا)",
  newNotifications({}, { notifications: [{ id: "x" }] })[0].title === "تنبيه من مسؤول المضخة"
);

/* مفتاح اشتراك المتصفح (base64url) → ٦٥ بايت تبدأ بـ 0x04 */
const sampleVapid = "BEqF8a-WBQ8U_5333A3N8G1rITiNbnRJT8UzfR6yXUpbp9Tbtg0T-4GADAmCv58Tk5jLDOw6J4b1zIuCe-86KqM";
const decoded = urlBase64ToUint8Array(sampleVapid);
check(
  "25د) فكّ مفتاح الإشعارات: ٦٥ بايت وأول بايت ٤ (صيغة VAPID الصحيحة)",
  decoded.length === 65 && decoded[0] === 4,
  [decoded.length, decoded[0]]
);

/* ------------------- 26) حماية الإشعارات: نطاقات معروفة فقط ------------------- */

const endpointCases: Array<[string, boolean]> = [
  ["https://fcm.googleapis.com/fcm/send/abc", true],
  ["https://web.push.apple.com/xyz", true],
  ["https://updates.push.services.mozilla.com/wpush/v2/abc", true],
  ["https://evil.example.com/collect", false],
  ["http://fcm.googleapis.com/fcm/send/abc", false],
  ["not-a-url", false],
  ["https://fcm.googleapis.com.evil.com/x", false],
  ["", false],
];
const endpointResults = endpointCases.map(([ep]) => pushEndpointProblem(ep) === null);
check(
  "26) اشتراك الإشعارات: تُقبل خدمات المتصفحات المعروفة ويُرفض أي عنوان آخر",
  endpointResults.every((value, i) => value === endpointCases[i][1]),
  endpointResults
);
check(
  "26ب) النطاق المزيّف (fcm.googleapis.com.evil.com) مرفوض",
  pushEndpointProblem("https://fcm.googleapis.com.evil.com/x") !== null
);


/* ---------------- 27) تيليجرام: قراءة الرسائل وبناء الروابط ---------------- */

check("27) رابط البدء: يُقرأ الرمز بلا لبس", startPayload("/start AB23CD45") === "AB23CD45");
check("27ب) /start بلا رمز يُقرأ فارغًا (لا خطأ)", startPayload("/start") === "");
check("27ج) /start مع اسم البوت يعمل", startPayload("/start@MyPumpBot ab23cd45") === "AB23CD45");
check("27د) نص عادي ليس أمر بدء", startPayload("سلام عليكم") === null);
check(
  "27هـ) رمز الربط: 8 خانات من أبجدية بلا لبس",
  isValidLinkCode(newLinkCode()) && !isValidLinkCode("ABCDIO23") && !isValidLinkCode("ABC")
);
check(
  "27و) الرقم يُقبل فقط من «شارك رقمي» لصاحبه",
  contactPhone({ contact: { phone_number: "967777123456", user_id: 5 }, from: { id: 5 } }) === "+967777123456" &&
    contactPhone({ contact: { phone_number: "967777000000", user_id: 9 }, from: { id: 5 } }) === null &&
    contactPhone({ contact: { phone_number: "967777123456" }, from: { id: 5 } }) === null
);
check(
  "27ز) مطابقة الأرقام تتجاهل مفتاح الدولة والصفر",
  samePhone("+967777123456", "00967777123456") && samePhone("967777123456", "7777123456") &&
    !samePhone("+967777123456", "+967733000000")
);

/* ------------------- 28) رموز التحقّق: الشكل والمهلات والحد ------------------- */

check("28) الرمز ستة أرقام فقط", codeShapeProblem("123456") === null && codeShapeProblem("12345") !== null && codeShapeProblem("12a456") !== null);
check("28ب) الرمز المولَّد ستة أرقام", /^\d{6}$/.test(newOtpCode()));
check("28ج) التذكرة طويلة لا تُخمَّن", newTicket().length >= 40);
const nowMs = Date.now();
check(
  "28د) مهلة إعادة الإرسال 60 ثانية",
  cooldownLeft(new Date(nowMs - 5_000).toISOString(), nowMs) > 0 &&
    cooldownLeft(new Date(nowMs - 70_000).toISOString(), nowMs) === 0 &&
    cooldownLeft(null, nowMs) === 0
);
check(
  "28هـ) السقف اليومي يعمل (0 = بلا سقف)",
  dailyLimitHit(200, 200) && !dailyLimitHit(199, 200) && !dailyLimitHit(10_000, 0)
);

console.log(`\n${passed} ناجح · ${failed} فاشل`);
if (failed > 0) process.exit(1);
