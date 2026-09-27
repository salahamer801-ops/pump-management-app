import { useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  Droplets,
  Eye,
  Info,
  Moon,
  NotebookPen,
  Plus,
  Timer,
  TrendingUp,
  Users,
} from "lucide-react";
import { useShareholder } from "../store";
import { useAuth } from "../../auth/AuthProvider";
import { readUserLink } from "../../domain/storage";
import { formatDuration, timeToMinutes, todayISO } from "../../domain/util";
import { activeCycles, currentDayOfCycle, findPump } from "../selectors";
import { cycleDayDate } from "../calc";
import { formatDayDate, formatHours, formatLiters, formatMoneyYER, gregorianToday, hijriToday } from "../format";
import { Button, Card, EmptyState, Pill, cx } from "../../components/ui";
import {
  linkedPumpViews,
  localPumpViews,
  nearestTurnAcross,
  type LinkedPumpView,
} from "../pumpView";
import { syncOfficialPumps } from "../officialSync";

type Tab = "home" | "pumps" | "cycles" | "turns" | "official" | "accounts" | "settings";

interface Props {
  onGoTo: (tab: Tab) => void;
}

export default function HomeScreen({ onGoTo }: Props) {
  const { state } = useShareholder();
  const { session } = useAuth();
  const memberships = session?.memberships ?? [];
  const localPersonId = readUserLink();

  /**
   * البيانات الرسمية تُقرأ من الخادم (PostgreSQL) لا من جهاز المسؤول،
   * فيرى المستخدم ما سجّله المسؤول حتى من جهاز آخر.
   */
  const [officialTick, setOfficialTick] = useState(0);
  const approvedKey = memberships
    .filter((m) => m.status === "approved")
    .map((m) => m.pumpId)
    .sort()
    .join(",");
  useEffect(() => {
    if (!approvedKey) return;
    let alive = true;
    void syncOfficialPumps(memberships).then(() => {
      if (alive) setOfficialTick((n) => n + 1);
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [approvedKey]);

  /**
   * بيانات المضخات المرتبطة — قراءة فقط من سجل المسؤول.
   * مضخات العضوية المعتمدة من الخادم + مضخات محفوظة على هذا الجهاز (وضع محلي).
   */
  const views = useMemo(() => {
    const linked = linkedPumpViews(memberships, localPersonId);
    const locals = localPumpViews(
      localPersonId,
      linked.map((v) => v.pumpId)
    );
    return [...linked, ...locals];
    // officialTick: يُعاد بناء العرض بعد وصول البيانات الرسمية من الخادم
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberships, localPersonId, officialTick]);
  const nearest = useMemo(() => nearestTurnAcross(views), [views]);

  const myRecords = state.turns
    .filter((t) => !t.archived)
    .slice()
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  const personalTotals = myRecords.reduce(
    (acc, t) => ({
      hours: acc.hours + (t.hours || 0),
      liters: acc.liters + (t.dieselLiters || 0),
      cost: acc.cost + (t.dieselCost || 0),
    }),
    { hours: 0, liters: 0, cost: 0 }
  );

  const cycling = usePersonalFallback();
  const hasLinked = views.length > 0;

  return (
    <div className="space-y-5">
      {/* ------------------------------- الترحيب ------------------------------- */}
      <div className="relative overflow-hidden rounded-[28px] bg-gradient-to-bl from-emerald-600 via-emerald-600 to-teal-700 p-5 text-white shadow-xl shadow-emerald-700/20">
        <div className="pointer-events-none absolute -left-10 -top-16 h-44 w-44 rounded-full bg-white/10 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-20 right-0 h-40 w-40 rounded-full bg-teal-300/20 blur-3xl" />
        <div className="relative">
          <div className="flex items-center justify-between">
            <div className="text-[11px] font-bold tracking-wide text-emerald-50/90">
              {gregorianToday()}
            </div>
            <span className="flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1 text-[10px] font-bold">
              <Moon size={11} /> {hijriToday() || "—"}
            </span>
          </div>
          <div className="mt-3 text-[13px] text-emerald-50">أهلًا بك</div>
          <div className="text-2xl font-black leading-tight">
            {state.profile.name || session?.user?.name || "مساهم"}
          </div>

          {hasLinked ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {views.map((v) => (
                <span
                  key={v.pumpId}
                  className="flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-[11px] font-bold backdrop-blur"
                >
                  <BadgeCheck size={13} /> {v.pumpName}
                  <span className="font-mono text-[10px] text-emerald-50/80">{v.pumpCode}</span>
                </span>
              ))}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => onGoTo("pumps")}
              className="mt-4 flex items-center gap-2 rounded-full bg-white/15 px-4 py-2 text-[11px] font-bold backdrop-blur transition hover:bg-white/25"
              data-testid="home-link-pump"
            >
              <Plus size={14} /> اربط حسابك بمضخة برقم تعريفها
            </button>
          )}
        </div>
      </div>

      {/* --------------------------- المضخات المرتبطة --------------------------- */}
      {hasLinked ? (
        <Section
          icon={<Droplets size={16} />}
          title="المضخات المرتبطة بحسابي"
          badge="اطلاع فقط"
          subtitle="كما هي مسجَّلة عند المسؤول"
        >
          <div className="space-y-3">
            {views.map((v) => (
              <PumpCard key={v.pumpId} view={v} onOpenOfficial={() => onGoTo("official")} />
            ))}
          </div>
        </Section>
      ) : null}

      {/* ----------------------------- أقرب دور لي ----------------------------- */}
      <Section
        icon={<TrendingUp size={16} />}
        title="أقرب دور لي"
        subtitle={hasLinked ? "من الأدوار المسجَّلة في المضخات" : "من أدواري في سجلي"}
      >
        {hasLinked ? (
          nearest ? (
            <Card className="overflow-hidden border-emerald-200 dark:border-emerald-800">
              <div className="flex items-center gap-4 bg-gradient-to-l from-emerald-50 to-white p-4 dark:from-emerald-900/30 dark:to-slate-800">
                <div className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-lg shadow-emerald-600/30">
                  <span className="text-xl font-black leading-none">
                    {Number(nearest.turn.day.date.slice(8, 10))}
                  </span>
                  <span className="mt-0.5 text-[10px] font-bold">
                    {nearest.view.round?.number
                      ? `ديالة ${nearest.view.round.number}`
                      : "ديالة"}
                  </span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-extrabold text-gray-900 dark:text-white">
                      {nearest.view.pumpName}
                    </span>
                    {nearest.turn.day.date === todayISO() ? (
                      <Pill tone="green">اليوم</Pill>
                    ) : (
                      <Pill tone="blue">قادم</Pill>
                    )}
                  </div>
                  <div className="mt-1 text-xs text-gray-500 dark:text-slate-300">
                    {formatDayDate(new Date(`${nearest.turn.day.date}T00:00:00`))} · اليوم{" "}
                    {nearest.turn.entry.orderIndex + 1} في الدوام الفعلي
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
                    <span className="flex items-center gap-1">
                      <Timer size={13} /> {nearest.turn.entry.startTime} → {nearest.turn.entry.endTime}
                    </span>
                    <span className="text-gray-400">
                      {formatDuration(
                        Math.max(
                          0,
                          timeToMinutes(nearest.turn.entry.endTime) -
                            timeToMinutes(nearest.turn.entry.startTime)
                        )
                      )}
                    </span>
                  </div>
                </div>
              </div>
            </Card>
          ) : (
            <Card className="p-4 text-center">
              <Info size={20} className="mx-auto mb-2 text-emerald-500" />
              <div className="text-sm font-bold text-gray-700 dark:text-slate-200">
                لا يوجد دور قادم مسجَّل لك في المضخات
              </div>
              <p className="mt-1 text-[11px] leading-relaxed text-gray-400 dark:text-slate-400">
                الأدوار هنا تأتي من سجل المسؤول — يُحدَّث بعد تسجيله لك دورًا.
              </p>
            </Card>
          )
        ) : cycling.nearest ? (
          <Card className="overflow-hidden border-emerald-200 dark:border-emerald-800">
            <div className="flex items-center gap-4 bg-gradient-to-l from-emerald-50 to-white p-4 dark:from-emerald-900/30 dark:to-slate-800">
              <div className="flex h-16 w-16 shrink-0 flex-col items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-lg shadow-emerald-600/30">
                <span className="text-xl font-black leading-none">{cycling.nearest.day}</span>
                <span className="mt-0.5 text-[10px] font-bold">اليوم</span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-extrabold text-gray-900 dark:text-white">
                    {cycling.nearest.pumpName}
                  </span>
                  {cycling.nearest.isToday ? <Pill tone="green">اليوم</Pill> : null}
                </div>
                <div className="mt-0.5 text-xs text-gray-500 dark:text-slate-300">
                  {formatDayDate(cycling.nearest.date)}
                </div>
                <div className="mt-0.5 text-[11px] text-gray-400">{cycling.nearest.cycleName}</div>
              </div>
            </div>
          </Card>
        ) : (
          <EmptyState
            icon={<CalendarClock size={26} />}
            title="لا توجد أدوار قادمة"
            description="أضف مضخة وأنشئ دياله لتظهر أدوارك هنا."
            action={
              <div className="flex flex-col gap-2">
                <Button onClick={() => onGoTo("cycles")}>
                  <Plus size={16} /> إنشاء دياله
                </Button>
                <Button variant="secondary" onClick={() => onGoTo("pumps")}>
                  إضافة مضخة
                </Button>
              </div>
            }
          />
        )}
      </Section>

      {/* --------------------------- سجلي الشخصي --------------------------- */}
      <Section
        icon={<NotebookPen size={16} />}
        title="ما سجّلته في سجلي الشخصي"
        subtitle={`${myRecords.length} سجل · ${formatHours(personalTotals.hours)}`}
      >
        {myRecords.length === 0 ? (
          <Card className="p-4 text-center">
            <p className="text-[11px] leading-relaxed text-gray-500 dark:text-slate-300">
              لم تسجّل شيئًا بعد. سجلك الشخصي مستقل تمامًا: المسؤول لا يراه ولا يُعدَّل به أي شيء في حسابه.
            </p>
            <Button
              variant="secondary"
              className="mt-3 w-full"
              onClick={() => onGoTo("official")}
              data-testid="home-add-personal"
            >
              <Plus size={16} /> تسجيل استخدام
            </Button>
          </Card>
        ) : (
          <Card className="divide-y divide-gray-50 dark:divide-slate-700">
            {myRecords.slice(0, 4).map((r) => (
              <div key={r.id} className="flex items-center gap-3 p-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300">
                  <CalendarDays size={17} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-extrabold text-gray-800 dark:text-white">
                    {r.date} · {r.startTime} → {r.endTime}
                  </div>
                  <div className="text-[11px] text-gray-400 dark:text-slate-400">
                    {formatHours(r.hours)} · {formatLiters(r.dieselLiters)} ·{" "}
                    {formatMoneyYER(r.dieselCost)}
                  </div>
                </div>
                <Pill tone={r.royaltyPaid ? "green" : "amber"}>
                  {r.royaltyPaid ? "الرواس سُدّد" : "أجل"}
                </Pill>
              </div>
            ))}
            <button
              type="button"
              onClick={() => onGoTo("accounts")}
              className="flex w-full items-center justify-center gap-1 py-3 text-[11px] font-bold text-emerald-700 dark:text-emerald-300"
              data-testid="home-personal-all"
            >
              كل ما سجّلته <ChevronLeft size={14} />
            </button>
          </Card>
        )}
      </Section>

      {/* ------------------- الديالات (للمستخدم بلا حساب مرتبط) ------------------- */}
      {!hasLinked && cycling.cycles.length > 0 ? (
        <Section icon={<CalendarDays size={16} />} title="يوم الدياله" subtitle="من بياناتي">
          <div className="space-y-2">
            {cycling.cycles.map((c) => (
              <Card key={c.id} className="flex items-center gap-3 p-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                  <Droplets size={20} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-extrabold text-gray-900 dark:text-white">
                    {c.pumpName}
                  </div>
                  <div className="text-[11px] text-gray-400 dark:text-slate-400">
                    {c.name} · {c.days} يوم
                  </div>
                </div>
                {c.day !== null ? (
                  <div className="text-left">
                    <div className="text-[10px] text-gray-400">اليوم</div>
                    <div className="text-lg font-black text-emerald-700 dark:text-emerald-400">
                      {c.day}
                    </div>
                  </div>
                ) : (
                  <Pill tone={c.status === "انتهت" ? "gray" : "amber"}>{c.status}</Pill>
                )}
              </Card>
            ))}
          </div>
        </Section>
      ) : null}
    </div>
  );
}

/* ------------------------------- أجزاء مساعدة ------------------------------- */

function Section({
  icon,
  title,
  subtitle,
  badge,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  badge?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2.5">
      <div className="flex items-center gap-2 px-1">
        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-extrabold text-gray-900 dark:text-white">{title}</div>
          {subtitle ? (
            <div className="text-[10px] text-gray-400 dark:text-slate-400">{subtitle}</div>
          ) : null}
        </div>
        {badge ? (
          <span className="flex items-center gap-1 rounded-full bg-gray-100 px-2 py-1 text-[9px] font-bold text-gray-500 dark:bg-slate-700 dark:text-slate-300">
            <Eye size={10} /> {badge}
          </span>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function MiniStat({
  label,
  value,
  tone = "gray",
}: {
  label: string;
  value: string;
  tone?: "gray" | "green" | "blue" | "amber";
}) {
  const tones = {
    gray: "bg-gray-50 text-gray-700 dark:bg-slate-700 dark:text-slate-200",
    green: "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
    blue: "bg-sky-50 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300",
    amber: "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
  } as const;
  return (
    <div className={cx("rounded-2xl px-3 py-2", tones[tone])}>
      <div className="text-[9px] font-bold opacity-70">{label}</div>
      <div className="mt-0.5 text-sm font-black leading-tight">{value}</div>
    </div>
  );
}

function PumpCard({ view, onOpenOfficial }: { view: LinkedPumpView; onOpenOfficial: () => void }) {
  const statusLabel =
    view.roundStatus === "inside"
      ? view.dayNumber
        ? `اليوم ${view.dayNumber} من ${view.totalDays}`
        : `ديالة ${view.round?.number ?? ""}`
      : view.roundStatus === "before"
        ? `تبدأ ${view.round?.startDate ?? ""}`
        : view.roundStatus === "after"
          ? "انتهت الديالة"
          : "لا توجد ديالة";
  const pct =
    view.roundStatus === "inside" && view.dayNumber && view.totalDays
      ? Math.min(100, Math.round((view.dayNumber / view.totalDays) * 100))
      : 0;
  const sharePct =
    view.capacityMinutes > 0 ? Math.min(100, Math.round((view.baseMinutes / view.capacityMinutes) * 100)) : 0;

  return (
    <Card className="overflow-hidden">
      {/* رأس البطاقة */}
      <div className="flex items-center gap-3 border-b border-gray-50 p-4 dark:border-slate-700">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-700 text-white shadow-md shadow-emerald-600/20">
          <Droplets size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-extrabold text-gray-900 dark:text-white">
            {view.pumpName}
          </div>
          <div className="flex items-center gap-2 text-[10px] text-gray-400 dark:text-slate-400">
            <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
              {view.pumpCode}
            </span>
            {view.managerName ? <span>· المسؤول: {view.managerName}</span> : null}
            {view.localOnly ? <span>· على هذا الجهاز</span> : null}
          </div>
        </div>
        <Pill tone={view.roundStatus === "inside" ? "green" : view.roundStatus === "after" ? "gray" : "amber"}>
          {statusLabel}
        </Pill>
      </div>

      {!view.hasLocalData ? (
        <div className="p-4">
          <p className="text-[11px] leading-relaxed text-gray-500 dark:text-slate-300">
            بيانات تشغيل هذه المضخة لم تُحمَّل على هذا الجهاز بعد. ستظهر هنا تفاصيل ديالتها ودورك فيها مباشرة
            بعد تحديث سجل المسؤول على نفس الجهاز.
          </p>
          <Button variant="secondary" className="mt-3 w-full" onClick={onOpenOfficial}>
            فتح السجل الرسمي
          </Button>
        </div>
      ) : (
        <div className="space-y-3 p-4">
          {/* شريط تقدّم الديالة */}
          {view.roundStatus === "inside" ? (
            <div>
              <div className="mb-1 flex items-center justify-between text-[10px] font-bold text-gray-500 dark:text-slate-300">
                <span>
                  ديالة {view.round?.number} · {view.round?.startDate} → {view.round?.endDate}
                </span>
                <span className="text-emerald-700 dark:text-emerald-300">
                  {view.dayNumber}/{view.totalDays}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-emerald-50 dark:bg-slate-700">
                <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
              </div>
            </div>
          ) : null}

          {/* دوري اليوم */}
          {view.todayTurn ? (
            <div className="flex items-center gap-2 rounded-2xl bg-emerald-600 px-3 py-2.5 text-white">
              <Timer size={16} />
              <div className="flex-1 text-[11px] font-bold">
                دوري اليوم: {view.todayTurn.entry.startTime} → {view.todayTurn.entry.endTime}
              </div>
              <span className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-bold">
                {view.todayTurn.entry.status === "done"
                  ? "تم"
                  : view.todayTurn.entry.status === "cancelled"
                    ? "ملغى"
                    : "قادم"}
              </span>
            </div>
          ) : null}

          {/* إحصاءات اليوم */}
          <div className="grid grid-cols-3 gap-2">
            <MiniStat
              label="كشف الأساسي"
              value={view.baseRows.length ? `${view.baseRows.length} مساهمًا` : "—"}
              tone="gray"
            />
            <MiniStat
              label="الدوام الفعلي"
              value={`${view.actualRows.length} · تم ${view.actualDone}`}
              tone="blue"
            />
            <MiniStat
              label="موقفي اليوم"
              value={view.myActualIndex >= 0 ? `${view.myActualIndex + 1} من ${view.actualRows.length}` : "لست فيه"}
              tone={view.myActualIndex >= 0 ? "green" : "amber"}
            />
          </div>

          {/* نصيبي في الكشف */}
          <div className="rounded-2xl bg-gray-50 px-3 py-2.5 dark:bg-slate-700/60">
            {view.myBase ? (
              <>
                <div className="flex flex-wrap items-center gap-2 text-[11px] font-extrabold text-gray-800 dark:text-slate-100">
                  <Users size={13} className="text-emerald-600" />
                  نصيبي في الدوام الأساسي: {formatDuration(view.myBase.shareMin)}
                  <span className="text-gray-400">
                    · ترتيبي {view.myBase.order + 1} من {view.baseRows.length}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-gray-500 dark:text-slate-300">
                  <span className="font-bold">
                    {view.myBase.startTime} → {view.myBase.endTime}
                  </span>
                  <span>· قبلي {view.baseBeforeMe}</span>
                  {view.rosterLocked ? (
                    <span className="flex items-center gap-1 text-emerald-700 dark:text-emerald-300">
                      <CheckCircle2 size={11} /> الكشف مثبَّت
                    </span>
                  ) : null}
                </div>
              </>
            ) : view.baseRows.length ? (
              <p className="text-[11px] font-bold text-amber-700 dark:text-amber-300">
                اسمك ليس في كشف الدوام الأساسي لهذه الديالة — راجع المسؤول إن كان لك نصيب.
              </p>
            ) : (
              <p className="text-[11px] text-gray-500 dark:text-slate-300">
                لم يُسجَّل كشف الدوام الأساسي لهذه الديالة بعد.
              </p>
            )}
            {view.baseMinutes > 0 ? (
              <div className="mt-2">
                <div className="mb-1 flex items-center justify-between text-[9px] text-gray-400 dark:text-slate-400">
                  <span>مجموع الكشف {formatDuration(view.baseMinutes)}</span>
                  <span>من {formatDuration(view.capacityMinutes)} ساعة تشغيل</span>
                </div>
                <div className="h-1 overflow-hidden rounded-full bg-white dark:bg-slate-600">
                  <div className="h-full rounded-full bg-emerald-500" style={{ width: `${sharePct}%` }} />
                </div>
              </div>
            ) : null}
          </div>

          {/* آخر دور مضى + التفاصيل */}
          {view.lastTurn ? (
            <div className="text-[10px] text-gray-400 dark:text-slate-400">
              آخر دور مضى: {view.lastTurn.day.date} · {view.lastTurn.entry.startTime} →{" "}
              {view.lastTurn.entry.endTime}
            </div>
          ) : null}

          <button
            type="button"
            onClick={onOpenOfficial}
            className="flex w-full items-center justify-center gap-1 rounded-2xl bg-gray-50 py-2.5 text-[11px] font-bold text-emerald-700 transition hover:bg-emerald-50 dark:bg-slate-700 dark:text-emerald-300"
            data-testid={`home-pump-details-${view.pumpCode}`}
          >
            التفاصيل في السجل الرسمي <ChevronLeft size={14} />
          </button>
        </div>
      )}
    </Card>
  );
}

/* ------------------- بديل شخصي للمستخدم بلا حساب مرتبط ------------------- */

function usePersonalFallback() {
  const { state } = useShareholder();
  const cycles = activeCycles(state);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const horizon = new Date(today.getTime() + 7 * 86400000);
  const upcoming: { day: number; date: Date; isToday: boolean; pumpName: string; cycleName: string }[] = [];
  for (const cycle of cycles) {
    for (let day = 1; day <= cycle.days; day++) {
      const date = cycleDayDate(cycle.startDate, day);
      date.setHours(0, 0, 0, 0);
      if (date.getTime() < today.getTime()) continue;
      if (date.getTime() > horizon.getTime()) break;
      upcoming.push({
        day,
        date,
        isToday: date.getTime() === today.getTime(),
        pumpName: findPump(state, cycle.pumpId)?.name ?? "—",
        cycleName: cycle.name,
      });
    }
  }
  upcoming.sort((a, b) => a.date.getTime() - b.date.getTime());
  const rows = cycles.map((cycle) => {
    const day = currentDayOfCycle(cycle);
    return {
      id: cycle.id,
      name: cycle.name,
      days: cycle.days,
      pumpName: findPump(state, cycle.pumpId)?.name ?? "—",
      day,
      status: day === null ? (new Date() < new Date(cycle.startDate) ? "لم تبدأ" : "انتهت") : "",
    };
  });
  return { nearest: upcoming[0] ?? null, cycles: rows };
}

