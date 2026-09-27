/**
 * عميل لوحة مسؤول النظام — كل نداء يمرّ على الخادم، والصلاحية تُفحص هناك.
 */
import { api } from "../auth/api";
import type {
  AdminAuditRow,
  AdminMembershipRow,
  AdminOverview,
  AdminPumpRow,
  AdminUserRow,
  MembershipStatus,
  SystemSettings,
} from "../auth/types";

const qs = (params: Record<string, string | number | undefined | null>) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const text = search.toString();
  return text ? `?${text}` : "";
};

export const adminApi = {
  overview: () => api<AdminOverview>("/api/admin/overview"),

  users: (params: {
    q?: string;
    type?: string;
    status?: string;
    admin?: string;
    limit?: number;
    offset?: number;
  }) => api<{ total: number; users: AdminUserRow[] }>(`/api/admin/users${qs(params)}`),

  updateUser: (id: string, body: { status?: string; isAdmin?: boolean }) =>
    api<{ user: AdminUserRow }>(`/api/admin/users/${id}`, { method: "PATCH", body }),

  revealPhone: (id: string) => api<{ phone: string }>(`/api/admin/users/${id}/reveal-phone`, { method: "POST" }),

  resetPassword: (id: string) =>
    api<{ password: string; phoneMasked: string }>(`/api/admin/users/${id}/reset-password`, { method: "POST" }),

  pumps: (params: { q?: string; status?: string }) =>
    api<{ pumps: AdminPumpRow[] }>(`/api/admin/pumps${qs(params)}`),

  updatePump: (id: string, status: "active" | "archived") =>
    api<{ pump: AdminPumpRow }>(`/api/admin/pumps/${id}`, { method: "PATCH", body: { status } }),

  memberships: (params: { status?: string; q?: string }) =>
    api<{ memberships: AdminMembershipRow[] }>(`/api/admin/memberships${qs(params)}`),

  decideMembership: (id: string, status: MembershipStatus | "pending", reason?: string) =>
    api<{ membership: { id: string; status: string } }>(`/api/admin/memberships/${id}`, {
      method: "PATCH",
      body: { status, reason },
    }),

  audit: (params: { action?: string; q?: string; limit?: number }) =>
    api<{ logs: AdminAuditRow[]; actions: { action: string; n: number }[] }>(
      `/api/admin/audit${qs(params)}`
    ),

  settings: () =>
    api<{
      settings: SystemSettings;
      admins: { id: string; name: string; accountType: string; phoneMasked: string }[];
    }>("/api/admin/settings"),

  updateSettings: (body: Partial<SystemSettings>) =>
    api<{ settings: SystemSettings }>("/api/admin/settings", { method: "PATCH", body }),
};

/** تسميات عربية لأحداث سجل التدقيق */
export const ACTION_LABELS: Record<string, string> = {
  "account.create": "إنشاء حساب",
  "account.update": "تعديل حساب",
  "auth.login": "دخول",
  "auth.logout": "خروج",
  "auth.login_failed": "محاولة دخول فاشلة",
  "password.change": "تغيير كلمة المرور",
  "password.reset_request": "طلب استعادة كلمة المرور",
  "password.reset_request_failed": "طلب استعادة فاشل",
  "password.reset_done": "استعادة كلمة المرور",
  "pump.create": "إنشاء مضخة",
  "pump.update": "تعديل مضخة",
  "membership.request": "طلب ربط بمضخة",
  "membership.approve": "موافقة على طلب",
  "membership.reject": "رفض طلب",
  "membership.remove": "إزالة عضو",
  "admin.bootstrap": "تعيين مسؤول النظام الأول",
  "admin.user_update": "تعديل حساب من اللوحة",
  "admin.phone_view": "كشف رقم هاتف",
  "admin.password_reset": "كلمة مرور مؤقتة",
  "admin.pump_update": "تعديل مضخة من اللوحة",
  "admin.membership_decision": "قرار على طلب من اللوحة",
  "admin.settings_update": "تعديل إعدادات النظام",
};

export const actionLabel = (action: string) => ACTION_LABELS[action] ?? action;
