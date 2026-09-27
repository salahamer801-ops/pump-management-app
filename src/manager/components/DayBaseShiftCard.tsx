/**
 * بطاقة **مساهمو ديالة اليوم — للعرض فقط**.
 *
 * قاعدة المشروع: قائمة مساهمي الديالة (الكشف) مرجع واحد يُدار في شاشة الديالات
 * (أيام الديالة) فقط — لا تُضاف ولا تُعدَّل من هنا. وهذه البطاقة **لا تحجز أي
 * ساعة** من تشغيل المضخة: دوام اليوم الفعلي يبنيه المسؤول مشاركًا مشاركًا.
 */
import { useMemo, useState } from "react";
import { ArrowLeft, ListOrdered, Lock, Phone } from "lucide-react";
import { useApp } from "../../store";
import {
  baseRosterCapacityMin,
  baseRosterTimeline,
  baseRosterTotalMin,
  shareUseNote,
} from "../../domain/rules";
import type { DialaDay } from "../../domain/types";
import { formatDuration, toHours } from "../../domain/util";
import { Card, Pill } from "../../components/ui";

const PREVIEW = 8;

export default function DayBaseShiftCard({
  day,
  onManageList,
}: {
  day: DialaDay;
  /** الانتقال إلى شاشة الديالات حيث الإدارة الكاملة للكشف */
  onManageList?: () => void;
}) {
  const { state } = useApp();
  const pump = state.pump!;
  const round = state.rounds.find((r) => r.id === day.roundId) ?? null;
  const rows = useMemo(
    () => (round ? baseRosterTimeline(state, pump, round.id) : []),
    [state, pump, round]
  );
  const totalMin = round ? baseRosterTotalMin(state, round.id) : 0;
  const capacityMin = baseRosterCapacityMin(pump);
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? rows : rows.slice(0, PREVIEW);

  return (
    <Card className="p-4" data-testid="day-base-shift">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <ListOrdered size={16} className="text-sky-600 dark:text-sky-300" />
        <h2 className="text-sm font-extrabold text-gray-800 dark:text-white">
          مساهمو ديالة اليوم — للعرض فقط
        </h2>
        {round?.rosterLocked ? (
          <Pill tone="teal">
            <Lock size={10} /> مثبَّت
          </Pill>
        ) : null}
        <span className="mr-auto text-[11px] text-gray-400">
          {rows.length} شخصًا · {formatDuration(totalMin)}
        </span>
      </div>

      {!round ? (
        <p
          className="rounded-2xl bg-amber-50 px-3 py-2 text-[11px] text-amber-800 dark:bg-amber-900/20 dark:text-amber-300"
          data-testid="day-base-no-round"
        >
          هذا اليوم غير مرتبط بديالة — الكشف يُسجَّل لكل ديالة.
        </p>
      ) : rows.length === 0 ? (
        <p
          className="rounded-2xl bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-800 dark:bg-amber-900/20 dark:text-amber-300"
          data-testid="day-base-empty"
        >
          لم تُسجَّل أسماء كشف ديالة {round.number} بعد — أضف القائمة كاملة من شاشة الديالات، ثم ابنِ دوام
          هذا اليوم مشاركًا مشاركًا.
        </p>
      ) : (
        <>
          <div className="space-y-1">
            {visible.map((row, index) => {
              const use = shareUseNote(state, pump.id, row.personId, day.date);
              return (
                <div
                  key={row.member.id}
                  className="flex items-center gap-2 rounded-xl bg-sky-50/60 px-3 py-1.5 text-[11px] dark:bg-slate-700"
                  data-testid={`day-base-row-${index + 1}`}
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-cyan-600 text-[10px] font-black text-white">
                    {index + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate font-extrabold text-gray-800 dark:text-white">
                    {row.name}
                  </span>
                  {use ? (
                    <span
                      className="shrink-0 rounded-lg bg-white px-1.5 py-0.5 text-[10px] font-bold text-amber-700 dark:bg-slate-800 dark:text-amber-300"
                      title={use.holder ? `صاحب الحق: ${use.holder}` : undefined}
                    >
                      {use.label}
                    </span>
                  ) : null}
                  <span className="shrink-0 font-bold text-sky-700 dark:text-sky-300">
                    {formatDuration(row.shareMin)}
                  </span>
                  {row.phone ? (
                    <a
                      href={`tel:${row.phone}`}
                      dir="ltr"
                      className="hidden shrink-0 items-center gap-0.5 text-[10px] font-bold text-gray-500 sm:flex dark:text-slate-300"
                    >
                      <Phone size={10} /> {row.phone}
                    </a>
                  ) : null}
                </div>
              );
            })}
          </div>
          {rows.length > PREVIEW ? (
            <button
              className="mt-2 text-[11px] font-bold text-sky-700 dark:text-sky-300"
              onClick={() => setShowAll((v) => !v)}
              data-testid="day-base-toggle"
            >
              {showAll ? "إظهار أقل" : `إظهار كل الأسماء (${rows.length})`}
            </button>
          ) : null}
        </>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          onClick={onManageList}
          className="flex items-center gap-1 rounded-2xl border border-sky-100 bg-sky-50 px-3 py-1.5 text-[11px] font-bold text-sky-700 transition hover:bg-sky-100 dark:border-sky-900/40 dark:bg-sky-900/25 dark:text-sky-300"
          data-testid="day-base-manage"
        >
          إدارة القائمة في أيام الديالة <ArrowLeft size={12} />
        </button>
        <span className="text-[10px] text-gray-400">
          نصيب الكشف لا يُحجز من ساعات التشغيل ({toHours(capacityMin)} ساعة) — الحجز يتم عند إدخال المشارك
          فعلًا.
        </span>
      </div>
    </Card>
  );
}
