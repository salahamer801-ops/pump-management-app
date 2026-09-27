/**
 * حسابات محلية في المتصفح (localStorage)
 * -------------------------------------
 * وحدة مستقلة لتجربة سريعة دون خادم: المستخدمون والجلسة وسجل التدقيق تُحفظ
 * في متصفح الجهاز نفسه.
 *
 * تنبيه: هذه الوحدة تعمل في المتصفح فقط، وأي شخص يستطيع قراءة/تعديل محتوى
 * localStorage. حساب المسؤول الحقيقي في هذا المشروع يعمل على الخادم
 * (`src/auth/AuthProvider.tsx` + `/api/auth/*` + قاعدة PostgreSQL).
 * لا تخلط الوحدتين في نفس الشاشة.
 */
import type { User, AuthSession, AuditLogEntry } from '../types';

const USERS_KEY = 'pump_users';
const SESSION_KEY = 'pump_session';
const AUDIT_KEY = 'pump_audit_log';

// تشفير بسيط بـ SHA-256 في المتصفح
export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + 'pump_salt_2026');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function generateId(): string {
  return crypto.randomUUID();
}

export function generatePumpCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = 'PMP-';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export function getUsers(): User[] {
  try {
    return JSON.parse(localStorage.getItem(USERS_KEY) || '[]');
  } catch {
    return [];
  }
}

export function saveUsers(users: User[]): void {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

export function getSession(): AuthSession | null {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
  } catch {
    return null;
  }
}

export function saveSession(session: AuthSession): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY);
}

export async function registerUser(
  name: string,
  phone: string,
  password: string,
  accountType: 'manager' | 'shareholder'
): Promise<{ success: boolean; error?: string }> {
  const users = getUsers();

  if (users.find((u) => u.phone === phone)) {
    return { success: false, error: 'رقم الهاتف مستخدم مسبقاً' };
  }
  if (password.length < 6) {
    return { success: false, error: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل' };
  }

  const passwordHash = await hashPassword(password);
  const now = new Date().toISOString();

  const newUser: User = {
    id: generateId(),
    name,
    phone,
    passwordHash,
    accountType,
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };

  users.push(newUser);
  saveUsers(users);
  addAuditLog(newUser.id, 'REGISTER', 'User', newUser.id);

  return { success: true };
}

export async function loginUser(
  phone: string,
  password: string
): Promise<{ success: boolean; session?: AuthSession; error?: string }> {
  const users = getUsers();
  const user = users.find((u) => u.phone === phone);

  if (!user) {
    return { success: false, error: 'رقم الهاتف أو كلمة المرور غير صحيحة' };
  }
  if (user.status !== 'active') {
    return { success: false, error: 'الحساب موقوف' };
  }

  const hash = await hashPassword(password);
  if (hash !== user.passwordHash) {
    return { success: false, error: 'رقم الهاتف أو كلمة المرور غير صحيحة' };
  }

  const now = new Date().toISOString();
  user.lastLoginAt = now;
  saveUsers(users);

  const session: AuthSession = {
    userId: user.id,
    accountType: user.accountType,
    name: user.name,
    loginAt: now,
  };
  saveSession(session);
  addAuditLog(user.id, 'LOGIN', 'User', user.id);

  return { success: true, session };
}

export function logoutUser(userId: string): void {
  addAuditLog(userId, 'LOGOUT', 'User', userId);
  clearSession();
}

export function addAuditLog(
  actorId: string,
  action: string,
  entityType: string,
  entityId: string,
  metadata?: Record<string, unknown>
): void {
  try {
    const logs: AuditLogEntry[] = JSON.parse(localStorage.getItem(AUDIT_KEY) || '[]');
    logs.push({
      id: generateId(),
      actorId,
      action,
      entityType,
      entityId,
      timestamp: new Date().toISOString(),
      metadata,
    });
    localStorage.setItem(AUDIT_KEY, JSON.stringify(logs));
  } catch {
    // تجاهل أخطاء الـ audit log
  }
}
