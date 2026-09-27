import { useCallback, useEffect, useState } from "react";
import { Archive, Droplets, MapPin, RotateCcw, Search, Users } from "lucide-react";
import type { AdminPumpRow } from "../../auth/types";
import { adminApi } from "../adminApi";
import { Button, Card, Field, Pill, Select, TextInput } from "../../components/ui";
import { ErrorNote, Loading, ScreenHead } from "../ui";
import { formatDateTime, formatNumber } from "../../format";

export default function PumpsScreen() {
  const [pumps, setPumps] = useState<AdminPumpRow[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await adminApi.pumps({ q: search, status });
      setPumps(res.pumps);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذّر تحميل المضخات.");
    } finally {
      setLoading(false);
    }
  }, [search, status]);

  useEffect(() => {
    void load();
  }, [load]);

  const setPumpStatus = async (p: AdminPumpRow, next: "active" | "archived") => {
    setBusyId(p.id);
    setError("");
    try {
      await adminApi.updatePump(p.id, next);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذّر تحديث حالة المضخة.");
    } finally {
      setBusyId("");
    }
  };

  const activeCount = pumps.filter((p) => p.status === "active").length;

  return (
    <div className="space-y-4">
      <ScreenHead
        icon={<Droplets size={20} />}
        title="المضخات"
        subtitle={`${formatNumber(pumps.length)} مضخة — نشطة: ${activeCount}`}
        onRefresh={() => void load()}
      />
      <ErrorNote message={error} />

      <Card className="grid gap-3 p-4 sm:grid-cols-2">
        <Field label="بحث بالاسم أو رقم التعريف أو المسؤول">
          <div className="relative">
            <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <TextInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="مثال: مضخة الوادي أو PMP-XXXXXX"
              className="pr-9"
              aria-label="بحث في المضخات"
              data-testid="admin-pumps-search"
            />
          </div>
        </Field>
        <Field label="الحالة">
          <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="حالة المضخة">
            <option value="">الكل</option>
            <option value="active">نشطة</option>
            <option value="archived">مؤرشفة</option>
          </Select>
        </Field>
      </Card>

      {loading ? (
        <Loading label="جارٍ تحميل المضخات…" />
      ) : pumps.length === 0 ? (
        <Card className="p-6 text-center text-sm text-gray-400">لا توجد مضخات مطابقة.</Card>
      ) : (
        <div className="space-y-3">
          {pumps.map((p) => (
            <Card key={p.id} className="p-4" data-testid={`admin-pump-${p.pumpCode}`}>
              <div className="flex flex-wrap items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-emerald-700 text-white shadow-md shadow-emerald-600/20">
                  <Droplets size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-extrabold text-gray-900 dark:text-white">{p.name}</span>
                    <span className="font-mono text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                      {p.pumpCode}
                    </span>
                    <Pill tone={p.status === "active" ? "green" : "gray"}>
                      {p.status === "active" ? "نشطة" : "مؤرشفة"}
                    </Pill>
                    {p.pendingCount > 0 ? <Pill tone="amber">{p.pendingCount} طلب معلّق</Pill> : null}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-gray-400 dark:text-slate-400">
                    <span>المسؤول: {p.managerName || "—"}</span>
                    <span className="font-mono">{p.managerPhoneMasked}</span>
                    <span className="flex items-center gap-1">
                      <Users size={11} /> {p.membersCount} عضو معتمد
                    </span>
                    {p.location ? (
                      <span className="flex items-center gap-1">
                        <MapPin size={11} /> {p.location}
                      </span>
                    ) : null}
                    <span>أُنشئت: {formatDateTime(p.createdAt)}</span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {p.status === "active" ? (
                    <Button
                      variant="outline"
                      className="px-3 py-2 text-[11px]"
                      disabled={busyId === p.id}
                      onClick={() => void setPumpStatus(p, "archived")}
                      data-testid={`admin-archive-${p.pumpCode}`}
                    >
                      <Archive size={14} /> أرشفة
                    </Button>
                  ) : (
                    <Button
                      variant="secondary"
                      className="px-3 py-2 text-[11px]"
                      disabled={busyId === p.id}
                      onClick={() => void setPumpStatus(p, "active")}
                    >
                      <RotateCcw size={14} /> إعادة تفعيل
                    </Button>
                  )}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
