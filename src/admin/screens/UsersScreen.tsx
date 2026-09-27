import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  Eye,
  KeyRound,
  Search,
  ShieldOff,
  ShieldPlus,
  UserRoundCheck,
  UserRoundX,
  Users,
} from "lucide-react";
import type { AdminUserRow } from "../../auth/types";
import { adminApi } from "../adminApi";
import { Button, Card, Field, Modal, Pill, Select, TextInput, cx } from "../../components/ui";
import { ErrorNote, Loading, ScreenHead } from "../ui";
import { formatDateTime, formatNumber } from "../../format";

export default function UsersScreen() {
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState("");
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [adminOnly, setAdminOnly] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [tempPassword, setTempPassword] = useState<{ name: string; password: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await adminApi.users({ q: search, type, status, admin: adminOnly, limit: 100 });
      setUsers(res.users);
      setTotal(res.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذّر تحميل المستخدمين.");
    } finally {
      setLoading(false);
    }
  }, [search, type, status, adminOnly]);

  useEffect(() => {
    void load();
  }, [load]);

  const counts = useMemo(
    () => ({
      managers: users.filter((u) => u.accountType === "manager").length,
      members: users.filter((u) => u.accountType === "user").length,
      admins: users.filter((u) => u.isAdmin).length,
      suspended: users.filter((u) => u.status === "suspended").length,
    }),
    [users]
  );

  const act = async (id: string, body: { status?: string; isAdmin?: boolean }) => {
    setBusyId(id);
    setError("");
    try {
      await adminApi.updateUser(id, body);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذّر تنفيذ الإجراء.");
    } finally {
      setBusyId("");
    }
  };

  const reveal = async (u: AdminUserRow) => {
    setBusyId(u.id);
    try {
      const res = await adminApi.revealPhone(u.id);
      setRevealed((prev) => ({ ...prev, [u.id]: res.phone }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذّر كشف الرقم.");
    } finally {
      setBusyId("");
    }
  };

  const resetPassword = async (u: AdminUserRow) => {
    setBusyId(u.id);
    try {
      const res = await adminApi.resetPassword(u.id);
      setTempPassword({ name: u.name, password: res.password });
    } catch (err) {
      setError(err instanceof Error ? err.message : "تعذّر توليد كلمة مرور.");
    } finally {
      setBusyId("");
    }
  };

  return (
    <div className="space-y-4">
      <ScreenHead
        icon={<Users size={20} />}
        title="المستخدمون"
        subtitle={`${formatNumber(total)} حساب — مسؤولون: ${counts.managers} · مستخدمون: ${counts.members} · موقوفون: ${counts.suspended}`}
        onRefresh={() => void load()}
      />
      <ErrorNote message={error} />

      <Card className="grid gap-3 p-4 sm:grid-cols-4">
        <Field label="بحث بالاسم أو الرقم">
          <div className="relative">
            <Search size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <TextInput
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="اسم أو رقم هاتف"
              className="pr-9"
              aria-label="بحث في المستخدمين"
              data-testid="admin-users-search"
            />
          </div>
        </Field>
        <Field label="نوع الحساب">
          <Select value={type} onChange={(e) => setType(e.target.value)} aria-label="نوع الحساب">
            <option value="">الكل</option>
            <option value="manager">مسؤول مضخة</option>
            <option value="user">مستخدم / مساهم</option>
          </Select>
        </Field>
        <Field label="الحالة">
          <Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="حالة الحساب">
            <option value="">الكل</option>
            <option value="active">نشط</option>
            <option value="suspended">موقوف</option>
          </Select>
        </Field>
        <Field label="صلاحية النظام">
          <Select value={adminOnly} onChange={(e) => setAdminOnly(e.target.value)} aria-label="صلاحية النظام">
            <option value="">الكل</option>
            <option value="yes">مسؤول نظام</option>
            <option value="no">بدون صلاحية</option>
          </Select>
        </Field>
      </Card>

      {loading ? (
        <Loading label="جارٍ تحميل الحسابات…" />
      ) : users.length === 0 ? (
        <Card className="p-6 text-center text-sm text-gray-400">لا يوجد مستخدمون مطابقون للبحث.</Card>
      ) : (
        <div className="space-y-3">
          {users.map((u) => (
            <Card key={u.id} className="p-4" data-testid={`admin-user-${u.phoneMasked}`}>
              <div className="flex flex-wrap items-start gap-3">
                <span
                  className={cx(
                    "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-white shadow-md",
                    u.isAdmin
                      ? "bg-gradient-to-br from-amber-500 to-amber-700 shadow-amber-600/20"
                      : u.accountType === "manager"
                        ? "bg-gradient-to-br from-emerald-500 to-emerald-700 shadow-emerald-600/20"
                        : "bg-gradient-to-br from-sky-500 to-sky-700 shadow-sky-600/20"
                  )}
                >
                  <Users size={18} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-extrabold text-gray-900 dark:text-white">{u.name}</span>
                    {u.isAdmin ? (
                      <Pill tone="amber">
                        <BadgeCheck size={11} /> مسؤول النظام
                      </Pill>
                    ) : null}
                    <Pill tone={u.accountType === "manager" ? "green" : "blue"}>
                      {u.accountType === "manager" ? "مسؤول مضخة" : "مستخدم"}
                    </Pill>
                    <Pill tone={u.status === "active" ? "green" : "red"}>
                      {u.status === "active" ? "نشط" : "موقوف"}
                    </Pill>
                    {u.pendingCount > 0 ? <Pill tone="amber">{u.pendingCount} طلب معلّق</Pill> : null}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-gray-400 dark:text-slate-400">
                    <span className="font-mono">
                      {revealed[u.id] ?? u.phoneMasked}
                      {revealed[u.id] ? "" : ""}
                    </span>
                    {!revealed[u.id] ? (
                      <button
                        type="button"
                        onClick={() => void reveal(u)}
                        disabled={busyId === u.id}
                        className="flex items-center gap-1 font-bold text-emerald-700 dark:text-emerald-300"
                        aria-label={`كشف رقم ${u.name}`}
                        data-testid={`admin-reveal-${u.phoneMasked}`}
                      >
                        <Eye size={11} /> كشف الرقم
                      </button>
                    ) : (
                      <span className="font-bold text-emerald-600">مكشوف</span>
                    )}
                    <span>مضخات: {u.pumpsCount}</span>
                    <span>عضويات: {u.membershipsCount}</span>
                    <span>جلسات: {u.sessionsCount}</span>
                    <span>آخر دخول: {u.lastLoginAt ? formatDateTime(u.lastLoginAt) : "—"}</span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant={u.status === "active" ? "outline" : "secondary"}
                    className="px-3 py-2 text-[11px]"
                    onClick={() => void act(u.id, { status: u.status === "active" ? "suspended" : "active" })}
                    disabled={busyId === u.id}
                    data-testid={`admin-toggle-${u.phoneMasked}`}
                  >
                    {u.status === "active" ? (
                      <>
                        <UserRoundX size={14} /> إيقاف
                      </>
                    ) : (
                      <>
                        <UserRoundCheck size={14} /> تنشيط
                      </>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    className="px-3 py-2 text-[11px]"
                    onClick={() => void act(u.id, { isAdmin: !u.isAdmin })}
                    disabled={busyId === u.id}
                    data-testid={`admin-admin-${u.phoneMasked}`}
                  >
                    {u.isAdmin ? (
                      <>
                        <ShieldOff size={14} /> إزالة الصلاحية
                      </>
                    ) : (
                      <>
                        <ShieldPlus size={14} /> تعيين مسؤول نظام
                      </>
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    className="px-3 py-2 text-[11px]"
                    onClick={() => void resetPassword(u)}
                    disabled={busyId === u.id}
                    data-testid={`admin-reset-${u.phoneMasked}`}
                  >
                    <KeyRound size={14} /> كلمة مرور مؤقتة
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={Boolean(tempPassword)}
        onClose={() => setTempPassword(null)}
        title="كلمة مرور مؤقتة"
      >
        <div className="space-y-3">
          <p className="rounded-2xl bg-amber-50 px-3 py-2.5 text-[11px] leading-relaxed text-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
            كلمة مرور مؤقتة لحساب <b>{tempPassword?.name}</b>. أُنهيت كل جلساته السابقة — سلّمها له ليغيّرها
            بعد الدخول. تُعرض مرة واحدة ولا تُحفظ في أي مكان.
          </p>
          <div className="rounded-2xl bg-gray-900 px-4 py-3 text-center font-mono text-lg font-black tracking-widest text-emerald-300">
            {tempPassword?.password}
          </div>
          <Button className="w-full" onClick={() => setTempPassword(null)}>
            تم — أخذت الكلمة
          </Button>
        </div>
      </Modal>
    </div>
  );
}
