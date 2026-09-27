/**
 * الجلسة الحقيقية تُدار على الخادم (رمز جلسة موقّع بمخزن على القاعدة).
 * هنا فقط: أي مضخة يعمل عليها المسؤول الآن، وتنظيف الجلسة القديمة القديمة القائمة على الاسم.
 */

const ACTIVE_PUMP_KEY = "pump-org-active-pump-v1";
const LEGACY_SESSION_KEY = "pump-org-session-v1";

export function loadActivePumpId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_PUMP_KEY);
  } catch {
    return null;
  }
}

export function saveActivePumpId(id: string | null): void {
  try {
    if (!id) localStorage.removeItem(ACTIVE_PUMP_KEY);
    else localStorage.setItem(ACTIVE_PUMP_KEY, id);
  } catch {
    /* ignore */
  }
}

/** الجلسة القديمة كانت باسم فقط — لا تُعتبر هوية، وتُزال */
export function clearLegacySession(): void {
  try {
    localStorage.removeItem(LEGACY_SESSION_KEY);
  } catch {
    /* ignore */
  }
}
