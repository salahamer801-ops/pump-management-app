/**
 * نموذج الحسابات والارتباطات والتدقيق
 * ------------------------------------
 * هذا الملف يصف بيانات الحسابات الحقيقية على الخادم:
 * جدول `users` · جدول `pumps` · جدول `pump_memberships` · جدول `audit_logs`
 * والجلسة المختصرة التي تُحفظ بعد تسجيل الدخول.
 *
 * تنبيه تسمية: يوجد في `src/auth/types.ts` تعريف آخر باسم `AuthSession`
 * (حمولة الجلسة الكاملة القادمة من الـAPI). لا تُستورد النسختان في ملف واحد؛
 * عند الحاجة إلى الاثنين استخدم اسمًا بديلًا في الملف الذي يستوردهما.
 */

/**
 * المضخة كما هي مسجَّلة على الخادم (صف جدول `pumps`).
 * ملاحظة: يوجد نموذجان آخران للمضخة في المشروع وليسا بديلين عن هذا:
 *  - `src/domain/types.ts` → `Pump`: بيانات التشغيل المحلية (البئر، الديزل، الرواسة…).
 *  - `src/auth/types.ts` → `ManagedPump`: عرض الـAPI مع عدد الأعضاء وعدد الطلبات.
 */
export interface Pump {
  id: string;
  /** رقم تعريف المضخة الثابت (PMP-XXXXXX) — عمود `code` في القاعدة */
  pumpCode: string;
  name: string;
  description: string;
  location: string;
  /** معرّف حساب المسؤول المالك للمضخة (عمود `manager_id`) */
  managerId: string;
  status: "active" | "archived";
  createdAt: string;
  updatedAt: string;
}

export interface User {
  id: string;
  name: string;
  phone: string;
  passwordHash: string;
  accountType: "manager" | "shareholder";
  status: "active" | "suspended";
  personId?: string;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
}

export interface PumpMembership {
  id: string;
  userId: string;
  pumpId: string;
  membershipType: "shareholder" | "rightHolder" | "actualUser" | "viewer";
  status: "pending" | "approved" | "rejected" | "removed";
  requestedAt: string;
  approvedAt?: string;
  approvedBy?: string;
  rejectedAt?: string;
  rejectedBy?: string;
  removedAt?: string;
  removedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface MembershipRequest {
  id: string;
  userId: string;
  userName: string;
  userPhone: string;
  pumpId: string;
  pumpCode: string;
  status: "pending" | "approved" | "rejected";
  requestedAt: string;
}

export interface AuthSession {
  userId: string;
  accountType: "manager" | "shareholder";
  name: string;
  loginAt: string;
}

export interface AuditLogEntry {
  id: string;
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}
