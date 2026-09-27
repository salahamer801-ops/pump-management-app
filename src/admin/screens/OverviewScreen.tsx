import { useCallback, useEffect, useState } from "react";
import { Activity, Droplets, Eye, ShieldCheck, TrendingUp, Users } from "lucide-react";
import type { AdminOverview } from "../../auth/types";
import { actionLabel, adminApi } from "../adminApi";
import { Card, Pill } from "../../components/ui";
import { ErrorNote, FieldRow, Loading, ScreenHead, SectionCard, StatTile } from "../ui";
import { formatDateTime, formatNumber } from "../../format";

export default function OverviewScreen() {
  const [data, setData] = useState<AdminOverview | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      setData(await adminApi.overview());
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذّر تحميل النظرة العامة.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!data && !error) return <Loading />;

  const c = data?.counts;
  const maxUsers = Math.max(1, ...(data?.series ?? []).map((s) => s.users));

  return (
    <div className="space-y-4">
      <ScreenHead
        icon={<Activity size={20} />}
        title="نظرة عامة"
        subtitle="حالة النظام الآن: الحسابات والمضخات والطلبات والنشاط"
        onRefresh={() => void load()}
      />
      <ErrorNote message={error} />

      {c ? (
        <>
          {/* شريط علوي */}
          <div className="relative overflow-hidden rounded-[26px] bg-gradient-to-bl from-slate-800 via-slate-800 to-emerald-800 p-5 text-white shadow-xl shadow-slate-900/10">
            <div className="pointer-events-none absolute -left-12 -top-16 h-44 w-44 rounded-full bg-emerald-400/20 blur-3xl" />
            <div className="relative flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="text-[11px] font-bold text-emerald-200">حجم قاعدة البيانات</div>
                <div className="text-3xl font-black">{c.db_size}</div>
                <div className="mt-1 text-[11px] text-emerald-100/80">
                  {formatNumber(c.active_sessions)} جلسة نشطة · {formatNumber(c.events_24h)} حدث في ٢٤ ساعة
                </div>
              </div>
              <div className="flex flex-wrap gap-2 text-[11px] font-bold">
                <span className="rounded-full bg-white/10 px-3 py-1.5 backdrop-blur">
                  مستخدمون: {formatNumber(c.users_total)}
                </span>
                <span className="rounded-full bg-white/10 px-3 py-1.5 backdrop-blur">
                  مضخات: {formatNumber(c.pumps_total)}
                </span>
                <span className="rounded-full bg-white/10 px-3 py-1.5 backdrop-blur">
                  طلبات معلّقة: {formatNumber(c.pending_requests)}
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile label="حسابات المسؤولين" value={formatNumber(c.managers)} tone="green" testId="ov-managers" />
            <StatTile label="حسابات المستخدمين" value={formatNumber(c.members)} tone="blue" testId="ov-members" />
            <StatTile label="حسابات موقوفة" value={formatNumber(c.suspended)} tone={c.suspended ? "red" : "gray"} />
            <StatTile label="مسؤولو النظام" value={formatNumber(c.admins)} tone="amber" />
            <StatTile label="مضخات نشطة" value={formatNumber(c.pumps_active)} hint={`من ${c.pumps_total}`} />
            <StatTile label="عضويات معتمدة" value={formatNumber(c.approved_memberships)} tone="green" />
            <StatTile label="طلبات معلّقة" value={formatNumber(c.pending_requests)} tone={c.pending_requests ? "amber" : "gray"} />
            <StatTile label="حسابات جديدة (٧ أيام)" value={formatNumber(c.new_users_7d)} tone="blue" />
          </div>

          {/* مخطط التسجيلات */}
          <SectionCard title="التسجيلات خلال ١٤ يومًا" hint="حسابات جديدة" actions={<TrendingUp size={15} className="text-emerald-600" />}>
            <div className="flex h-32 items-end gap-1.5">
              {data.series.map((s) => (
                <div key={s.day} className="group flex flex-1 flex-col items-center justify-end gap-1">
                  <span className="text-[9px] font-bold text-gray-400">{s.users || ""}</span>
                  <div
                    className="w-full rounded-t-lg bg-gradient-to-t from-emerald-500 to-emerald-400 transition group-hover:from-emerald-600"
                    style={{ height: `${Math.max(4, (s.users / maxUsers) * 100)}%` }}
                    title={`${s.day}: ${s.users} حساب · ${s.pumps} مضخة`}
                  />
                  <span className="text-[8px] text-gray-300">{s.day.slice(8)}</span>
                </div>
              ))}
            </div>
          </SectionCard>

          <div className="grid gap-3 lg:grid-cols-2">
            {/* الطلبات المعلّقة */}
            <SectionCard
              title="طلبات بانتظار قرار"
              hint={`${data.pending.length ? formatNumber(data.pending.length) : "لا يوجد"}`}
            >
              {data.pending.length === 0 ? (
                <p className="text-[11px] text-gray-400">لا توجد طلبات معلّقة الآن.</p>
              ) : (
                <div className="space-y-2">
                  {data.pending.map((p) => (
                    <div key={p.id} className="rounded-2xl bg-gray-50 px-3 py-2 dark:bg-slate-700/60">
                      <div className="flex items-center gap-2 text-[11px] font-extrabold text-gray-800 dark:text-slate-100">
                        {p.userName}
                        <Pill tone={p.accountType === "manager" ? "green" : "blue"}>
                          {p.accountType === "manager" ? "مسؤول" : "مستخدم"}
                        </Pill>
                        <span className="mr-auto font-mono text-[10px] text-gray-400">{p.pumpCode}</span>
                      </div>
                      <div className="mt-0.5 text-[10px] text-gray-500 dark:text-slate-300">
                        {p.pumpName} · {p.personName || "بلا اسم شخص"} · {formatDateTime(p.requestedAt)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>

            {/* أكثر المضخات أعضاءً */}
            <SectionCard title="أكثر المضخات أعضاءً" actions={<Droplets size={15} className="text-emerald-600" />}>
              {data.topPumps.length === 0 ? (
                <p className="text-[11px] text-gray-400">لا توجد مضخات بعد.</p>
              ) : (
                <div className="space-y-1">
                  {data.topPumps.map((p) => (
                    <FieldRow key={p.code} label={`${p.name} · ${p.code}`} value={`${p.members} عضو`} />
                  ))}
                </div>
              )}
            </SectionCard>
          </div>

          {/* آخر النشاط */}
          <SectionCard title="آخر العمليات" actions={<Eye size={15} className="text-emerald-600" />}>
            <div className="space-y-2" data-testid="admin-recent">
              {data.recent.map((a) => (
                <div key={a.id} className="flex items-start gap-2 rounded-2xl bg-gray-50 px-3 py-2 dark:bg-slate-700/60">
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-white text-emerald-600 shadow-sm dark:bg-slate-800">
                    <ShieldCheck size={12} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] font-bold text-gray-800 dark:text-slate-100">
                      {actionLabel(a.action)}
                      {a.entityLabel ? ` — ${a.entityLabel}` : ""}
                    </div>
                    <div className="text-[10px] text-gray-400">
                      {a.actorName}
                      {a.pumpName ? ` · ${a.pumpName}` : ""} · {formatDateTime(a.at)}
                    </div>
                  </div>
                </div>
              ))}
              {data.recent.length === 0 ? (
                <p className="text-[11px] text-gray-400">لا يوجد نشاط مسجَّل بعد.</p>
              ) : null}
            </div>
          </SectionCard>

          <Card className="flex flex-wrap items-center gap-3 p-4 text-[11px] text-gray-500 dark:text-slate-300">
            <Users size={15} className="text-emerald-600" />
            لوحة النظام لا تُنشئ بيانات نيابة عن المسؤول: قراراتك هنا تُسجَّل باسمك، ويبقى الأصل محفوظًا مع
            تاريخه.
          </Card>
        </>
      ) : null}
    </div>
  );
}
