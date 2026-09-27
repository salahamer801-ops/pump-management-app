/**
 * مولّدات المعرّفات — وحدات مساعدة بلا أي علاقة بالمصادقة.
 * المصادقة والجلسة كلها على الخادم (`src/auth/AuthProvider.tsx` + `/api/auth/*`).
 */

export function generateId(): string {
  return crypto.randomUUID();
}

/** رقم تعريف المضخة الثابت (PMP-XXXXXX) — يُولَّد محليًا حتى تُسجَّل المضخة على الخادم */
export function generatePumpCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = 'PMP-';
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}
