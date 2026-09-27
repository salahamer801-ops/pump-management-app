/**
 * قسم **الدوام الأساسي** في شاشة اليوم — عرض كشف الديالة (وهو كشف واحد لكل أيامها).
 * القراءة أولًا، وزر «تعديل الكشف» يفتح نفس محرّر الكشف المستخدم في شاشة الديالات،
 * فلا تتكرّر البيانات ولا تختلف النسخ.
 */
import { useMemo, useState } from "react";
import { ListOrdered, PencilLine, Lock } from "lucide-react";
import { useApp } from "../../store";
import {
  baseRosterCapacityMin,
  baseRosterRemainingMin,
  baseRosterTimeline,
  baseRosterTotalMin,
  dayNumberInRound,
  dayOrdinal,
} from "../../domain/rules";
import type { DialaDay } from "../../domain/types";
import { formatDuration, toHours } from "../../domain/util";
import { Button, Card, Pill } from "../../components/ui";
import { roleLabel } from "../../components/PersonPicker";
import BaseRosterPanel from "./BaseRosterPanel";

const PREVIEW = 8;

export default function DayBaseShiftCard({ day, actor }: { day: DialaDay; actor: string }) {
  const { state } = useApp();
  const pump = state.pump!;
  const round = state.rounds.find((r) => r.id === day.roundId) ?? null;
  const rows = useMemo(
    () => (round ? baseRosterTimeline(state, pump, round.id) : []),
    [state, pump, round]
  );
  const totalMin = round ? baseRosterTotalMin(state, round.id) : 0;
  const remainingMin = round ? baseRosterRemainingMin(state, pump, round.id) : baseRosterCapacityMin(pump);
  const capacityMin = baseRosterCapacityMin(pump);
  const [showAll, setShowAll] = useState(false);
  const [editing, setEditing] = useState(false);

  const visible = showAll ? rows : rows.slice(0, PREVIEW);

  return (
    <Card className="p-4" data-testid="day-base-shift">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <ListOrdered size={16} className="text-emerald-600" />
        <h2 className="text-sm font-extrabold text-gray-800 dark:text-white">
          الدوام الأساسي — كشف {round ? `ديالة ${round.number}` : "الديالة"}
          {round ? ` (اليوم ${dayOrdinal(dayNumberInRound(state, day))} من ${round.days})` : ""}
        </h2>
        {round?.rosterLocked ? (
          <Pill tone="green">
            <Lock size={10} /> مثبَّت
          </Pill>
        ) : null}
        <span className="mr-auto text-[11px] text-gray-400">
          {rows.length} شخصًا · {formatDuration(totalMin)} من {toHours(capacityMin)} ساعة
        </span>
      </div>

      {!round ? (
        <p className="rounded-2xl bg-amber-50 px-3 py-2 text-[11px] text-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
          هذا اليوم غير مرتبط بديالة — الكشف يُسجَّل لكل ديالة.
        </p>
      ) : rows.length === 0 ? (
        <p className="rounded-2xl bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-800 dark:bg-amber-900/20 dark:text-amber-300" data-testid="day-base-empty">
          لم تُسجَّل أسماء الدوام الأساسي لهذه الديالة بعد — أضف المساهمين ونصيب كل واحد (بحدّ {toHours(capacityMin)}{" "}
          ساعة تشغيل)، ثم ابدأ الدوام الفعلي.
        </p>
      ) : (
        <>
          <div className="space-y-1">
            {visible.map((row, index) => (
              <div
                key={row.member.id}
                className="flex items-center gap-2 rounded-xl bg-gray-50 px-3 py-1.5 text-[11px] dark:bg-slate-700"
                data-testid={`day-base-row-${index + 1}`}
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-white text-[10px] font-black text-emerald-700 dark:bg-slate-800 dark:text-emerald-300">
                  {index + 1}
                </span>
                <span className="min-w-0 flex-1 truncate font-extrabold text-gray-800 dark:text-white">
                  {row.name}
                </span>
                <span className="hidden text-gray-400 sm:block">{roleLabel(row.role)}</span>
                <span className="text-gray-500 dark:text-slate-300">
                  {row.startTime} → {row.endTime}
                </span>
                <span className="font-bold text-emerald-700 dark:text-emerald-300">
                  {formatDuration(row.shareMin)}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {rows.length > PREVIEW ? (
              <button
                className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300"
                onClick={() => setShowAll((v) => !v)}
                data-testid="day-base-toggle"
              >
                {showAll ? "إظهار أقل" : `إظهار كل الأسماء (${rows.length})`}
              </button>
            ) : null}
            <span className="text-[10px] text-gray-400">
              المتبقي من ساعات التشغيل: {formatDuration(remainingMin)}
            </span>
            <Button
              variant="ghost"
              className="mr-auto px-3 py-1.5 text-[11px]"
              onClick={() => setEditing((v) => !v)}
              data-testid="day-base-edit"
            >
              <PencilLine size={13} /> {editing ? "إغلاق تعديل الكشف" : "تعديل الكشف"}
            </Button>
          </div>
        </>
      )}

      {round && (editing || rows.length === 0) ? (
        <BaseRosterPanel round={round} actor={actor} defaultExpanded />
      ) : null}
    </Card>
  );
}
