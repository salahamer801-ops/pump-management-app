import { useCallback, useEffect, useState } from "react";
import { ChevronDown, ScrollText, Search } from "lucide-react";
import type { AdminAuditRow } from "../../auth/types";
import { actionLabel, adminApi } from "../adminApi";
import { Card, Field, Pill, Select, TextInput, cx } from "../../components/ui";
import { ErrorNote, Loading, ScreenHead } from "../ui";
import { formatDateTime } from "../../format";

export default function AuditScreen() {
  const [logs, setLogs] = useState<AdminAuditRow[]>([]);
  const [actions, setActions] = useState<{ action: string; n: number }[]>([]);
  const [action, setAction] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openId, setOpenId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await adminApi.audit({ action, q: search, limit: 200 });
      setLogs(res.logs);
      setActions(res.actions);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذّر تحميل سجل التدقيق.");
    } finally {
      setLoading(false);
    }
  }, [action, search]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-4">
      <ScreenHead
        icon={<ScrollText size={20} />}
        title="سجل التدقيق"
        subtitle="كل حدث حسّاس في النظام: من فعله، ومتى، وعلى أي عنصر — للقراءة فقط"
        onRefresh={() => void load()}
      />
      <ErrorNote message={error} />

      <Card className="grid gap-3 p-4 sm:grid-cols-2">
        <Field label="نوع الحدث">
          <Select
            value={action}
            onChange={(e) => setAction(e.target.value)}
            aria-label="نوع الحدث"
            data-testid="admin-audit-action"
          >
            <option value="">كل الأحداث</option>
            {actions.map((a) => (
              <option key={a.action} value={a.action}>
                {actionLabel(a.action)} ({a.n})
              </option>
            ))}
          </Select>
        </Field>
        <Field label="بحث بالاسم أو العنصر">
          <div className="relative">
            <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <TextInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="اسم الفاعل أو المضخة أو الحدث"
              className="pr-9"
              aria-label="بحث في السجل"
              data-testid="admin-audit-search"
            />
          </div>
        </Field>
      </Card>

      {loading ? (
        <Loading label="جارٍ تحميل السجل…" />
      ) : logs.length === 0 ? (
        <Card className="p-6 text-center text-sm text-gray-400">لا توجد أحداث مطابقة.</Card>
      ) : (
        <div className="space-y-2">
          {logs.map((log) => {
            const open = openId === log.id;
            return (
              <Card key={log.id} className="overflow-hidden">
                <button
                  type="button"
                  onClick={() => setOpenId(open ? "" : log.id)}
                  aria-expanded={open}
                  aria-label={`تفاصيل الحدث ${actionLabel(log.action)}`}
                  data-testid={`admin-audit-${log.id}`}
                  className="flex w-full items-start gap-3 p-3 text-right transition hover:bg-gray-50 dark:hover:bg-slate-700/50"
                >
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                    <ScrollText size={14} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[12px] font-extrabold text-gray-800 dark:text-white">
                        {actionLabel(log.action)}
                      </span>
                      <Pill
                        tone={
                          log.source === "admin_panel"
                            ? "amber"
                            : log.actorRole === "admin"
                              ? "green"
                              : "gray"
                        }
                      >
                        {log.source === "admin_panel" ? "من اللوحة" : log.actorRole}
                      </Pill>
                      {log.entityLabel ? <Pill tone="blue">{log.entityLabel}</Pill> : null}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-gray-400 dark:text-slate-400">
                      <span>الفاعل: {log.actorName}</span>
                      {log.pumpName ? (
                        <span>
                          المضخة: {log.pumpName} <span className="font-mono">{log.pumpCode}</span>
                        </span>
                      ) : null}
                      <span>العنصر: {log.entityType || "—"}</span>
                      <span>{formatDateTime(log.at)}</span>
                    </div>
                  </div>
                  <ChevronDown
                    size={16}
                    className={cx("mt-1 shrink-0 text-gray-300 transition", open && "rotate-180")}
                  />
                </button>
                {open ? (
                  <pre
                    dir="ltr"
                    className="max-h-64 overflow-auto border-t border-gray-100 bg-gray-50 p-3 text-[10px] leading-relaxed text-gray-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                  >
                    {JSON.stringify(log.metadata, null, 2)}
                  </pre>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
