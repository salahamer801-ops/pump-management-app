/**
 * اختبارات المرحلة الثانية — بيانات التشغيل على الخادم + الصلاحيات + الحُرّاس.
 * يعمل على الخادم المحلي (بيانات تشغيل حقيقية في PostgreSQL)، وينشئ حساباته الخاصة.
 *
 * التشغيل:  node scripts/verify-phase2-api.mjs        (API_BASE اختياري)
 */
const API = process.env.API_BASE || "http://localhost:3001";

let pass = 0;
let fail = 0;
const results = [];

function check(name, ok, detail = "") {
  results.push({ name, ok, detail });
  if (ok) {
    pass += 1;
    console.log(`  ✅ ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    fail += 1;
    console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function api(method, path, { token, body } = {}) {
  const headers = {};
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: res.status, json };
}

const stamp = String(Date.now()).slice(-7);
const tag = Date.now().toString(36).slice(-5).toUpperCase();
/* أرقام ثابتة لكل حساب (لا تتغير بين النداءات) */
const PHONES = {
  1: `77${stamp}1`,
  2: `77${stamp}2`,
  3: `77${stamp}3`,
};
const phone = (n) => PHONES[n];
const uid = (p = "x") => `${p}_${Math.random().toString(36).slice(2, 9)}${Date.now().toString(36).slice(-4)}`;

async function register({ name, phoneNo, accountType }) {
  const res = await api("POST", "/api/auth/register", {
    body: {
      name,
      phone: phoneNo,
      password: "test12345",
      confirmPassword: "test12345",
      accountType,
    },
  });
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.json)}`);
  return res.json;
}

async function createPump(token, name) {
  const res = await api("POST", "/api/pumps", { token, body: { name, description: "", location: "" } });
  if (res.status !== 201) throw new Error(`pump create failed: ${res.status} ${JSON.stringify(res.json)}`);
  return res.json.pump;
}

/* --------------------------- بيانات الكشف للاختبار --------------------------- */

const rosterRow = (shareMin, order, name) => ({
  id: uid("r"),
  personId: uid("p"),
  personName: name,
  role: "shareholder",
  shareMin,
  order,
  archived: false,
});

async function main() {
  console.log(`\n===== اختبارات المرحلة الثانية (API + PostgreSQL) =====\n${API}\n`);

  const managerA = await register({ name: `مسؤول أ ${tag}`, phoneNo: phone(1), accountType: "manager" });
  const managerB = await register({ name: `مسؤول ب ${tag}`, phoneNo: phone(2), accountType: "manager" });
  const shareholder = await register({ name: `مساهم أ ${tag}`, phoneNo: phone(3), accountType: "user" });
  console.log(`حسابات الاختبار: مسؤول أ / مسؤول ب / مساهم — وسم ${tag}\n`);

  const pumpA = await createPump(managerA.token, `مضخة أ ${tag}`);
  const pumpB = await createPump(managerB.token, `مضخة ب ${tag}`);

  /* ---------------------------- Test 1: عزل المسؤولين --------------------------- */
  console.log("Test 1 — عزل المسؤولين (Manager A ↮ Manager B)");
  {
    const read = await api("GET", `/api/pumps/${pumpB.id}/operating`, { token: managerA.token });
    check("اختبار 1: مسؤول أ لا يقرأ بيانات مضخة ب", read.status === 403 || read.status === 404, `HTTP ${read.status}`);

    const write = await api("PUT", `/api/pumps/${pumpB.id}/operating`, {
      token: managerA.token,
      body: { data: { settings: { name: "اختراق" } } },
    });
    check("اختبار 1: مسؤول أ لا يكتب في مضخة ب", write.status === 403 || write.status === 404, `HTTP ${write.status}`);

    const patch = await api("PATCH", `/api/pumps/${pumpB.id}`, {
      token: managerA.token,
      body: { name: "اسم مغتصب" },
    });
    check("اختبار 1: مسؤول أ لا يعدّل مضخة ب", patch.status === 403 || patch.status === 404, `HTTP ${patch.status}`);

    const own = await api("GET", `/api/pumps/${pumpA.id}/operating`, { token: managerA.token });
    check("اختبار 1: مسؤول أ يقرأ مضخته", own.status === 200, `HTTP ${own.status}`);
  }

  /* ------------------------- Test 2: طلب الانضمام والموافقة ------------------------ */
  console.log("\nTest 2 — طلب انضمام مساهم ثم موافقة المسؤول");
  {
    const join = await api("POST", "/api/pumps/join", {
      token: shareholder.token,
      body: { pumpCode: pumpA.pumpCode, note: "طلب اختبار" },
    });
    check("اختبار 2: المساهم أنشأ طلب انضمام", join.status === 201, `HTTP ${join.status}`);

    const requests = await api("GET", `/api/pumps/${pumpA.id}/requests`, { token: managerA.token });
    const pending = (requests.json?.requests ?? []).find((r) => r.status === "pending");
    check("اختبار 2: الطلب ظاهر للمسؤول كـ«قيد المراجعة»", Boolean(pending), `${(requests.json?.requests ?? []).length} طلب`);

    let approved = false;
    if (pending) {
      const decision = await api("POST", `/api/pumps/${pumpA.id}/requests/${pending.id}/decision`, {
        token: managerA.token,
        body: { action: "approve", membershipType: "shareholder", personName: `مساهم ${tag}` },
      });
      approved = decision.status === 200 && decision.json?.membership?.status === "approved";
      check("اختبار 2: المسؤول وافق على الطلب", approved, `HTTP ${decision.status}`);
    } else {
      check("اختبار 2: المسؤول وافق على الطلب", false, "لا يوجد طلب معلّق");
    }

    const me = await api("GET", "/api/auth/me", { token: shareholder.token });
    const membership = (me.json?.memberships ?? []).find((m) => m.pumpCode === pumpA.pumpCode);
    check(
      "اختبار 2: العضوية المعتمدة ظهرت لحساب المساهم (بيانات المضخة تُفتح له)",
      membership?.status === "approved",
      membership ? `الحالة: ${membership.status}` : "لا عضوية"
    );
  }

  /* --------------------- Test 3: المساهم ومضخة ليست له (403/404) --------------------- */
  console.log("\nTest 3 — المساهم لا يصل إلى مضخة ليست له");
  {
    const read = await api("GET", `/api/pumps/${pumpB.id}/operating`, { token: shareholder.token });
    check("اختبار 3: قراءة مضخة أخرى مرفوضة", read.status === 403 || read.status === 404, `HTTP ${read.status}`);

    const write = await api("POST", `/api/pumps/${pumpB.id}/dialas`, {
      token: shareholder.token,
      body: { id: uid("d"), number: 1, days: 3 },
    });
    check("اختبار 3: كتابة المساهم في مضخة أخرى مرفوضة", write.status === 403 || write.status === 404, `HTTP ${write.status}`);

    const writeOwn = await api("POST", `/api/pumps/${pumpA.id}/dialas`, {
      token: shareholder.token,
      body: { id: uid("d"), number: 9, days: 3 },
    });
    check("اختبار 3: المساهم لا يكتب في المضخة التي ينتمي إليها", writeOwn.status === 403, `HTTP ${writeOwn.status}`);
  }

  /* --------------------- Test 4: ديالة + كشف بـ50+ عضوًا على الخادم --------------------- */
  console.log("\nTest 4 — ديالة وكشف دوام أساسي بـ50+ عضوًا");
  const dialaId = uid("d");
  {
    /* ساعات التشغيل الأساسية = 20 ساعة (1200 دقيقة) */
    const settings = {
      wells: "بئر 1",
      farm: "مزرعة الاختبار",
      engine: "محرك",
      energyType: "diesel",
      workStart: "00:00",
      workEnd: "20:00",
      fuelConsumptionPerHour: 6,
      fuelPerCycle: 0,
      fuelCalcMode: "hour",
      fuelPrice: 500,
      royaltyEnabled: true,
      royaltyMode: "hour",
      royaltyPerHour: 200,
      operatorName: "رواس",
      operatorHourlyWage: 300,
      shareUnit: "سهم",
      currency: "YER",
    };
    await api("PUT", `/api/pumps/${pumpA.id}/operating`, {
      token: managerA.token,
      body: { data: { settings } },
    });
    const saved = await api("GET", `/api/pumps/${pumpA.id}/operating`, { token: managerA.token });
    check(
      "اختبار 4: إعدادات المضخة محفوظة على الخادم (ساعات التشغيل 20)",
      saved.json?.settings?.workStart === "00:00" && saved.json?.settings?.workEnd === "20:00"
    );

    const diala = await api("POST", `/api/pumps/${pumpA.id}/dialas`, {
      token: managerA.token,
      body: { id: dialaId, number: 1, startDate: "2026-01-01", days: 20, notes: `ديالة اختبار ${tag}` },
    });
    check("اختبار 4: إنشاء الديالة على الخادم", diala.status === 201, `HTTP ${diala.status}`);

    /* 50 عضوًا × 24 دقيقة = 1200 دقيقة (الحد الأقصى بالضبط) */
    const roster = Array.from({ length: 50 }, (_, i) => rosterRow(24, i + 1, `عضو ${i + 1} ${tag}`));
    const posted = await api("POST", `/api/dialas/${dialaId}/base-roster`, {
      token: managerA.token,
      body: { roster },
    });
    check(
      "اختبار 4: كشف 50 عضوًا محفوظ (المجموع 1200 = الحد)",
      posted.status === 200 && posted.json?.totalMin === 1200,
      `HTTP ${posted.status} · المجموع ${posted.json?.totalMin}`
    );

    /* قراءة جديدة من الخادم — إثبات الحفظ في PostgreSQL */
    const reread = await api("GET", `/api/dialas/${dialaId}/base-roster`, { token: managerA.token });
    check(
      "اختبار 4: الكشف يُقرأ من PostgreSQL بعد الحفظ",
      reread.json?.roster?.length === 50 && reread.json?.totalMin === 1200,
      `${reread.json?.roster?.length} صف · ${reread.json?.totalMin} دقيقة`
    );
  }

  /* ------------------------ Test 5: حد ساعات التشغيل (1200 دقيقة) ------------------------ */
  console.log("\nTest 5 — الحد: 1200 دقيقة بالضبط، ودقيقة واحدة تُرفض من الخادم");
  {
    const roster = await api("GET", `/api/dialas/${dialaId}/base-roster`, { token: managerA.token });
    const rows = (roster.json?.roster ?? []).map((r) => ({
      id: r.id,
      dialaId,
      personId: r.personId,
      personName: r.personName,
      role: "shareholder",
      shareMin: r.shareMin,
      order: r.order,
      archived: false,
    }));
    rows.push({ ...rosterRow(1, 51, `عضو زائد ${tag}`), dialaId });
    const over = await api("POST", `/api/dialas/${dialaId}/base-roster`, {
      token: managerA.token,
      body: { roster: rows },
    });
    check(
      "اختبار 5: إضافة دقيقة واحدة فوق 1200 مرفوضة من الخادم",
      over.status === 409 && over.json?.error?.code === "roster_over_capacity",
      `HTTP ${over.status} · ${over.json?.error?.code ?? ""} · صفوف ${over.json?.roster?.length ?? rows.length}`
    );

    const direct = await api("PUT", `/api/pumps/${pumpA.id}/operating`, {
      token: managerA.token,
      body: { data: { roster: rows.map((r) => ({ ...r, dialaId })) } },
    });
    check(
      "اختبار 5: محاولة تجاوز الحد عبر الحفظ الكامل مرفوضة أيضًا",
      direct.status === 409 && direct.json?.error?.code === "roster_over_capacity",
      `HTTP ${direct.status} · ${direct.json?.error?.code ?? ""}`
    );
  }

  /* --------------------------- Test 6: تثبيت الكشف وفكّه --------------------------- */
  console.log("\nTest 6 — تثبيت كشف الدوام الأساسي");
  {
    const lock = await api("POST", `/api/dialas/${dialaId}/roster/lock`, { token: managerA.token });
    check("اختبار 6: تثبيت الكشف", lock.status === 200 && lock.json?.rosterLocked === true, `HTTP ${lock.status}`);

    const roster = await api("GET", `/api/dialas/${dialaId}/base-roster`, { token: managerA.token });
    const rows = (roster.json?.roster ?? []).map((r) => ({
      id: r.id,
      dialaId,
      personId: r.personId,
      personName: r.personName,
      role: "shareholder",
      shareMin: r.shareMin,
      order: r.order,
      archived: false,
    }));
    check("اختبار 6: الكشف متاح للتعديل قبل التثبيت", rows.length === 50, `${rows.length} صف`);
    if (rows.length === 0) {
      check("اختبار 6: تعديل كشف مثبَّت مرفوض", false, "لا صفوف في الكشف");
      check("اختبار 6: فك التثبيت بلا سبب موثّق مرفوض", false, "لا صفوف في الكشف");
      check("اختبار 6: فك التثبيت بسبب موثّق ثم التعديل ينجح", false, "لا صفوف في الكشف");
      check("اختبار 6: المساهم لا يستطيع فك التثبيت", false, "لا صفوف في الكشف");
    } else {
    rows[0].shareMin = 23; /* تعديل على كشف مثبَّت (داخل حد الساعات 1199) */

    const blocked = await api("POST", `/api/dialas/${dialaId}/base-roster`, {
      token: managerA.token,
      body: { roster: rows },
    });
    check(
      "اختبار 6: تعديل كشف مثبَّت مرفوض",
      blocked.status === 409 && blocked.json?.error?.code === "roster_locked",
      `HTTP ${blocked.status} · ${blocked.json?.error?.code ?? ""}`
    );

    const noReason = await api("POST", `/api/dialas/${dialaId}/base-roster`, {
      token: managerA.token,
      body: { roster: rows, unlockReason: "" },
    });
    check("اختبار 6: فك التثبيت بلا سبب موثّق مرفوض", noReason.status === 409, `HTTP ${noReason.status}`);

    rows[0].shareMin = 23; /* التعديل بعد فك التثبيت: 49×24 + 23 = 1199 */
    const withReason = await api("POST", `/api/dialas/${dialaId}/base-roster`, {
      token: managerA.token,
      body: { roster: rows, unlockReason: "تصحيح نصيب عضو بموافقة المساهمين" },
    });
    check(
      "اختبار 6: فك التثبيت بسبب موثّق ثم التعديل ينجح",
      withReason.status === 200 && withReason.json?.totalMin === 1199,
      `HTTP ${withReason.status} · المجموع ${withReason.json?.totalMin}`
    );

    /* المساهم لا يفكّ التثبيت */
    const byShareholder = await api("POST", `/api/dialas/${dialaId}/roster/unlock`, {
      token: shareholder.token,
      body: { reason: "محاولة مساهم" },
    });
    check("اختبار 6: المساهم لا يستطيع فك التثبيت", byShareholder.status === 403, `HTTP ${byShareholder.status}`);
    }
  }

  /* ------------------------ Test 7: الدوام الفعلي لا يمسّ الكشف ------------------------ */
  console.log("\nTest 7 — الدوام الفعلي مستقل عن كشف الدوام الأساسي");
  const dayId = uid("day");
  {
    const day = {
      id: dayId,
      dialaId,
      dayIndex: 1,
      date: "2026-01-02",
      status: "in_progress",
      workStart: "06:00",
      workEnd: "18:00",
      capacityMin: 720,
      plannedWorkStart: "06:00",
      plannedWorkEnd: "18:00",
      plannedCapacityMin: 720,
      notes: "يوم اختبار",
    };
    const put = await api("PUT", `/api/pumps/${pumpA.id}/operating`, {
      token: managerA.token,
      body: { data: { settings: { workStart: "00:00", workEnd: "20:00" }, days: [day] } },
    });
    check("اختبار 7: إنشاء يوم تابع للديالة على الخادم", put.status === 200, `HTTP ${put.status}`);

    const rosterBefore = await api("GET", `/api/dialas/${dialaId}/base-roster`, { token: managerA.token });
    const beforeRows = rosterBefore.json.roster.map((r) => `${r.id}:${r.shareMin}:${r.order}`).sort().join("|");

    /* اليوم الفعلي: تقديم عضو، تأخير عضو، وضيف لهذا اليوم فقط */
    const entries = [
      { id: uid("e"), dayId, orderIndex: 1, personId: "p_5", personName: "عضو 5 (قُدِّم)", role: "shareholder", startTime: "06:00", endTime: "06:24", plannedMin: 24, status: "planned", entryType: "moved_forward" },
      { id: uid("e"), dayId, orderIndex: 2, personId: "p_1", personName: "عضو 1", role: "shareholder", startTime: "06:24", endTime: "06:48", plannedMin: 24, status: "planned", entryType: "roster" },
      { id: uid("e"), dayId, orderIndex: 3, personId: "p_9", personName: "عضو 9 (أُخِّر)", role: "shareholder", startTime: "06:48", endTime: "07:12", plannedMin: 24, status: "planned", entryType: "moved_back" },
      { id: uid("e"), dayId, orderIndex: 4, personId: uid("p"), personName: `ضيف اليوم ${tag}`, role: "guest", startTime: "07:12", endTime: "07:42", plannedMin: 30, status: "planned", entryType: "guest" },
    ];
    const scheduled = await api("POST", `/api/days/${dayId}/actual-schedule`, {
      token: managerA.token,
      body: { entries },
    });
    check(
      "اختبار 7: حفظ الدوام الفعلي (تقديم/تأخير/ضيف)",
      scheduled.status === 200 && scheduled.json?.entries?.length === 4,
      `HTTP ${scheduled.status} · ${scheduled.json?.entries?.length} صف`
    );

    const reread = await api("GET", `/api/days/${dayId}/actual-schedule`, { token: managerA.token });
    const guest = (reread.json?.entries ?? []).find((e) => e.entryType === "guest");
    check("اختبار 7: صفوف اليوم تُقرأ من الخادم (بينها ضيف اليوم)", Boolean(guest), guest?.personName ?? "لا ضيف");

    const rosterAfter = await api("GET", `/api/dialas/${dialaId}/base-roster`, { token: managerA.token });
    const afterRows = rosterAfter.json.roster.map((r) => `${r.id}:${r.shareMin}:${r.order}`).sort().join("|");
    check(
      "اختبار 7: كشف الدوام الأساسي لم يتغير بعد تعديل اليوم الفعلي",
      beforeRows === afterRows,
      beforeRows === afterRows ? "مطابق تمامًا" : "تغيّر الكشف!"
    );
    check(
      "اختبار 7: ترتيب اليوم تغيّر فعلًا (التقديم لم يمسّ الكشف)",
      (reread.json?.entries ?? [])[0]?.personId === "p_5",
      `أول صف: ${(reread.json?.entries ?? [])[0]?.personName ?? "-"}`
    );
  }

  /* ------------------------ Test 8: قراءة المساهم من جهاز آخر ------------------------ */
  console.log("\nTest 8 — المساهم يقرأ البيانات الرسمية من جهاز/جلسة أخرى");
  {
    /* جلسة جديدة تمامًا للمساهم (جهاز آخر) */
    const login = await api("POST", "/api/auth/login", {
      body: { phone: phone(3), password: "test12345" },
    });
    const freshToken = login.json?.token;
    check("اختبار 8: دخول المساهم من جلسة جديدة", Boolean(freshToken), `HTTP ${login.status}`);

    const official = await api("GET", `/api/pumps/${pumpA.id}/operating`, { token: freshToken });
    check(
      "اختبار 8: بيانات المسؤول الرسمية ظهرت للمساهم على جهاز آخر",
      official.status === 200 &&
        official.json?.settings?.workStart === "00:00" &&
        (official.json?.days ?? []).some((d) => d.id === dayId),
      `HTTP ${official.status} · إعدادات ${official.json?.settings ? "موجودة" : "مفقودة"} · $-{Array.isArray(official.json?.days) ? official.json.days.length : 0} يوم`.replace("$-", "أيام: ")
    );

    const rosterForMember = await api("GET", `/api/dialas/${dialaId}/base-roster`, { token: freshToken });
    check(
      "اختبار 8: المساهم يقرأ كشف الدوام الأساسي الرسمي",
      rosterForMember.status === 200 && rosterForMember.json?.roster?.length === 50,
      `HTTP ${rosterForMember.status} · ${rosterForMember.json?.roster?.length} صف`
    );

    const scheduleForMember = await api("GET", `/api/days/${dayId}/actual-schedule`, { token: freshToken });
    check(
      "اختبار 8: المساهم يقرأ الدوام الفعلي الرسمي",
      scheduleForMember.status === 200 && scheduleForMember.json?.entries?.length === 4,
      `HTTP ${scheduleForMember.status}`
    );
  }

  /* ------------------- Test 9: السجلات الشخصية لا تمسّ بيانات المسؤول ------------------- */
  console.log("\nTest 9 — السجل الشخصي منفصل تمامًا عن بيانات المضخة الرسمية");
  {
    const officialBefore = await api("GET", `/api/pumps/${pumpA.id}/operating`, { token: managerA.token });
    const snapshot = JSON.stringify({
      settings: officialBefore.json?.settings,
      roster: officialBefore.json?.roster,
      entries: officialBefore.json?.entries,
    });

    const created = await api("POST", "/api/me/records", {
      token: shareholder.token,
      body: { date: "2026-01-03", kind: "turn", minutes: 30, liters: 3, cost: 1500, notes: `دوري ${tag}` },
    });
    check("اختبار 9: المساهم سجّل سجلًا شخصيًا", created.status === 201, `HTTP ${created.status}`);

    const mine = await api("GET", "/api/me/records", { token: shareholder.token });
    check(
      "اختبار 9: السجل الشخصي يُقرأ من الخادم لصاحبه",
      mine.status === 200 && (mine.json?.records ?? []).length >= 1,
      `${(mine.json?.records ?? []).length} سجل`
    );

    const officialAfter = await api("GET", `/api/pumps/${pumpA.id}/operating`, { token: managerA.token });
    const afterSnapshot = JSON.stringify({
      settings: officialAfter.json?.settings,
      roster: officialAfter.json?.roster,
      entries: officialAfter.json?.entries,
    });
    check(
      "اختبار 9: بيانات المسؤول لم تتغير بعد تسجيل المساهم بياناته الشخصية",
      snapshot === afterSnapshot,
      snapshot === afterSnapshot ? "مطابقة تمامًا" : "تغيّرت بيانات المضخة!"
    );

    const managerSees = (officialAfter.json?.personalRecords ?? []).length;
    check(
      "اختبار 9: المسؤول لا يرى السجلات الشخصية للمساهم",
      managerSees === 0,
      `سجلات ظاهرة للمسؤول: ${managerSees}`
    );

    const otherUserRecords = await api("GET", "/api/me/records", { token: managerB.token });
    check(
      "اختبار 9: مسؤول آخر لا يرى سجل المساهم",
      (otherUserRecords.json?.records ?? []).length === 0,
      `${(otherUserRecords.json?.records ?? []).length} سجل`
    );
  }

  /* ------------------------------- Test 10: سجل التدقيق ------------------------------- */
  console.log("\nTest 10 — سجل التدقيق لكل عملية مهمة");
  {
    const audit = await api("GET", `/api/pumps/${pumpA.id}/audit`, { token: managerA.token });
    const actions = new Set((audit.json?.logs ?? []).map((l) => l.action));
    const required = ["diala.create", "roster.change", "roster.lock", "roster.unlock", "actual_day.change", "operating.sync"];
    const missing = required.filter((a) => !actions.has(a));
    check(
      "اختبار 10: الأحداث المهمة مسجَّلة (ديالة/كشف/تثبيت/فك/دوام فعلي/حفظ)",
      missing.length === 0,
      missing.length ? `ناقص: ${missing.join(", ")}` : `${actions.size} نوع حدث`
    );

    const locked = (audit.json?.logs ?? []).find((l) => l.action === "roster.unlock");
    check(
      "اختبار 10: فك التثبيت مسجَّل بالسبب وbefore/after",
      Boolean(locked?.metadata?.reason && locked?.metadata?.before && locked?.metadata?.after),
      locked?.metadata?.reason ? "السبب موجود" : "لا سبب"
    );

    const dayLog = (audit.json?.logs ?? []).find((l) => l.action === "actual_day.change");
    check(
      "اختبار 10: تعديل اليوم الفعلي مسجَّل بقيم قبل/بعد",
      Boolean(Array.isArray(dayLog?.metadata?.before) && dayLog?.metadata?.after?.length),
      dayLog ? `قبل: ${dayLog.metadata.before?.length ?? 0} صف · بعد: ${dayLog.metadata.after?.length ?? 0} صف` : "مفقود"
    );

    const personalAudit = await api("GET", "/api/audit/me", { token: shareholder.token });
    const personal = (personalAudit.json?.logs ?? []).find((l) => l.action === "personal.record_upsert");
    check("اختبار 10: السجل الشخصي مسجَّل في تدقيق صاحبه", Boolean(personal), personal ? "موجود" : "مفقود");
  }

  /* --------------------------- ملخص --------------------------- */
  console.log("\n===== الملخص =====");
  for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"} — ${r.name}`);
  console.log(`\n${pass} ناجح · ${fail} فاشل`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error("\nتعذّر إكمال الاختبارات:", err.message);
  console.log(`\n${pass} ناجح · ${fail + 1} فاشل`);
  process.exit(1);
});
