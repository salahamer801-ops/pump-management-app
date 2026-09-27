export type AccountType = "manager" | "user";

export type MembershipType =
  | "shareholder"
  | "rightHolder"
  | "actualUser"
  | "viewer"
  | "accountant"
  | "pumpOperator";

export type MembershipStatus = "pending" | "approved" | "rejected" | "removed";

export interface AccountUser {
  id: string;
  name: string;
  phone: string;
  accountType: AccountType;
  status: "active" | "suspended";
  /** مسؤول النظام: يفتح لوحة التحكم — الصلاحية محقّقة على الخادم */
  isAdmin?: boolean;
  createdAt: string;
  lastLoginAt: string | null;
}

/** إعلان عام يكتبه مسؤول النظام ويظهر لكل المستخدمين */
export interface Announcement {
  active: boolean;
  tone: "info" | "warn" | "danger";
  text: string;
}

export interface RegistrationFlags {
  manager: boolean;
  user: boolean;
}

export interface SystemSettings {
  announcement: Announcement;
  registration: RegistrationFlags;
}

/* ------------------------- لوحة مسؤول النظام ------------------------- */

export interface AdminCounts {
  users_total: number;
  managers: number;
  members: number;
  suspended: number;
  admins: number;
  new_users_7d: number;
  pumps_total: number;
  pumps_active: number;
  pending_requests: number;
  approved_memberships: number;
  active_sessions: number;
  events_24h: number;
  db_size: string;
}

export interface AdminOverview {
  counts: AdminCounts;
  series: { day: string; users: number; pumps: number }[];
  recent: AdminAuditRow[];
  pending: {
    id: string;
    personName: string;
    userName: string;
    accountType: string;
    pumpName: string;
    pumpCode: string;
    requestedAt: string;
  }[];
  topPumps: { name: string; code: string; members: number }[];
}

export interface AdminUserRow {
  id: string;
  name: string;
  phoneMasked: string;
  accountType: AccountType;
  status: "active" | "suspended";
  isAdmin: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  pumpsCount: number;
  membershipsCount: number;
  pendingCount: number;
  sessionsCount: number;
}

export interface AdminPumpRow {
  id: string;
  pumpCode: string;
  name: string;
  location: string;
  status: string;
  managerName: string;
  managerPhoneMasked: string;
  membersCount: number;
  pendingCount: number;
  createdAt: string;
}

export interface AdminMembershipRow {
  id: string;
  pumpId: string;
  pumpName: string;
  pumpCode: string;
  managerName: string;
  userName: string;
  userPhoneMasked: string;
  userAccountType: AccountType;
  membershipType: string;
  status: MembershipStatus;
  personName: string;
  shareRef: string;
  note: string;
  requestedAt: string;
  approvedAt: string | null;
  rejectedAt: string | null;
  rejectReason: string;
  removedAt: string | null;
  removeReason: string;
}

export interface AdminAuditRow {
  id: string;
  at: string;
  action: string;
  actorName: string;
  actorRole: string;
  entityType: string;
  entityId: string;
  entityLabel: string;
  pumpId: string | null;
  pumpName: string | null;
  pumpCode: string | null;
  source: string;
  metadata: Record<string, unknown>;
}

export interface ManagedPump {
  id: string;
  /** رقم تعريف المضخة الثابت (PMP-XXXXXX) */
  pumpCode: string;
  name: string;
  description: string;
  location: string;
  /** معرّف حساب المسؤول المالك للمضخة */
  managerId: string;
  status: string;
  createdAt: string;
  membersCount: number;
  pendingCount: number;
}

export interface Membership {
  id: string;
  pumpId: string;
  pumpCode: string;
  pumpName: string | null;
  pumpLocation?: string | null;
  managerName?: string | null;
  membershipType: MembershipType;
  status: MembershipStatus;
  personId: string | null;
  personName: string;
  shareRef: string;
  requestedAt: string;
  approvedAt: string | null;
  rejectedAt: string | null;
  rejectReason?: string;
  removedAt: string | null;
  removeReason?: string;
}

export interface MemberRow extends Membership {
  user: { id: string; name: string; phoneMasked: string; accountType?: AccountType };
}

export interface AuditRow {
  id: string;
  at: string;
  actorId: string | null;
  actorName: string;
  actorRole: string;
  action: string;
  entityType: string;
  entityId: string;
  pumpId: string | null;
  source: string;
  metadata: Record<string, unknown>;
}

export interface AuthSession {
  user: AccountUser;
  /** الإعلان العام من مسؤول النظام (إن وُجد) */
  announcement?: Announcement;
  managedPumps: ManagedPump[];
  memberships: Membership[];
  pendingRequests: number;
}

export type AuthResponse = AuthSession & { token: string };

export const MEMBERSHIP_LABEL: Record<MembershipType, string> = {
  shareholder: "مساهم أساسي",
  rightHolder: "صاحب حق",
  actualUser: "مستخدم فعلي",
  viewer: "مشاهد فقط",
  accountant: "محاسب",
  pumpOperator: "مشغّل المضخة",
};

export const STATUS_LABEL: Record<MembershipStatus, string> = {
  pending: "بانتظار موافقة المسؤول",
  approved: "مرتبط ومعتمد",
  rejected: "مرفوض",
  removed: "أُزيل الارتباط",
};

export const ACTION_LABEL: Record<string, string> = {
  "account.create": "إنشاء حساب",
  "account.update": "تعديل حساب",
  "auth.login": "تسجيل دخول",
  "auth.logout": "تسجيل خروج",
  "auth.login_failed": "محاولة دخول فاشلة",
  "password.change": "تغيير كلمة المرور",
  "password.reset_request": "طلب استعادة كلمة المرور",
  "password.reset_request_failed": "طلب استعادة غير مطابق",
  "password.reset": "استعادة كلمة المرور",
  "password.reset_failed": "رمز استعادة خاطئ",
  "pump.create": "إنشاء مضخة",
  "pump.update": "تعديل بيانات المضخة",
  "membership.request": "طلب ربط بمضخة",
  "membership.approve": "قبول طلب ربط",
  "membership.reject": "رفض طلب ربط",
  "membership.update": "تغيير صلاحية/ربط شخص",
  "membership.remove": "إزالة مستخدم من المضخة",
};
