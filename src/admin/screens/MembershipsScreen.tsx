import { useCallback, useEffect, useState } from "react";
import { Check, Search, Trash2, UserCheck, X } from "lucide-react";
import type { AdminMembershipRow, MembershipStatus } from "../../auth/types";
import { adminApi } from "../adminApi";
import { Button, Card, Field, Modal, Pill, Select, TextArea, TextInput, cx } from "../../components/ui";
import { ErrorNote, Loading, ScreenHead } from "../ui";
import { formatDateTime } from "../../format";

const STATUS_LABELS: Record<MembershipStatus, string> = {
  pending: "معلّق",
  approved: "معتمد",
  rejected: "مرفوض",
  removed: "مُزال",
};

const TYPE_LABELS: Record<string, string> = {
  shareholder: "مساهم",
  rightHolder: "صاحب حق",
  actualUser: "مستخدم فعلي",
  viewer: "مطّلع",
  accountant: "محاسب",
  pumpOperator: "مشغّل المضخة",
};

export default function MembershipsScreen() {
  const [rows, setRows] = useState<AdminMembershipRow[]>([]);
  const [status, setStatus] = useState<MembershipStatus | "">("pending");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [decision, setDecision] = useState<{ row: AdminMembershipRow; status: MembershipStatus } | null>(
    null
  );
  const [reason, setReason] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await adminApi.memberships({ status, q: search });
      setRows(res.memberships);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذّر تحميل الطلبات.");
    } finally {
      setLoading(false);
    }
  }, [status, search]);

  useEffect(() => {
    void load();
  }, [load]);

  const apply = async (row: AdminMembershipRow, next: MembershipStatus, why = "") => {
    setBusyId(row.id);
    setError("");
    try {
      await adminApi.decideMembership(row.id, next, why);
      setDecision(null);
      setReason("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذّر تنفيذ القرار.");
    } finally {
      setBusyId("");
    }
  };

  return (
    <div className="space-y-4">
      <ScreenHead
        icon={<UserCheck size={20} />}
        title="الطلبات والعضويات"
        subtitle="كل طلبات الربط بين المستخدمين والمضخات — يمكن لمسؤول النظام البتّ فيها عند الحاجة"
        onRefresh={() => void load()}
      />
      <ErrorNote message={error} />

      <Card className="grid gap-3 p-4 sm:grid-cols-2">
        <Field label="الحالة">
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value as MembershipStatus | "")}
            aria-label="حالة الطلب"
            data-testid="admin-membership-status"
          >
            <option value="">الكل</option>
            <option value="pending">معلّقة</option>
            <option value="approved">معتمدة</option>
            <option value="rejected">مرفوضة</option>
            <option value="removed">مُزالة</option>
          </Select>
        </Field>
        <Field label="بحث">
          <div className="relative">
            <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <TextInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="اسم المستخدم أو المضخة أو اسم الشخص"
              className="pr-9"
              aria-label="بحث في الطلبات"
              data-testid="admin-memberships-search"
            />
          </div>
        </Field>
      </Card>

      {loading ? (
        <Loading label="جارٍ تحميل الطلبات…" />
      ) : rows.length === 0 ? (
        <Card className="p-6 text-center text-sm text-gray-400">لا توجد طلبات مطابقة.</Card>
      ) : (
        <div className="space-y-3">
          {rows.map((m) => (
            <Card key={m.id} className="p-4" data-testid={`admin-membership-${m.id}`}>
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-extrabold text-gray-900 dark:text-white">
                      {m.userName}
                    </span>
                    <Pill tone={m.userAccountType === "manager" ? "green" : "blue"}>
                      {m.userAccountType === "manager" ? "مسؤول مضخة" : "مستخدم"}
                    </Pill>
                    <Pill
                      tone={
                        m.status === "approved"
                          ? "green"
                          : m.status === "pending"
                            ? "amber"
                            : m.status === "rejected"
                              ? "red"
                              : "gray"
                      }
                    >
                      {STATUS_LABELS[m.status]}
                    </Pill>
                    <Pill tone="gray">{TYPE_LABELS[m.membershipType] ?? m.membershipType}</Pill>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-gray-400 dark:text-slate-400">
                    <span>
                      المضخة: <b className="text-gray-600 dark:text-slate-200">{m.pumpName}</b>{" "}
                      <span className="font-mono">{m.pumpCode}</span>
                    </span>
                    <span>مسؤول المضخة: {m.managerName || "—"}</span>
                    <span className="font-mono">{m.userPhoneMasked}</span>
                    <span>الشخص: {m.personName || "—"}</span>
                    {m.shareRef ? <span>مرجع السهم: {m.shareRef}</span> : null}
                    <span>طُلب: {formatDateTime(m.requestedAt)}</span>
                    {m.approvedAt ? <span>اعتُمد: {formatDateTime(m.approvedAt)}</span> : null}
                    {m.rejectReason ? <span>سبب الرفض: {m.rejectReason}</span> : null}
                    {m.removeReason ? <span>سبب الإزالة: {m.removeReason}</span> : null}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {m.status !== "approved" ? (
                    <Button
                      variant="secondary"
                      className="px-3 py-2 text-[11px]"
                      disabled={busyId === m.id}
                      onClick={() => void apply(m, "approved")}
                      data-testid={`admin-approve-${m.id}`}
                    >
                      <Check size={14} /> اعتماد الطلب
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      className="px-3 py-2 text-[11px]"
                      disabled={busyId === m.id}
                      onClick={() => {
                        setDecision({ row: m, status: "removed" });
                        setReason("");
                      }}
                    >
                      <Trash2 size={14} /> إزالة العضوية
                    </Button>
                  )}
                  {m.status !== "rejected" && m.status !== "approved" ? (
                    <Button
                      variant="outline"
                      className="px-3 py-2 text-[11px]"
                      disabled={busyId === m.id}
                      onClick={() => {
                        setDecision({ row: m, status: "rejected" });
                        setReason("");
                      }}
                    >
                      <X size={14} /> رفض
                    </Button>
                  ) : null}
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={Boolean(decision)}
        onClose={() => setDecision(null)}
        title={decision?.status === "rejected" ? "رفض الطلب" : "إزالة العضوية"}
      >
        {decision ? (
          <div className="space-y-3">
            <p
              className={cx(
                "rounded-2xl px-3 py-2.5 text-[11px] leading-relaxed",
                decision.status === "rejected"
                  ? "bg-red-50 text-red-800 dark:bg-red-900/20 dark:text-red-200"
                  : "bg-amber-50 text-amber-800 dark:bg-amber-900/20 dark:text-amber-200"
              )}
            >
              {decision.status === "rejected"
                ? `رفض طلب «${decision.row.userName}» للانضمام إلى ${decision.row.pumpName}.`
                : `إزالة «${decision.row.userName}» من ${decision.row.pumpName}.`}{" "}
              القرار يُسجَّل باسمك ووقته، ولا يُحذف الطلب من السجل.
            </p>
            <Field label="السبب (يُسجَّل في سجل التدقيق ويظهر للمعني)">
              <TextArea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="اكتب سببًا واضحًا…"
                data-testid="admin-decision-reason"
              />
            </Field>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setDecision(null)}>
                إلغاء
              </Button>
              <Button
                variant="danger"
                className="flex-1"
                disabled={busyId === decision.row.id || reason.trim().length < 3}
                onClick={() => void apply(decision.row, decision.status, reason)}
                data-testid="admin-decision-confirm"
              >
                تأكيد القرار
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
