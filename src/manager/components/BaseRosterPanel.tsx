/**
 * كشف الدوام الأساسي — اسم واحد لكل ديالة: أسماء المساهمين الأساسيين ونصيب كل واحد.
 *
 * القواعد المطبَّقة هنا:
 * - الكشف يخصّ **الديالة كلها** (كل أيامها)، ويُثبَّت، والديالات التالية تورث نفس
 *   الأسماء ونفس الترتيب ونفس النصيب تلقائيًا (الوراثة في المخزن).
 * - **منع تام**: مجموع النصيب لا يتجاوز ساعات تشغيل الدوام الأساسي — لا استثناء.
 * - إدخال جماعي لأكثر من 50 اسمًا: لصق قائمة نصية، أو تحديد جماعي من المسجّلين.
 * - «الدوام الفعلي» قائمة أخرى لكل يوم، لا تمسّ هذا الكشف.
 */
import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ClipboardPaste,
  Lock,
  LockOpen,
  Scale,
  Trash2,
  UserPlus,
  UsersRound,
  Wand2,
} from "lucide-react";
import { useApp } from "../../store";
import {
  baseRosterCapacityMin,
  baseRosterRemainingMin,
  baseRosterTimeline,
  baseRosterTotalMin,
  isShareholder,
  suggestShareMin,
  type BaseRosterRow,
} from "../../domain/rules";
import type { DialaRound, EntryRole, Person } from "../../domain/types";
import { formatDuration, toHours, todayISO, uid } from "../../domain/util";
import { Button, Field, Modal, NumberInput, Pill, Select, TextArea, TextInput, cx } from "../../components/ui";
import { roleLabel } from "../../components/PersonPicker";

type ShareUnit = "hour" | "min";

/** سطر ملصوق: «الاسم — الساعات» (يُقبل - أو , أو Tab أو مسافة بين الاسم والرقم) */
interface ParsedLine {
  raw: string;
  name: string;
  shareMin: number;
  hasShare: boolean;
}

function parsePasted(text: string): ParsedLine[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((raw) => {
      const match = raw.match(/^(.*?)[\s\t,;|:-]+(\d+(?:[.,]\d+)?)\s*(?:ساعة|ساعات|س)?$/);
      if (match && match[1].trim()) {
        const value = Number(match[2].replace(",", "."));
        return {
          raw,
          name: match[1].trim(),
          shareMin: Number.isFinite(value) ? Math.max(0, Math.round(value * 60)) : 0,
          hasShare: true,
        };
      }
      return { raw, name: raw, shareMin: 0, hasShare: false };
    });
}

const normalizeName = (s: string) => s.replace(/\s+/g, " ").trim();

export default function BaseRosterPanel({
  round,
  actor,
  defaultExpanded = false,
}: {
  round: DialaRound;
  actor: string;
  defaultExpanded?: boolean;
}) {
  const { state, actions } = useApp();
  const pump = state.pump!;
  const capacityMin = baseRosterCapacityMin(pump);
  const rows = useMemo(() => baseRosterTimeline(state, pump, round.id), [state, pump, round.id]);
  const totalMin = baseRosterTotalMin(state, round.id);
  const remainingMin = baseRosterRemainingMin(state, pump, round.id);
  const locked = Boolean(round.rosterLocked);
  const full = remainingMin <= 0;

  const [expanded, setExpanded] = useState(defaultExpanded);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [pickOpen, setPickOpen] = useState(false);
  const [pickQuery, setPickQuery] = useState("");
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [newOpen, setNewOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newShare, setNewShare] = useState("1");
  const [newUnit, setNewUnit] = useState<ShareUnit>("hour");
  const [removeTarget, setRemoveTarget] = useState<BaseRosterRow | null>(null);
  const [removeReason, setRemoveReason] = useState("");
  const [lockOpen, setLockOpen] = useState(false);
  const [lockReason, setLockReason] = useState("");
  const [unlockReason, setUnlockReason] = useState("");
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!notice) return;
    const t = window.setTimeout(() => setNotice(""), 6000);
    return () => window.clearTimeout(t);
  }, [notice]);

  const usedIds = useMemo(() => new Set(rows.map((r) => r.personId)), [rows]);

  const toMinutes = (value: string, unit: ShareUnit) => {
    const n = Number(value.replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Math.round(unit === "hour" ? n * 60 : n);
  };

  /* ---------------------------- لصق قائمة نصية ---------------------------- */
  const parsed = useMemo(() => (pasteOpen ? parsePasted(pasteText) : []), [pasteOpen, pasteText]);

  const pastePlan = useMemo(() => {
    if (!pasteOpen) return { add: [], skipped: [], leftover: 0 };
    let remaining = remainingMin;
    const add: { person: Person; isNew: boolean; shareMin: number; role: EntryRole; name: string }[] = [];
    const skipped: { name: string; why: string }[] = [];
    const seen = new Set<string>();
    for (const line of parsed) {
      const key = normalizeName(line.name).toLowerCase();
      if (!key) continue;
      if (seen.has(key)) continue;
      seen.add(key);
      const existing = state.persons.find((p) => normalizeName(p.name).toLowerCase() === key && !p.archived);
      if (existing && usedIds.has(existing.id)) {
        skipped.push({ name: line.name, why: "في الكشف بالفعل" });
        continue;
      }
      const shareMin = line.hasShare
        ? line.shareMin
        : existing
          ? suggestShareMin(state, pump, existing.id) || 60
          : 60;
      if (shareMin <= 0) {
        skipped.push({ name: line.name, why: "لا نصيب محدَّد (أضف الساعات بعد الاسم)" });
        continue;
      }
      if (shareMin > remaining) {
        skipped.push({ name: line.name, why: `نصيبه ${formatDuration(shareMin)} أطول من المتبقي (${formatDuration(remaining)})` });
        continue;
      }
      remaining -= shareMin;
      add.push({
        person:
          existing ??
          {
            id: uid("pr"),
            name: normalizeName(line.name),
            phone: "",
            nationalId: "",
            notes: "أُضيف من قائمة ملصوقة",
            guest: false,
            archived: false,
            createdAt: todayISO(),
            createdBy: actor,
          },
        isNew: !existing,
        shareMin,
        role: "shareholder",
        name: normalizeName(line.name),
      });
    }
    return { add, skipped, leftover: remaining };
  }, [pasteOpen, parsed, remainingMin, state, pump, usedIds, actor]);

  const applyPaste = () => {
    if (lockBlocked() || pastePlan.add.length === 0) return;
    for (const item of pastePlan.add) {
      if (item.isNew) actions.savePerson(item.person, true);
    }
    actions.bulkAddBaseRoster(
      round.id,
      pastePlan.add.map((a) => ({ personId: a.person.id, shareMin: a.shareMin, role: a.role })),
      actor
    );
    setNotice(
      `أُضيف ${pastePlan.add.length} شخصًا إلى كشف الديالة` +
        (pastePlan.skipped.length > 0 ? ` · تُرك ${pastePlan.skipped.length} (تجده في القائمة أدناه)` : "")
    );
    setPasteText("");
    setPasteOpen(false);
  };

  /* --------------------------- تحديد جماعي --------------------------- */
  const candidates = useMemo(() => {
    if (!pickOpen) return [];
    const q = pickQuery.trim().toLowerCase();
    return state.persons
      .filter((p) => !p.archived && !usedIds.has(p.id))
      .filter((p) => !q || p.name.toLowerCase().includes(q) || p.phone.includes(q))
      .sort((a, b) => a.name.localeCompare(b.name, "ar"))
      .slice(0, 80);
  }, [pickOpen, pickQuery, state.persons, usedIds]);

  const applyPicked = () => {
    if (lockBlocked()) return;
    const ids = Object.keys(picked);
    if (ids.length === 0) return;
    const items: { personId: string; shareMin: number; role: EntryRole }[] = [];
    const skipped: string[] = [];
    let remaining = remainingMin;
    for (const id of ids) {
      const shareMin = toMinutes(picked[id] ?? "", "hour") || suggestShareMin(state, pump, id) || 60;
      if (shareMin > remaining) {
        skipped.push(`${state.persons.find((p) => p.id === id)?.name ?? "—"} (${formatDuration(shareMin)})`);
        continue;
      }
      remaining -= shareMin;
      items.push({
        personId: id,
        shareMin,
        role: isShareholder(state, pump.id, id) ? "shareholder" : "other",
      });
    }
    if (items.length > 0) actions.bulkAddBaseRoster(round.id, items, actor);
    setNotice(
      items.length === 0
        ? "لم يُضف أحد — لا توجد ساعات متبقية تكفي"
        : `أُضيف ${items.length} شخصًا إلى الكشف` + (skipped.length > 0 ? ` · لم تبقَ ساعات لـ: ${skipped.join("، ")}` : "")
    );
    setPicked({});
    setPickOpen(false);
  };

  /* --------------------------- شخص جديد --------------------------- */
  const addNewPerson = () => {
    if (!newName.trim() || lockBlocked()) return;
    const shareMin = toMinutes(newShare, newUnit);
    if (shareMin <= 0 || shareMin > remainingMin) {
      setNotice(`النصيب يجب أن يكون بين دقيقة و${formatDuration(remainingMin)} (المتبقي من ساعات التشغيل)`);
      return;
    }
    const person: Person = {
      id: uid("pr"),
      name: newName.trim(),
      phone: newPhone.trim(),
      nationalId: "",
      notes: "أُضيف من كشف الدوام الأساسي",
      guest: false,
      archived: false,
      createdAt: todayISO(),
      createdBy: actor,
    };
    actions.savePerson(person, true);
    actions.saveBaseRosterMember(round.id, person.id, shareMin, { actor });
    setNewName("");
    setNewPhone("");
    setNewShare("1");
    setNewOpen(false);
  };

  /* --------------------------- توزيع على الأسهم --------------------------- */
  const distributeByShares = () => {
    if (lockBlocked() || rows.length === 0) return;
    const shareholders = rows.filter((r) => isShareholder(state, pump.id, r.personId));
    const withShare = shareholders.filter((r) => suggestShareMin(state, pump, r.personId) > 0);
    if (withShare.length === 0) {
      setNotice("لا يوجد مساهمون لهم سهم مسجّل في المضخة — وزّع السهم أولًا من شاشة الأشخاص");
      return;
    }
    let used = 0;
    const shares = withShare.map((r) => {
      const wanted = suggestShareMin(state, pump, r.personId);
      const share = Math.max(0, Math.min(wanted, capacityMin - used));
      used += share;
      return { row: r, share };
    });
    shares.forEach(({ row, share }) => {
      if (share !== row.shareMin) actions.setBaseRosterShare(row.member.id, share, actor);
    });
    setNotice(
      `وزّعت ساعات التشغيل (${formatDuration(capacityMin)}) على ${shares.length} مساهمًا حسب أسهمهم — راجع النصيب وعدّله إن أردت`
    );
  };

  const lockBlocked = () => {
    if (!locked) return false;
    setNotice("الكشف مثبَّت — افكّ التثبيت بسبب موثّق لتعديله");
    return true;
  };

  const pct = capacityMin > 0 ? Math.min(100, Math.round((totalMin / capacityMin) * 100)) : 0;

  return (
    <div className="mt-2 rounded-2xl border border-emerald-100 bg-emerald-50/40 p-3 dark:border-emerald-900/40 dark:bg-emerald-900/10">
      <div className="flex flex-wrap items-center gap-2">
        <UsersRound size={15} className="text-emerald-600" />
        <span className="text-xs font-extrabold text-gray-800 dark:text-white">كشف الدوام الأساسي</span>
        {locked ? (
          <Pill tone="green">
            <Lock size={10} /> مثبَّت
          </Pill>
        ) : (
          <Pill tone="amber">غير مثبَّت</Pill>
        )}
        <span className="text-[11px] text-gray-500 dark:text-slate-300">
          {rows.length} شخصًا · {formatDuration(totalMin)} من {toHours(capacityMin)} ساعة
        </span>
        <button
          className="mr-auto text-[11px] font-bold text-emerald-700 dark:text-emerald-300"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "إخفاء التفاصيل" : "عرض/تعديل الكشف"}
        </button>
      </div>

      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/80 dark:bg-slate-700">
        <div
          className={cx("h-full rounded-full transition-all", pct >= 100 ? "bg-emerald-600" : "bg-emerald-400")}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-1 flex items-center justify-between text-[10px] font-bold">
        <span className="text-gray-500 dark:text-slate-300">المسجَّل {formatDuration(totalMin)}</span>
        <span className={full ? "text-red-600" : "text-emerald-700 dark:text-emerald-300"}>
          {full ? "اكتملت ساعات التشغيل — لا يمكن إضافة نصيب" : `المتبقي ${formatDuration(remainingMin)}`}
        </span>
      </div>

      {notice ? (
        <p className="mt-2 rounded-xl bg-white px-3 py-2 text-[11px] font-bold text-emerald-800 dark:bg-slate-800 dark:text-emerald-300" data-testid="roster-notice">
          {notice}
        </p>
      ) : null}

      {expanded ? (
        <>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <Button
              variant="secondary"
              className="px-3 py-2 text-xs"
              onClick={() => (lockBlocked() || full ? setPickOpen(true) : setPickOpen(true))}
              disabled={full}
              data-testid={`roster-multi-${round.number}`}
            >
              <UsersRound size={14} /> تحديد جماعي من المسجّلين
            </Button>
            <Button
              variant="secondary"
              className="px-3 py-2 text-xs"
              onClick={() => setPasteOpen(true)}
              disabled={full}
              data-testid={`roster-paste-${round.number}`}
            >
              <ClipboardPaste size={14} /> لصق قائمة أسماء
            </Button>
            <Button
              variant="outline"
              className="px-3 py-2 text-xs"
              onClick={() => setNewOpen(true)}
              disabled={full}
            >
              <UserPlus size={14} /> شخص جديد
            </Button>
            <Button
              variant="outline"
              className="px-3 py-2 text-xs"
              onClick={distributeByShares}
              disabled={locked || rows.length === 0}
              title="توزيع ساعات التشغيل على المساهمين حسب أسهمهم"
            >
              <Scale size={14} /> وزّع على الأسهم
            </Button>
            {locked ? (
              <Button
                variant="ghost"
                className="px-3 py-2 text-xs"
                onClick={() => {
                  setUnlockReason("");
                  setUnlockOpen(true);
                }}
              >
                <LockOpen size={14} /> فك تثبيت الكشف
              </Button>
            ) : (
              <Button
                variant="ghost"
                className="px-3 py-2 text-xs"
                onClick={() => {
                  setLockReason("");
                  setLockOpen(true);
                }}
                disabled={rows.length === 0}
              >
                <Lock size={14} /> تثبيت الكشف
              </Button>
            )}
          </div>

          {rows.length === 0 ? (
            <p className="mt-3 text-center text-[11px] text-gray-500 dark:text-slate-300" data-testid={`roster-empty-${round.number}`}>
              لا أسماء في الكشف بعد — الصق قائمة «اسم + ساعات» أو اختر جماعة من المسجّلين.
              <br />
              ساعات التشغيل المتاحة: {toHours(capacityMin)} ساعة.
            </p>
          ) : (
            <div className="mt-3 space-y-1.5">
              {rows.map((row, index) => (
                <div
                  key={row.member.id}
                  className="flex flex-wrap items-center gap-2 rounded-xl bg-white px-2 py-1.5 dark:bg-slate-800"
                  data-testid={`base-roster-row-${index + 1}`}
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-[10px] font-black text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-extrabold text-gray-800 dark:text-white">
                      {row.name}
                    </span>
                    <span className="block text-[10px] text-gray-400">
                      {row.phone || "لا يوجد رقم"} · {roleLabel(row.role)} ·{" "}
                      {row.startTime && row.endTime ? `${row.startTime} → ${row.endTime}` : "—"}
                    </span>
                  </span>
                  <ShareCell
                    row={row}
                    disabled={locked}
                    remaining={remainingMin}
                    onSave={(min) => {
                      if (min > row.shareMin + remainingMin) {
                        setNotice(
                          `لا يمكن: المتبقي ${formatDuration(remainingMin)} فقط — المجموع لا يتجاوز ساعات التشغيل`
                        );
                        return;
                      }
                      actions.setBaseRosterShare(row.member.id, min, actor);
                    }}
                  />
                  <span className="flex shrink-0 items-center gap-0.5">
                    <button
                      onClick={() => actions.moveBaseRosterMember(round.id, row.member.id, -1, actor)}
                      disabled={locked || index === 0}
                      aria-label={`تقديم ${row.name}`}
                      className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 disabled:opacity-30 dark:hover:bg-slate-700"
                    >
                      <ArrowUp size={13} />
                    </button>
                    <button
                      onClick={() => actions.moveBaseRosterMember(round.id, row.member.id, 1, actor)}
                      disabled={locked || index === rows.length - 1}
                      aria-label={`تأخير ${row.name}`}
                      className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 disabled:opacity-30 dark:hover:bg-slate-700"
                    >
                      <ArrowDown size={13} />
                    </button>
                    <button
                      onClick={() => {
                        setRemoveTarget(row);
                        setRemoveReason("");
                      }}
                      disabled={locked}
                      aria-label={`إزالة ${row.name}`}
                      data-testid={`base-roster-remove-${index + 1}`}
                      className="rounded-lg p-1 text-red-400 hover:bg-red-50 disabled:opacity-30 dark:hover:bg-red-900/20"
                    >
                      <Trash2 size={13} />
                    </button>
                  </span>
                </div>
              ))}
            </div>
          )}
          <p className="mt-2 text-[10px] leading-relaxed text-gray-500 dark:text-slate-400">
            <Wand2 size={10} className="inline -mt-0.5" /> هذا الكشف يُثبَّت ويُورَّث للديالة التالية بنفس الأسماء
            والترتيب والنصيب. «الدوام الفعلي» لكل يوم يُبنى من هنا ثم يُعدَّل بحرية ولا يغيّر الكشف.
          </p>
        </>
      ) : null}

      {/* لصق قائمة */}
      <Modal open={pasteOpen} onClose={() => setPasteOpen(false)} title="لصق قائمة أسماء الكشف">
        <div className="space-y-3">
          <Field label="كل سطر: الاسم ثم النصيب" hint="أمثلة: «أحمد سالم - 3» أو «علي 1.5» أو «محمد،45 دقيقة». الاسم بلا ساعات يأخذ نصيبه من سهمه.">
            <TextArea
              rows={8}
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder={"أحمد سالم - 3\nمحمد كريم - 2.5\nعلي حسن - 1.5"}
              data-testid="roster-paste-text"
            />
          </Field>
          {parsed.length > 0 ? (
            <div className="space-y-1 rounded-2xl bg-gray-50 p-3 dark:bg-slate-700">
              <p className="text-[11px] font-bold text-gray-700 dark:text-slate-200">
                سيُضاف {pastePlan.add.length} · يُترك {pastePlan.skipped.length} · المتبقي بعد الإضافة{" "}
                {formatDuration(pastePlan.leftover)}
              </p>
              {pastePlan.skipped.length > 0 ? (
                <div className="max-h-32 space-y-0.5 overflow-y-auto text-[10px] text-amber-700 dark:text-amber-300">
                  {pastePlan.skipped.map((s) => (
                    <div key={s.name}>• {s.name} — {s.why}</div>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setPasteOpen(false)}>
              إلغاء
            </Button>
            <Button
              className="flex-1"
              disabled={pastePlan.add.length === 0}
              onClick={applyPaste}
              data-testid="roster-paste-apply"
            >
              إضافة {pastePlan.add.length} إلى الكشف
            </Button>
          </div>
        </div>
      </Modal>

      {/* تحديد جماعي */}
      <Modal open={pickOpen} onClose={() => setPickOpen(false)} title="تحديد جماعي من المسجّلين">
        <div className="space-y-3">
          <TextInput
            value={pickQuery}
            onChange={(e) => setPickQuery(e.target.value)}
            placeholder="ابحث بالاسم أو الهاتف…"
            aria-label="بحث عن شخص"
          />
          <div className="max-h-[45vh] space-y-1 overflow-y-auto">
            {candidates.length === 0 ? (
              <p className="py-4 text-center text-xs text-gray-400">لا مرشحين — الجميع في الكشف أو لا نتائج.</p>
            ) : (
              candidates.map((p) => {
                const suggested = suggestShareMin(state, pump, p.id);
                const selected = picked[p.id] !== undefined;
                return (
                  <label
                    key={p.id}
                    className={cx(
                      "flex items-center gap-2 rounded-xl border px-2 py-1.5 text-xs",
                      selected ? "border-emerald-300 bg-emerald-50 dark:bg-emerald-900/20" : "border-gray-100 dark:border-slate-700"
                    )}
                  >
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-emerald-600"
                      checked={selected}
                      onChange={(e) => {
                        setPicked((prev) => {
                          const next = { ...prev };
                          if (e.target.checked) next[p.id] = String(toHours(suggested || 60));
                          else delete next[p.id];
                          return next;
                        });
                      }}
                      aria-label={`تحديد ${p.name}`}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-bold text-gray-800 dark:text-white">{p.name}</span>
                      <span className="block text-[10px] text-gray-400">
                        {p.phone || "لا يوجد رقم"}
                        {isShareholder(state, pump.id, p.id) ? ` · مساهم · نصيبه المقترح ${formatDuration(suggested)}` : " · بلا سهم مسجّل"}
                      </span>
                    </span>
                    {selected ? (
                      <input
                        className="w-16 rounded-xl border border-gray-200 bg-white px-2 py-1 text-center text-[11px] font-bold dark:border-slate-600 dark:bg-slate-800 dark:text-white"
                        value={picked[p.id]}
                        onChange={(e) => setPicked((prev) => ({ ...prev, [p.id]: e.target.value }))}
                        aria-label={`نصيب ${p.name} بالساعات`}
                      />
                    ) : null}
                  </label>
                );
              })
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setPickOpen(false)}>
              إلغاء
            </Button>
            <Button className="flex-1" disabled={Object.keys(picked).length === 0} onClick={applyPicked} data-testid="roster-multi-apply">
              إضافة {Object.keys(picked).length} إلى الكشف
            </Button>
          </div>
        </div>
      </Modal>

      {/* شخص جديد */}
      <Modal open={newOpen} onClose={() => setNewOpen(false)} title="شخص جديد في كشف الدوام الأساسي">
        <div className="space-y-3">
          <Field label="الاسم">
            <TextInput value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="اسم الشخص" autoFocus />
          </Field>
          <Field label="الهاتف (اختياري)">
            <TextInput value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="7XXXXXXXX" dir="ltr" />
          </Field>
          <Field label="النصيب في الديالة" hint={`المتبقي من ساعات التشغيل: ${formatDuration(remainingMin)}`}>
            <div className="flex gap-2">
              <NumberInput value={newShare} onChange={(e) => setNewShare(e.target.value)} inputMode="decimal" min={0} />
              <Select value={newUnit} onChange={(e) => setNewUnit(e.target.value as ShareUnit)} className="w-28" aria-label="وحدة النصيب">
                <option value="hour">ساعات</option>
                <option value="min">دقائق</option>
              </Select>
            </div>
          </Field>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setNewOpen(false)}>
              إلغاء
            </Button>
            <Button className="flex-1" disabled={!newName.trim()} onClick={addNewPerson}>
              إضافة إلى الكشف
            </Button>
          </div>
        </div>
      </Modal>

      {/* حذف بسبب */}
      <Modal open={Boolean(removeTarget)} onClose={() => setRemoveTarget(null)} title="إزالة من كشف الدوام الأساسي">
        {removeTarget ? (
          <div className="space-y-3">
            <p className="rounded-2xl bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-900 dark:bg-amber-900/20 dark:text-amber-300">
              إزالة <b>{removeTarget.name}</b> من كشف ديالة {round.number} تحرّر نصيبه ({formatDuration(removeTarget.shareMin)}).
              لا يُحذف أي سجل — الإزالة ناعمة، وصفوف «الدوام الفعلي» والاستخدامات تبقى كما هي.
            </p>
            <Field label="سبب الإزالة">
              <TextArea value={removeReason} onChange={(e) => setRemoveReason(e.target.value)} placeholder="مثال: بايع/انقل سهمه" />
            </Field>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setRemoveTarget(null)}>
                إلغاء
              </Button>
              <Button
                variant="danger"
                className="flex-1"
                onClick={() => {
                  actions.removeBaseRosterMember(removeTarget.member.id, {
                    reason: removeReason.trim() || "إزالة من كشف الدوام الأساسي",
                    actor,
                  });
                  setRemoveTarget(null);
                }}
                data-testid="base-roster-confirm-remove"
              >
                <Trash2 size={16} /> إزالة من الكشف
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>

      {/* تثبيت / فك تثبيت */}
      <Modal open={lockOpen} onClose={() => setLockOpen(false)} title="تثبيت كشف الدوام الأساسي">
        <div className="space-y-3">
          <p className="rounded-2xl bg-emerald-50 px-3 py-2 text-[11px] leading-relaxed text-emerald-900 dark:bg-emerald-900/20 dark:text-emerald-300">
            التثبيت يقفل أسماء الكشف ونصببهم وترتيبهم — والديالة التالية ترثهم كما هم. لا يُعدَّل بعدها إلا بفك تثبيت
            بسبب موثّق.
          </p>
          <Field label="سبب التثبيت (اختياري)">
            <TextInput value={lockReason} onChange={(e) => setLockReason(e.target.value)} placeholder="مثال: الكشف النهائي للديالة" />
          </Field>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setLockOpen(false)}>
              إلغاء
            </Button>
            <Button
              className="flex-1"
              onClick={() => {
                actions.setRoundRosterLock(round.id, true, lockReason.trim(), actor);
                setLockOpen(false);
              }}
              data-testid="roster-lock-confirm"
            >
              <Lock size={16} /> تثبيت الكشف
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={unlockOpen} onClose={() => setUnlockOpen(false)} title="فك تثبيت كشف الديالة">
        <div className="space-y-3">
          <Field label="سبب فك التثبيت (موثّق)">
            <TextArea value={unlockReason} onChange={(e) => setUnlockReason(e.target.value)} placeholder="مثال: تعديل نصيب مساهم" />
          </Field>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setUnlockOpen(false)}>
              إلغاء
            </Button>
            <Button
              variant="danger"
              className="flex-1"
              disabled={!unlockReason.trim()}
              onClick={() => {
                actions.setRoundRosterLock(round.id, false, unlockReason.trim(), actor);
                setUnlockOpen(false);
              }}
            >
              <LockOpen size={16} /> فك التثبيت
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

/** خانة النصيب: تُكتب ساعات أو دقائق وتُحفظ بالدقائق */
function ShareCell({
  row,
  disabled,
  remaining,
  onSave,
}: {
  row: BaseRosterRow;
  disabled: boolean;
  remaining: number;
  onSave: (shareMin: number) => void;
}) {
  const whole = row.shareMin % 60 === 0 && row.shareMin >= 60;
  const [unit, setUnit] = useState<ShareUnit>(whole ? "hour" : "min");
  const [value, setValue] = useState(() => (whole ? String(toHours(row.shareMin)) : String(Math.round(row.shareMin))));

  useEffect(() => {
    const w = row.shareMin % 60 === 0 && row.shareMin >= 60;
    setUnit(w ? "hour" : "min");
    setValue(w ? String(toHours(row.shareMin)) : String(Math.round(row.shareMin)));
  }, [row.shareMin]);

  const commit = () => {
    const n = Number(value.replace(",", "."));
    if (!Number.isFinite(n) || n < 0) return;
    const min = Math.round(unit === "hour" ? n * 60 : n);
    if (min !== row.shareMin) onSave(min);
  };

  return (
    <span className="flex shrink-0 items-center gap-1">
      <input
        value={value}
        disabled={disabled}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        inputMode="decimal"
        aria-label={`نصيب ${row.name}`}
        data-testid={`base-share-${row.member.id}`}
        className="w-14 rounded-xl border border-gray-200 bg-white px-2 py-1 text-center text-[11px] font-bold disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-white"
        title={`المتبقي ${Math.round(remaining)} دقيقة`}
      />
      <select
        value={unit}
        disabled={disabled}
        onChange={(e) => {
          setUnit(e.target.value as ShareUnit);
        }}
        onBlur={commit}
        aria-label={`وحدة نصيب ${row.name}`}
        className="rounded-xl border border-gray-200 bg-white px-1 py-1 text-[10px] font-bold text-gray-600 disabled:opacity-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200"
      >
        <option value="hour">ساعة</option>
        <option value="min">دقيقة</option>
      </select>
    </span>
  );
}
