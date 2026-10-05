import { useMemo, useState } from "react";
import { ArrowLeft, ListOrdered, Phone } from "lucide-react";
import { useApp } from "../../store";
import { dayEntries, entryMinutes, personName } from "../../domain/rules";
import type { DialaDay } from "../../domain/types";
import { formatDuration, toHours } from "../../domain/util";
import { Card, Pill } from "../../components/ui";

const PREVIEW = 8;

/** مصدر الحقيقة لمساهمي اليوم هو DayEntry.dayId، وليس كشفًا مشتركًا للديالة. */
export default function DayBaseShiftCard({
  day,
  onManageList,
}: {
  day: DialaDay;
  onManageList?: () => void;
}) {
  const { state } = useApp();
  const rows = useMemo(() => dayEntries(state, day.id), [state, day.id]);
  const totalMin = rows.reduce((sum, row) => sum + entryMinutes(row), 0);
  const capacityMin = day.capacityMin;
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? rows : rows.slice(0, PREVIEW);
  const remaining = Math.max(0, capacityMin - totalMin);

  return (
    <Card className="p-4" data-testid="day-base-shift">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <ListOrdered size={16} className="text-sky-600 dark:text-sky-300" />
        <h2 className="text-sm font-extrabold text-gray-800 dark:text-white">
          مساهمو اليوم — مستقلون عن بقية الأيام
        </h2>
        <Pill tone="blue">{rows.length} مساهم</Pill>
        <span className="mr-auto text-[11px] text-gray-400">{formatDuration(totalMin)} مسجّلة</span>
      </div>
      {rows.length === 0 ? (
        <p className="rounded-2xl bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-800 dark:bg-amber-900/20 dark:text-amber-300" data-testid="day-base-empty">
          لا يوجد مساهمون في هذا اليوم بعد — أضفهم من نافذة «إضافة مشارك في دوام اليوم». إضافة مساهم هنا لا تضيفه إلى أي يوم آخر.
        </p>
      ) : (
        <>
          <div className="space-y-1">
            {visible.map((row, index) => (
              <div key={row.id} className="flex items-center gap-2 rounded-xl bg-sky-50/60 px-3 py-1.5 text-[11px] dark:bg-slate-700" data-testid={`day-base-row-${index + 1}`}>
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-sky-500 to-cyan-600 text-[10px] font-black text-white">{index + 1}</span>
                <span className="min-w-0 flex-1 truncate font-extrabold text-gray-800 dark:text-white">{personName(state, row.personId)}</span>
                <span className="shrink-0 font-bold text-sky-700 dark:text-sky-300">{formatDuration(entryMinutes(row))}</span>
                {(() => {
                  const phone = state.persons.find((p) => p.id === row.personId)?.phone ?? "";
                  return phone ? <a href={`tel:${phone}`} dir="ltr" className="hidden shrink-0 items-center text-[10px] font-bold text-gray-500 sm:flex dark:text-slate-300"><Phone size={10} /> {phone}</a> : null;
                })()}
              </div>
            ))}
          </div>
          {rows.length > PREVIEW ? <button className="mt-2 text-[11px] font-bold text-sky-700 dark:text-sky-300" onClick={() => setShowAll((v) => !v)} data-testid="day-base-toggle">{showAll ? "إظهار أقل" : `إظهار كل الأسماء (${rows.length})`}</button> : null}
        </>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button onClick={onManageList} className="flex items-center gap-1 rounded-2xl border border-sky-100 bg-sky-50 px-3 py-1.5 text-[11px] font-bold text-sky-700 transition hover:bg-sky-100 dark:border-sky-900/40 dark:bg-sky-900/25 dark:text-sky-300" data-testid="day-base-manage">إدارة قائمة اليوم <ArrowLeft size={12} /></button>
        <span className="text-[10px] text-gray-400">الإجمالي {formatDuration(totalMin)} · المتبقي {formatDuration(remaining)} من {toHours(capacityMin)} ساعة</span>
      </div>
    </Card>
  );
}
