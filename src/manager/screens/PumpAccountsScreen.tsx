import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeftRight,
  Check,
  Copy,
  History,
  RefreshCw,
  ShieldCheck,
  UserCheck,
  UserX,
  Users,
} from "lucide-react";
import { useApp } from "../../store";
import { ApiError } from "../../auth/api";
import {
  decideRequest,
  listMembers,
  listRequests,
  pumpAudit,
  removeMember,
  updateMember,
} from "../../auth/pumpApi";
import {
  ACTION_LABEL,
  MEMBERSHIP_LABEL,
  STATUS_LABEL,
  type AuditRow,
  type ManagedPump,
  type MemberRow,
  type MembershipType,
} from "../../auth/types";
import { formatClock } from "../../domain/util";
import { Button, Card, Field, Modal, Pill, Select, TextArea, TextInput, cx } from "../../components/ui";

const MEMBERSHIP_ORDER: MembershipType[] = [
  "shareholder",
  "rightHolder",
  "actualUser",
  "viewer",
  "accountant",
  "pumpOperator",
];

type Panel = "requests" | "members" | "log";

/**
 * حسابات المضخة (§9، §16، §18، §30):
 * الطلبات تُقبل أو تُرفض هنا، وكل قرار يُسجَّل في سجل التدقيق على الخادم.
 * لا يُمنح أي وصول بمجرد معرفة رقم تعريف المضخة.
 */
export default function PumpAccountsScreen({
  pump,
  onSwitchPump,
  onChanged,
}: {
  pump: ManagedPump;
  onSwitchPump: () => void;
  onChanged: () => void;
}) {
  const { state } = useApp();
  const [panel, setPanel] = useState<Panel>("requests");
  const [requests, setRequests] = useState<MemberRow[]>([]);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [logs, setLogs] = useState<AuditRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [copied, setCopied] = useState(false);
  const [approving, setApproving] = useState<MemberRow | null>(null);
  const [removing, setRemoving] = useState<MemberRow | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const [pending, all, audit] = await Promise.all([
        listRequests(pump.id),
        listMembers(pump.id),
        pumpAudit(pump.id),
      ]);
      setRequests(pending);
      setMembers(all);
      setLogs(audit);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "تعذّر تحميل بيانات الحسابات.");
    } finally {
      setBusy(false);
    }
  }, [pump.id, onChanged]);

  useEffect(() => {
    void load();
  }, [load]);

  const approved = useMemo(() => members.filter((m) => m.status === "approved"), [members]);
  const history = useMemo(() => members.filter((m) => m.status !== "approved"), [members]);

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(pump.pumpCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* المتصفح قد يمنع النسخ — الكود ظاهر على الشاشة */
    }
  };

  const decide = async (
    row: MemberRow,
    action: "approve" | "reject",
    payload: { membershipType?: MembershipType; personId?: string | null; personName?: string; shareRef?: string; reason?: string }
  ) => {
    setBusy(true);
    setError("");
    try {
      if (action === "approve") {
        await decideRequest(pump.id, row.id, {
          action: "approve",
          membershipType: payload.membershipType ?? "viewer",
          personId: payload.personId ?? null,
          personName: payload.personName ?? row.user.name,
          shareRef: payload.shareRef ?? "",
        });
        setNotice(`تم قبول ${row.user.name} وربطه بالمضخة.`);
      } else {
        await decideRequest(pump.id, row.id, { action: "reject", reason: payload.reason ?? "" });
        setNotice(`تم رفض طلب ${row.user.name}.`);
      }
      setApproving(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "تعذّر تنفيذ القرار.");
    } finally {
      setBusy(false);
    }
  };

  const changeType = async (row: MemberRow, membershipType: MembershipType) => {
    setBusy(true);
    setError("");
    try {
      await updateMember(pump.id, row.id, { membershipType });
      setNotice(`تم تحديث صلاحية ${row.user.name}.`);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "تعذّر تحديث الصلاحية.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (row: MemberRow, reason: string) => {
    setBusy(true);
    setError("");
    try {
      await removeMember(pump.id, row.id, reason);
      setNotice(`أُزيل ${row.user.name} من المضخة — سجلاته التاريخية محفوظة.`);
      setRemoving(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "تعذّر إزالة العضو.");
    } finally {
      setBusy(false);
    }
  };

  const tabs: { id: Panel; label: string; icon: React.ReactNode; badge?: number }[] = [
    { id: "requests", label: "طلبات الانضمام", icon: <UserCheck size={15} />, badge: requests.length },
    { id: "members", label: "الأعضاء", icon: <Users size={15} />, badge: approved.length },
    { id: "log", label: "سجل التدقيق", icon: <History size={15} /> },
  ];

  return (
    <div className="space-y-4">
      <Card className="space-y-3 p-4">
        <div className="flex items-center gap-2">
          <ShieldCheck size={18} className="text-emerald-600" />
          <h2 className="text-sm font-extrabold text-gray-800 dark:text-white">هوية المضخة والصلاحيات</h2>
          <button
            onClick={() => void load()}
            aria-label="تحديث بيانات الحسابات"
            className="mr-auto rounded-full p-2 text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700"
          >
            <RefreshCw size={16} className={cx(busy && "animate-spin")} />
          </button>
        </div>

        <div className="rounded-2xl bg-emerald-50 px-3 py-3 dark:bg-emerald-900/30">
          <div className="text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
            رقم تعريف المضخة (Pump Code) — ثابت لا يتغيّر
          </div>
          <div className="mt-1 flex items-center gap-2">
            <span
              className="font-mono text-lg font-black tracking-wider text-emerald-800 dark:text-emerald-200"
              data-testid="pump-code"
            >
              {pump.pumpCode}
            </span>
            <Button variant="ghost" className="px-2 py-1.5 text-[11px]" onClick={() => void copyCode()} aria-label="نسخ رقم تعريف المضخة">
              {copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "تم النسخ" : "نسخ"}
            </Button>
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-emerald-700/80 dark:text-emerald-300/90">
            شارِك هذا الرقم مع من تريد السماح له بطلب الربط. معرفة الرقم لا تمنح أي وصول — الربط يتم بعد موافقتك فقط.
          </p>
        </div>

        <Button variant="outline" className="w-full" onClick={onSwitchPump} data-testid="switch-pump">
          <ArrowLeftRight size={16} /> تبديل المضخة / إنشاء مضخة أخرى
        </Button>
      </Card>

      {error ? (
        <p className="rounded-2xl bg-red-50 px-3 py-2 text-xs font-bold text-red-700" role="alert" data-testid="accounts-error">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="rounded-2xl bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700" role="status">
          {notice}
        </p>
      ) : null}

      <div className="grid grid-cols-3 gap-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setPanel(t.id)}
            aria-label={t.label}
            data-testid={`accounts-tab-${t.id}`}
            className={cx(
              "flex flex-col items-center gap-1 rounded-2xl border px-2 py-2.5 text-[10px] font-bold transition",
              panel === t.id
                ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                : "border-gray-200 text-gray-500 dark:border-slate-600 dark:text-slate-400"
            )}
          >
            <span className="flex items-center gap-1">
              {t.icon}
              {t.badge ? <span className="rounded-full bg-red-500 px-1.5 text-[9px] text-white">{t.badge}</span> : null}
            </span>
            {t.label}
          </button>
        ))}
      </div>

      {panel === "requests" ? (
        <Card className="space-y-3 p-4">
          <h3 className="text-sm font-extrabold text-gray-800 dark:text-white">طلبات الربط بانتظار قرارك</h3>
          {requests.length === 0 ? (
            <p className="py-4 text-center text-xs text-gray-400">لا توجد طلبات بانتظارك حاليًا.</p>
          ) : (
            requests.map((row) => (
              <div
                key={row.id}
                className="rounded-2xl border border-amber-100 bg-amber-50/60 px-3 py-3 dark:border-amber-900/40 dark:bg-amber-900/20"
                data-testid={`request-${row.user.id}`}
              >
                <div className="flex items-center gap-2">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-xs font-black text-amber-700">
                    {row.user.name.slice(0, 1)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-extrabold text-gray-900 dark:text-white">{row.user.name}</div>
                    <div className="text-[11px] text-gray-500 dark:text-slate-300" dir="ltr">
                      {row.user.phoneMasked}
                    </div>
                  </div>
                  <Pill tone="amber">{STATUS_LABEL[row.status]}</Pill>
                </div>
                <div className="mt-2 flex gap-2">
                  <Button
                    className="flex-1 px-3 py-2 text-xs"
                    onClick={() => setApproving(row)}
                    data-testid={`approve-${row.user.id}`}
                  >
                    <Check size={14} /> قبول وربط
                  </Button>
                  <Button
                    variant="danger"
                    className="flex-1 px-3 py-2 text-xs"
                    onClick={() => void decide(row, "reject", { reason: "رفض من شاشة المسؤول" })}
                    data-testid={`reject-${row.user.id}`}
                  >
                    <UserX size={14} /> رفض
                  </Button>
                </div>
              </div>
            ))
          )}
        </Card>
      ) : null}

      {panel === "members" ? (
        <Card className="space-y-3 p-4">
          <h3 className="text-sm font-extrabold text-gray-800 dark:text-white">الأعضاء المرتبطون بالمضخة</h3>
          {members.length === 0 ? (
            <p className="py-4 text-center text-xs text-gray-400">لا يوجد أعضاء بعد.</p>
          ) : (
            members.map((row) => (
              <div
                key={row.id}
                className="rounded-2xl border border-gray-100 px-3 py-3 dark:border-slate-700"
                data-testid={`member-${row.user.id}`}
              >
                <div className="flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-bold text-gray-900 dark:text-white">{row.user.name}</div>
                    <div className="text-[11px] text-gray-400" dir="ltr">
                      {row.user.phoneMasked}
                    </div>
                  </div>
                  <Pill
                    tone={
                      row.status === "approved"
                        ? "green"
                        : row.status === "pending"
                          ? "amber"
                          : row.status === "rejected"
                            ? "red"
                            : "gray"
                    }
                  >
                    {STATUS_LABEL[row.status]}
                  </Pill>
                </div>

                {row.status === "approved" ? (
                  <div className="mt-2 space-y-2">
                    <div className="flex items-center gap-2">
                      <Select
                        aria-label={`صلاحية ${row.user.name}`}
                        value={row.membershipType}
                        onChange={(e) => void changeType(row, e.target.value as MembershipType)}
                        className="py-2 text-xs"
                      >
                        {MEMBERSHIP_ORDER.map((t) => (
                          <option key={t} value={t}>
                            {MEMBERSHIP_LABEL[t]}
                          </option>
                        ))}
                      </Select>
                      <Button
                        variant="danger"
                        className="shrink-0 px-3 py-2 text-xs"
                        onClick={() => setRemoving(row)}
                        aria-label={`إزالة ${row.user.name}`}
                      >
                        إزالة
                      </Button>
                    </div>
                    <div className="text-[11px] text-gray-400">
                      {row.personName ? `مرتبط بالشخص: ${row.personName}` : "غير مرتبط بشخص مسجّل في المضخة"}
                      {row.shareRef ? ` · ${row.shareRef}` : ""}
                    </div>
                  </div>
                ) : (
                  <div className="mt-1 text-[11px] text-gray-400">
                    {row.status === "rejected" && row.rejectReason ? `سبب الرفض: ${row.rejectReason}` : null}
                    {row.status === "removed" ? "التاريخ محفوظ — لم يُحذف أي سجل." : null}
                  </div>
                )}
              </div>
            ))
          )}
          {history.length > 0 ? (
            <p className="text-[10px] leading-relaxed text-gray-400">
              الطلبات المرفوضة والمُزالة تبقى في السجل ولا تُحذف.
            </p>
          ) : null}
        </Card>
      ) : null}

      {panel === "log" ? (
        <Card className="space-y-2 p-4">
          <h3 className="text-sm font-extrabold text-gray-800 dark:text-white">سجل التدقيق</h3>
          {logs.length === 0 ? (
            <p className="py-4 text-center text-xs text-gray-400">لا توجد أحداث مسجّلة بعد.</p>
          ) : (
            <div className="max-h-[60vh] space-y-2 overflow-y-auto">
              {logs.map((row) => (
                <div key={row.id} className="rounded-2xl bg-gray-50 px-3 py-2 dark:bg-slate-700/60">
                  <div className="flex items-center gap-2 text-[11px] font-bold text-gray-700 dark:text-slate-200">
                    <History size={12} className="text-emerald-600" />
                    {ACTION_LABEL[row.action] ?? row.action}
                    <span className="mr-auto text-[10px] font-normal text-gray-400">{formatClock(row.at)}</span>
                  </div>
                  <div className="mt-0.5 text-[10px] text-gray-400">
                    بواسطة: {row.actorName || "النظام"} · المصدر: {row.source}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      ) : null}

      {approving ? (
        <ApproveModal
          row={approving}
          people={state.persons.filter((p) => !p.archived)}
          busy={busy}
          onClose={() => setApproving(null)}
          onConfirm={(payload) => void decide(approving, "approve", payload)}
        />
      ) : null}

      {removing ? (
        <RemoveModal
          row={removing}
          busy={busy}
          onClose={() => setRemoving(null)}
          onConfirm={(reason) => void remove(removing, reason)}
        />
      ) : null}
    </div>
  );
}

function ApproveModal({
  row,
  people,
  busy,
  onClose,
  onConfirm,
}: {
  row: MemberRow;
  people: { id: string; name: string; phone: string }[];
  busy: boolean;
  onClose: () => void;
  onConfirm: (payload: { membershipType: MembershipType; personId: string | null; personName: string; shareRef: string }) => void;
}) {
  const [membershipType, setMembershipType] = useState<MembershipType>("viewer");
  const [personId, setPersonId] = useState("");
  const [personName, setPersonName] = useState("");
  const [shareRef, setShareRef] = useState("");

  const chosen = people.find((p) => p.id === personId) ?? null;
  const effectiveName = chosen?.name ?? personName.trim();

  return (
    <Modal open onClose={onClose} title={`قبول ${row.user.name}`}>
      <div className="space-y-3">
        <p className="rounded-2xl bg-gray-50 px-3 py-2 text-[11px] leading-relaxed text-gray-500 dark:bg-slate-700 dark:text-slate-300">
          القبول ينشئ علاقة عضوية صريحة. إذا كان للشخص سهم مسجّل مسبقًا في المضخة، اختره من القائمة حتى يرتبط
          بسهمه بدل إنشاء شخص جديد (§34).
        </p>

        <Field label="نوع العلاقة">
          <Select
            value={membershipType}
            onChange={(e) => setMembershipType(e.target.value as MembershipType)}
            className="py-2.5 text-sm"
            aria-label="نوع العضوية"
            data-testid="approve-type"
          >
            {MEMBERSHIP_ORDER.map((t) => (
              <option key={t} value={t}>
                {MEMBERSHIP_LABEL[t]}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="ربط بشخص مسجّل (اختياري)" hint="اتركه فارغًا إن لم يكن له سجل سابق في المضخة.">
          <Select
            value={personId}
            onChange={(e) => setPersonId(e.target.value)}
            className="py-2.5 text-sm"
            aria-label="الشخص المرتبط"
          >
            <option value="">— بلا ربط بشخص —</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.phone ? ` — ${p.phone}` : ""}
              </option>
            ))}
          </Select>
        </Field>

        {!personId ? (
          <Field label="أو اكتب اسم الشخص كما هو في سجلات المضخة">
            <TextInput
              value={personName}
              onChange={(e) => setPersonName(e.target.value)}
              placeholder={row.user.name}
              data-testid="approve-person-name"
            />
          </Field>
        ) : null}

        <Field label="مرجع السهم / الحق (اختياري)">
          <TextInput
            value={shareRef}
            onChange={(e) => setShareRef(e.target.value)}
            placeholder="مثال: سهم 1.5"
            data-testid="approve-share-ref"
          />
        </Field>

        <div className="flex gap-2">
          <Button variant="ghost" className="flex-1" onClick={onClose}>
            رجوع
          </Button>
          <Button
            className="flex-1"
            disabled={busy}
            onClick={() =>
              onConfirm({
                membershipType,
                personId: personId || null,
                personName: effectiveName,
                shareRef,
              })
            }
            data-testid="approve-confirm"
          >
            <Check size={16} /> {busy ? "جارٍ القبول…" : "قبول وربط"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function RemoveModal({
  row,
  busy,
  onClose,
  onConfirm,
}: {
  row: MemberRow;
  busy: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  return (
    <Modal open onClose={onClose} title={`إزالة ${row.user.name} من المضخة`}>
      <div className="space-y-3">
        <p className="rounded-2xl bg-amber-50 px-3 py-2 text-[11px] leading-relaxed text-amber-700">
          الإزالة تُغيّر حالة العضوية إلى «أُزيل» — لا يُحذف أي سجل سابق: استخداماته ومدفوعاته وديونه تبقى محفوظة.
        </p>
        <Field label="سبب الإزالة (يُسجَّل في التدقيق)">
          <TextArea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
        </Field>
        <div className="flex gap-2">
          <Button variant="ghost" className="flex-1" onClick={onClose}>
            رجوع
          </Button>
          <Button
            variant="danger"
            className="flex-1"
            disabled={busy}
            onClick={() => onConfirm(reason.trim() || "إزالة من شاشة المسؤول")}
          >
            <UserX size={16} /> إزالة نهائية من المضخة
          </Button>
        </div>
      </div>
    </Modal>
  );
}
