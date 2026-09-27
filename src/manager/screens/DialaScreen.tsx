import { useMemo, useState } from "react";
import {
  Archive,
  ArchiveRestore,
  Layers,
  ListOrdered,
  Lock,
  LockOpen,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { useApp } from "../../store";
import type { DialaDay, DialaRound } from "../../domain/types";
import {
  activeShareholders,
  currentDialaDay,
  currentRight,
  dayByDate,
  dayOrdinal,
  daySummary,
  dialaDayTitle,
  dialaRounds,
  nextDialaDay,
  personName,
  pumpWindow,
  roundDates,
  roundDays,
  rosterPersonSummaries,
  scheduleRows,
  totalUnits,
} from "../../domain/rules";
import {
  addDaysISO,
  durationMin,
  formatDuration,
  isoToDisplay,
  isoToShort,
  todayISO,
  toHours,
  uid,
} from "../../domain/util";
import { formatNumber } from "../../format";
import { Button, Card, EmptyState, Field, Modal, Pill, TextInput, cx } from "../../components/ui";
import { AddDialaButton } from "../components/AddDialaModal";
import BaseRosterPanel from "../components/BaseRosterPanel";
import { DayStatusPill } from "./Dashboard";

export default function DialaScreen({ onOpenDay }: { onOpenDay: (id: string | null) => void }) {
  const { state, actions } = useApp();
  const pump = state.pump!;
  const [showArchived, setShowArchived] = useState(false);
  const [created, setCreated] = useState<{ round: DialaRound; firstDate: string } | null>(null);

  const rows = useMemo(() => scheduleRows(state, pump), [state, pump]);
  const units = totalUnits(state, pump.id);
  const window = pumpWindow(pump);
  const rounds = useMemo(() => dialaRounds(state, showArchived), [state, showArchived]);
  const archivedCount = state.rounds.filter((r) => r.archived).length;
  const current = currentDialaDay(state);
  const next = nextDialaDay(state);

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="mb-3 flex items-center gap-2">
          <Layers size={16} className="text-emerald-600" />
          <h2 className="text-sm font-extrabold text-gray-800 dark:text-white">اليوم الحالي والقادم</h2>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <DayMini label="الحالي" day={current} onOpen={onOpenDay} />
          <DayMini label="القادم" day={next} onOpen={onOpenDay} />
        </div>
      </Card>

      <AddDialaButton
        className="w-full"
        onCreated={(round) =>
          setCreated({
            round,
            firstDate:
              roundDates(round.startDate, round.days).find(
                (d) => !state.days.some((x) => !x.archived && x.date === d)
              ) ?? round.startDate,
          })
        }
      />

      {created ? (
        <div className="space-y-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-3 py-3 dark:border-emerald-900/40 dark:bg-emerald-900/20">
          <div className="flex flex-wrap items-center gap-2">
            <Sparkles size={16} className="text-emerald-600 dark:text-emerald-300" />
            <span className="flex-1 text-[11px] font-bold text-emerald-800 dark:text-emerald-200">
              ديالة {created.round.number}: من {isoToShort(created.round.startDate)} إلى{" "}
              {isoToShort(created.round.endDate)} — {created.round.days} يوم (اليوم الأول … اليوم{" "}
              {dayOrdinal(created.round.days)})
            </span>
            <button
              onClick={() => {
                const first = dayByDate(state, created.firstDate);
                setCreated(null);
                onOpenDay(first?.id ?? null);
              }}
              className="rounded-xl bg-white px-3 py-1.5 text-[11px] font-bold text-emerald-700 dark:bg-slate-800 dark:text-emerald-300"
            >
              ابدأ من اليوم الأول
            </button>
          </div>
          {(() => {
            const live = state.rounds.find((r) => r.id === created.round.id);
            if (!live) return null;
            return live.locked ? (
              <p className="rounded-xl bg-white/70 px-3 py-2 text-[11px] font-bold text-emerald-700 dark:bg-slate-800 dark:text-emerald-300">
                <Lock size={11} className="inline -mt-0.5" /> أيام هذه الديالة محفوظة — لا تُحذف بسهولة.
              </p>
            ) : (
              <button
                onClick={() => actions.lockRound(created.round.id, "manager")}
                className="w-full rounded-xl bg-emerald-600 px-3 py-2 text-[11px] font-bold text-white"
              >
                <ShieldCheck size={13} className="inline -mt-0.5" /> حفظ الديالة الآن حتى لا تُحذف أيامها بسهولة
              </button>
            );
          })()}
        </div>
      ) : null}

      <Card className="p-4">
        <div className="mb-3 flex items-center gap-2">
          <Layers size={16} className="text-emerald-600" />
          <h2 className="text-sm font-extrabold text-gray-800 dark:text-white">
            الديالات ({rounds.length})
          </h2>
          {archivedCount > 0 ? (
            <button
              onClick={() => setShowArchived((v) => !v)}
              className="mr-auto text-[11px] font-bold text-emerald-600"
            >
              {showArchived ? "إخفاء المؤرشفة" : `عرض المؤرشفة (${archivedCount})`}
            </button>
          ) : null}
        </div>

        {rounds.length === 0 ? (
          <EmptyState
            icon={<Layers size={24} />}
            title="لا توجد ديالات مسجّلة"
            description="أضف ديالة بتحديد يوم البداية وعدد الأيام، وسيُحسب تاريخ النهاية تلقائيًا."
          />
        ) : (
          <>
            <p className="mb-2 rounded-2xl bg-emerald-50 px-3 py-2 text-[11px] leading-relaxed text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
              <ShieldCheck size={12} className="inline -mt-0.5" /> بعد تسجيل أيام الديالة اضغط «حفظ أيام الديالة» —
              فبعد الحفظ لا تُحذف الأيام ولا تُؤرشف إلا بفك الحفظ بسبب موثّق.
            </p>
            <div className="space-y-3">
              {rounds.map((round) => (
                <RoundCard key={round.id} round={round} onOpenDay={onOpenDay} />
              ))}
            </div>
          </>
        )}
      </Card>

      <Card className="p-4">
        <div className="mb-3 flex items-center gap-2">
          <ListOrdered size={16} className="text-emerald-600" />
          <h2 className="text-sm font-extrabold text-gray-800 dark:text-white">الجدول الأساسي (مرجعي)</h2>
          <span className="mr-auto text-[11px] text-gray-400">
            {activeShareholders(state, pump.id).length} مساهم · {formatNumber(units)} {pump.shareUnit} ·{" "}
            {toHours(window.capacityMin)} ساعة
          </span>
        </div>
        {rows.length === 0 ? (
          <EmptyState
            icon={<Users size={24} />}
            title="لا يوجد مساهمون أساسيون"
            description="الجدول الأساسي يُبنى من المساهمين الأساسيين وساعاتهم."
          />
        ) : (
          <div className="space-y-2">
            {rows.map((row, i) => {
              const right = currentRight(state, row.shareholder.id);
              return (
                <div
                  key={row.shareholder.id}
                  className="flex items-center gap-3 rounded-2xl bg-gray-50 px-3 py-2 dark:bg-slate-700"
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white text-[11px] font-black text-emerald-700 dark:bg-slate-800">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-extrabold text-gray-800 dark:text-white">
                      {personName(state, row.shareholder.personId)}
                    </div>
                    {right ? (
                      <div className="text-[10px] font-bold text-amber-600">
                        صاحب الحق الحالي: {personName(state, right.holderPersonId)} (
                        {right.kind === "rent" ? "مستأجر" : "حق"})
                      </div>
                    ) : (
                      <div className="text-[10px] text-gray-400">السهم بيد المساهم نفسه</div>
                    )}
                  </div>
                  <div className="text-left text-[11px] font-bold text-gray-500 dark:text-slate-300">
                    <div>
                      {formatNumber(row.units)} {pump.shareUnit}
                    </div>
                    <div>{formatDuration(row.derivedHoursMin)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        <p className="mt-2 text-[10px] leading-relaxed text-gray-400">
          الجدول الأساسي مرجعي فقط، واليوم الفعلي لا يغيّره. يمكن أن يختلف ترتيب اليوم الفعلي عن ترتيب الجدول.
        </p>
      </Card>

      <Card className="p-4">
        <h2 className="mb-2 text-sm font-extrabold text-gray-800 dark:text-white">دورة العمل</h2>
        <ol className="list-inside list-decimal space-y-1 text-[11px] text-gray-500 dark:text-slate-300">
          <li>حدّد يوم بداية الديالة وعدد أيامها — يُحسب تاريخ النهاية تلقائيًا</li>
          <li>تُنشأ أيام الديالة بقوائم أساسيين فارغة — تضيف أساسيي كل يوم بنفسك، وكل يوم مستقل عن غيره</li>
          <li>لا يوجد يوم خارج الديالة — أي يوم تُنشئه من شاشة اليوم الفعلي ينتمي إلى ديالته</li>
          <li>بعد آخر يوم تنتهي الديالة، ويعود الدوران من جديد بديالة تالية من اليوم الأول</li>
          <li>افتح اليوم الفعلي وأضف الأشخاص وعدّل الترتيب بحرية</li>
          <li>سجّل الاستخدام الفعلي والتوقفات، واقرأ التعارضات</li>
          <li>أغلق اليوم عند الانتهاء — والتعديل اللاحق يحتاج إعادة فتح موثّقة</li>
        </ol>
      </Card>
    </div>
  );
}

function RoundCard({
  round,
  onOpenDay,
}: {
  round: DialaRound;
  onOpenDay: (id: string | null) => void;
}) {
  const { state, actions } = useApp();
  const pump = state.pump!;
  const days = roundDays(state, round.id);
  const done = days.filter((d) => d.status === "closed" || d.status === "completed").length;
  const todayIndex = roundDates(round.startDate, round.days).indexOf(todayISO()) + 1;
  const [lockOpen, setLockOpen] = useState(false);
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);

  const openOrCreateDay = (date: string) => {
    const existing = state.days.find((d) => !d.archived && d.date === date);
    if (existing) {
      onOpenDay(existing.id);
      return;
    }
    const id = uid("day");
    actions.createDay(
      {
        id,
        pumpId: pump.id,
        dialaNumber: round.number,
        roundId: round.id,
        date,
        status: "draft",
        workStart: pump.workStart,
        workEnd: pump.workEnd,
        capacityMin: durationMin(pump.workStart, pump.workEnd),
        plannedWorkStart: pump.workStart,
        plannedWorkEnd: pump.workEnd,
        plannedCapacityMin: durationMin(pump.workStart, pump.workEnd),
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
      },
      true,
      []
    );
    onOpenDay(id);
  };

  return (
    <div
      className={cx(
        "rounded-2xl border px-3 py-3",
        round.archived
          ? "border-dashed border-gray-200 opacity-70 dark:border-slate-600"
          : round.locked
            ? "border-emerald-200 bg-emerald-50/30 dark:border-emerald-900/40 dark:bg-emerald-900/10"
            : "border-gray-100 dark:border-slate-700"
      )}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-extrabold text-gray-800 dark:text-white">
              ديالة {round.number}
            </span>
            <Pill tone={done === round.days && round.days > 0 ? "green" : "gray"}>
              {done} من {round.days} أيام منتهية
            </Pill>
            <Pill tone={round.locked ? "green" : "amber"}>
              {round.locked ? (
                <>
                  <Lock size={10} /> محفوظة
                </>
              ) : (
                "غير محفوظة"
              )}
            </Pill>
            {todayIndex > 0 ? (
              <Pill tone="blue">اليوم {dayOrdinal(todayIndex)} من الديالة</Pill>
            ) : null}
            {round.archived ? <Pill tone="amber">مؤرشفة</Pill> : null}
          </div>
          <div className="mt-1 text-[11px] text-gray-400">
            من {isoToDisplay(round.startDate)} إلى {isoToDisplay(round.endDate)} · {round.days} يوم — من اليوم الأول إلى
            اليوم {dayOrdinal(round.days)}، ثم يعود الدوران بديالة جديدة
            {round.notes ? ` · ${round.notes}` : ""}
          </div>
        </div>
      </div>

      <BaseRosterPanel round={round} actor="manager" />

      <div className="mt-2 grid grid-cols-4 gap-1 sm:grid-cols-7">
        {Array.from({ length: round.days }, (_, i) => {
          const date = addDaysISO(round.startDate, i);
          const day = state.days.find((d) => !d.archived && d.date === date) ?? null;
          const summary = day ? daySummary(state, day, pump) : null;
          return (
            <button
              key={date}
              onClick={() => openOrCreateDay(date)}
              title={
                day
                  ? `اليوم ${dayOrdinal(i + 1)} للديالة ${round.number} — ${isoToDisplay(date)} · ${statusLabel(day.status)}${
                      summary ? ` · ${summary.persons} شخص` : ""
                    } · الدوام الفعلي: ${summary?.persons ?? 0}`
                  : `إنشاء اليوم ${dayOrdinal(i + 1)} للديالة ${round.number} — ${isoToDisplay(date)} · دوام فعلي فارغ`
              }
              aria-label={`اليوم ${dayOrdinal(i + 1)} للديالة ${round.number}`}
              className={cx(
                "rounded-xl border px-1 py-1.5 text-center text-[10px] font-bold transition",
                day ? chipTone(day.status) : "border-dashed border-gray-200 text-gray-400 dark:border-slate-600 dark:text-slate-400"
              )}
            >
              <span className="block">اليوم {dayOrdinal(i + 1)}</span>
              <span className="block text-[9px] font-normal opacity-70">{isoToShort(date)}</span>
              <span className="block text-[9px] font-bold opacity-80" data-testid={`round-${round.number}-day-roster-${i + 1}`}>
                {day ? `${summary?.persons ?? 0} في الفعلي` : "لم يُفتح"}
              </span>
            </button>
          );
        })}
      </div>

      {(() => {
        const people = rosterPersonSummaries(state, round);
        if (people.length === 0) {
          return (
            <p className="mt-2 rounded-2xl bg-gray-50 px-3 py-2 text-[10px] leading-relaxed text-gray-500 dark:bg-slate-700 dark:text-slate-300">
              الكشف فارغ — أضف أسماء المساهمين ونصيب كل واحد أعلاه (بحدّ ساعات التشغيل)، ثم ابدأ «الدوام الفعلي» لكل
              يوم من داخل اليوم.
            </p>
          );
        }
        return (
          <div className="mt-3">
            <div className="mb-1 flex items-center gap-1.5 text-[11px] font-extrabold text-gray-700 dark:text-slate-200">
              <ListOrdered size={13} className="text-emerald-600" /> تداول الديالة (النصيب مقابل الدوام الفعلي)
            </div>
            <div className="space-y-1">
              {people.map((p) => (
                <div
                  key={p.personId}
                  className="flex flex-wrap items-center gap-2 rounded-xl bg-gray-50 px-3 py-1.5 text-[10px] dark:bg-slate-700"
                >
                  <span className="min-w-0 flex-1 truncate font-extrabold text-gray-800 dark:text-white">{p.name}</span>
                  <span className="text-gray-500 dark:text-slate-300">
                    الأيام: {p.dayNumbers.map((n) => dayOrdinal(n)).join("، ")}
                  </span>
                  <span className="font-bold text-gray-600 dark:text-slate-200">
                    نصيبه {formatDuration(p.baseMin)}
                  </span>
                  <Pill tone={p.dayNumbers.length === 0 ? "gray" : p.diffMin === 0 ? "green" : p.diffMin > 0 ? "amber" : "blue"}>
                    {p.dayNumbers.length === 0
                      ? "لم يظهر في الدوام الفعلي بعد"
                      : `الفعلي ${formatDuration(p.actualTotalMin)} (${p.diffMin > 0 ? "+" : "−"}${formatDuration(Math.abs(p.diffMin))})`}
                  </Pill>
                </div>
              ))}
            </div>
          </div>
        );
      })()}

      <div className="mt-2 flex flex-wrap gap-1.5">
        {round.archived ? (
          <button
            onClick={() => actions.archiveRound(round.id, false, { actor: "manager" })}
            className="rounded-xl bg-emerald-50 px-3 py-1.5 text-[11px] font-bold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
          >
            <ArchiveRestore size={12} className="inline -mt-0.5" /> استرجاع الديالة وأيامها
          </button>
        ) : round.locked ? (
          <button
            onClick={() => setUnlockOpen(true)}
            aria-label={`فك حفظ ديالة ${round.number}`}
            className="rounded-xl bg-amber-50 px-3 py-1.5 text-[11px] font-bold text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
          >
            <LockOpen size={12} className="inline -mt-0.5" /> فك الحفظ (لتعديل أو أرشفة)
          </button>
        ) : (
          <button
            onClick={() => setLockOpen(true)}
            aria-label={`حفظ ديالة ${round.number}`}
            className="rounded-xl bg-emerald-600 px-3 py-1.5 text-[11px] font-bold text-white"
          >
            <ShieldCheck size={12} className="inline -mt-0.5" /> حفظ أيام الديالة ({days.length} يوم)
          </button>
        )}
        {!round.archived ? (
          <button
            onClick={() => setArchiveOpen(true)}
            aria-label={`أرشفة ديالة ${round.number}`}
            className="rounded-xl bg-red-50 px-3 py-1.5 text-[11px] font-bold text-red-600 dark:bg-red-900/30 dark:text-red-300"
          >
            <Archive size={12} className="inline -mt-0.5" /> أرشفة
          </button>
        ) : null}
      </div>

      <p className="mt-2 text-[10px] leading-relaxed text-gray-400">
        {round.archived
          ? "الديالة مؤرشفة وأيامها مؤرشفة — يمكن استرجاعها في أي وقت دون فقدان أي سجل."
          : round.locked
            ? `أيام الديالة محفوظة${round.lockedAt ? ` بتاريخ ${isoToShort(round.lockedAt.slice(0, 10))}` : ""} — لا تُحذف ولا تُؤرشف إلا بفك الحفظ بسبب موثّق.`
            : "الديالة غير محفوظة بعد — اضغط «حفظ أيام الديالة» لتثبيتها ومنع حذف أيامها بسهولة."}
        {days.length === 0
          ? " لا توجد أيام مسجّلة بعد — اضغط على أي يوم لإنشائه من الجدول الأساسي."
          : ` المسجّل منها: ${days.length} من ${round.days}.`}
      </p>

      <Modal open={lockOpen} onClose={() => setLockOpen(false)} title={`حفظ ديالة ${round.number}`}>
        <div className="space-y-3">
          <p className="rounded-2xl bg-emerald-50 px-3 py-3 text-xs leading-relaxed text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
            سيتم تثبيت أيام الديالة: من {isoToDisplay(round.startDate)} إلى {isoToDisplay(round.endDate)} —{" "}
            {round.days} يوم (المسجّل منها الآن {days.length}). بعد الحفظ لا يمكن حذف أو أرشفة أي يوم من أيام الديالة
            إلا بفك الحفظ بسبب موثّق يُسجَّل في سجل التدقيق.
          </p>
          <Button
            className="w-full"
            onClick={() => {
              actions.lockRound(round.id, "manager");
              setLockOpen(false);
            }}
          >
            <ShieldCheck size={16} /> حفظ الديالة وأيامها ({days.length} يوم)
          </Button>
        </div>
      </Modal>

      <Modal open={unlockOpen} onClose={() => setUnlockOpen(false)} title={`فك حفظ ديالة ${round.number}`}>
        <ReasonForm
          message="فك الحفظ يسمح بتعديل أيام الديالة أو أرشفتها. السبب يُسجَّل مع اسمك ووقت التنفيذ في سجل التدقيق، ولا تُحذف أي بيانات."
          label="سبب فك الحفظ"
          submitLabel="تأكيد فك الحفظ"
          onSubmit={(reason) => {
            actions.unlockRound(round.id, reason, "manager");
            setUnlockOpen(false);
          }}
        />
      </Modal>

      <Modal open={archiveOpen} onClose={() => setArchiveOpen(false)} title={`أرشفة ديالة ${round.number}`}>
        <ReasonForm
          message={
            round.locked
              ? `ديالة ${round.number} محفوظة — لا يُسمح بأرشفتها مباشرة. اكتب السبب ليُفك الحفظ ثم تُؤرشف الديالة وأيامها معًا، مع الحفاظ على كل السجلات وعدم حذف أي بيانات.`
              : `سيتم أرشفة ديالة ${round.number} وكل أيامها (${round.days} يوم) — الأرشفة حذف ناعم ولا تُفقد أي سجلات، ويمكن استرجاعها لاحقًا.`
          }
          label="سبب الأرشفة"
          submitLabel={round.locked ? "فك الحفظ وأرشفة الديالة" : "تأكيد الأرشفة"}
          tone={round.locked ? "amber" : "red"}
          onSubmit={(reason) => {
            if (round.locked) actions.unlockRound(round.id, reason, "manager");
            actions.archiveRound(round.id, true, {
              reason,
              actor: "manager",
              force: round.locked,
            });
            setArchiveOpen(false);
          }}
        />
      </Modal>
    </div>
  );
}

/** نموذج سبب موثّق — لا يُنفَّذ أي إجراء حساس بدون سبب مسجّل */
function ReasonForm({
  message,
  label,
  submitLabel,
  tone = "amber",
  onSubmit,
}: {
  message: string;
  label: string;
  submitLabel: string;
  tone?: "amber" | "red";
  onSubmit: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  return (
    <div className="space-y-3">
      <p
        className={cx(
          "rounded-2xl px-3 py-3 text-xs leading-relaxed",
          tone === "red"
            ? "bg-red-50 text-red-800 dark:bg-red-900/20 dark:text-red-300"
            : "bg-amber-50 text-amber-800 dark:bg-amber-900/20 dark:text-amber-300"
        )}
      >
        {message}
      </p>
      <Field label={label}>
        <TextInput value={reason} onChange={(e) => setReason(e.target.value)} placeholder="اكتب السبب…" autoFocus />
      </Field>
      <Button
        variant={tone === "red" ? "danger" : "primary"}
        className="w-full"
        onClick={() => onSubmit(reason.trim())}
        disabled={!reason.trim()}
      >
        {submitLabel}
      </Button>
      <p className="text-center text-[10px] text-gray-400">
        لن يُنفَّذ الإجراء بدون سبب — يُحفظ السبب مع اسمك ووقت التنفيذ.
      </p>
    </div>
  );
}

function DayMini({
  label,
  day,
  onOpen,
}: {
  label: string;
  day: DialaDay | null;
  onOpen: (id: string) => void;
}) {
  const { state } = useApp();
  const pump = state.pump!;
  if (!day) {
    return (
      <div className="rounded-2xl bg-gray-50 px-3 py-3 text-[11px] text-gray-400 dark:bg-slate-700">
        <div className="font-bold">{label}</div>
        <div className="mt-1">لا توجد</div>
      </div>
    );
  }
  const summary = daySummary(state, day, pump);
  return (
    <button
      onClick={() => onOpen(day.id)}
      className="rounded-2xl bg-emerald-50 px-3 py-3 text-right dark:bg-emerald-900/30"
    >
      <div className="flex items-center gap-1.5">
        <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-300">{label}</span>
        <DayStatusPill status={day.status} />
      </div>
      <div className="mt-1 text-xs font-extrabold text-emerald-800 dark:text-emerald-200">
        {dialaDayTitle(state, day)}
      </div>
      <div className="text-[10px] text-emerald-700 dark:text-emerald-300">{isoToShort(day.date)}</div>
      <div className="mt-1 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
        {summary.persons} شخص · {formatDuration(summary.plannedMin)}
      </div>
    </button>
  );
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    scheduled: "مجدول",
    draft: "مسودة",
    in_progress: "جارٍ التنفيذ",
    completed: "مكتمل",
    closed: "مغلق",
    revised: "معدّل",
  };
  return map[status] ?? status;
}

function chipTone(status: string): string {
  const map: Record<string, string> = {
    scheduled: "border-gray-200 bg-gray-50 text-gray-500 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300",
    draft:
      "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/40 dark:bg-amber-900/20 dark:text-amber-300",
    in_progress:
      "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/40 dark:bg-sky-900/20 dark:text-sky-300",
    completed:
      "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-900/20 dark:text-emerald-300",
    closed:
      "border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
    revised:
      "border-amber-300 bg-amber-100 text-amber-800 dark:border-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  };
  return map[status] ?? map.scheduled;
}
