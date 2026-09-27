/**
 * قراءة بيانات المسؤول من داخل تطبيق المستخدم (نفس الجهاز) — **قراءة فقط**.
 * لا يوجد في هذا الملف أي دالة تكتب في سجل المسؤول: المستخدم لا يملك صلاحية
 * تعديل أي شيء في حساب المسؤول، وكل ما يراه للاطلاع فقط.
 */
import type { AppState } from "./types";

export const MANAGER_STORAGE_KEY = "pump-org-state-v2";
export const LEGACY_MANAGER_STORAGE_KEY = "pump-organization-state-v1";
export const USER_LINK_KEY = "pump-org-user-link-v1";

/**
 * بيانات كل مضخة منفصلة بمفتاحها — المضخة التي يديرها المسؤول معرّفها الحقيقي
 * من الخادم (pumpId)، لا الاسم.
 */
export function managerStorageKey(pumpId?: string | null): string {
  return pumpId ? `${MANAGER_STORAGE_KEY}::${pumpId}` : MANAGER_STORAGE_KEY;
}

function parseManagerState(raw: string | null): AppState | null {
  try {
    const parsed = JSON.parse(raw ?? "null") as AppState;
    const version = (parsed as { version?: number } | null)?.version;
    if (!parsed || (version !== 2 && version !== 3)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * قراءة بيانات المسؤول من نفس الجهاز.
 * البحث بالترتيب: مفتاح المضخة المطلوبة ← المفتاح العام ← أي مضخة محفوظة في هذا
 * المتصفح (الأحدث تحديثًا) — فيرى المستخدم بيانات مضخته حتى قبل معرفة معرّفها.
 * المستخدم يقرأ فقط ولا يعدّل السجل الرسمي.
 */
export function readManagerState(pumpId?: string | null): AppState | null {
  try {
    if (pumpId) {
      /* البيانات الرسمية من الخادم أولًا (إن وُجدت)، ثم نسخة الجهاز المحلية */
      const official = parseManagerState(localStorage.getItem(officialStorageKey(pumpId)));
      if (official) return official;
      const exact = parseManagerState(localStorage.getItem(managerStorageKey(pumpId)));
      if (exact) return exact;
    }
    const plain = parseManagerState(localStorage.getItem(MANAGER_STORAGE_KEY));
    if (plain) return plain;

    let best: AppState | null = null;
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(`${MANAGER_STORAGE_KEY}::`)) continue;
      const candidate = parseManagerState(localStorage.getItem(key));
      if (!candidate) continue;
      const stamp = (st: AppState) => st.auditLogs?.[0]?.at ?? st.pump?.createdAt ?? "";
      if (!best || stamp(candidate) > stamp(best)) best = candidate;
    }
    return best;
  } catch {
    return null;
  }
}

/**
 * ارتباط الحساب بالشخص صار بموافقة المسؤول على الخادم (§21، §34) —
 * لم يبقَ ارتباط ذاتي محلي يمنح صلاحية.
 *
 * الرمز المحلي هنا ليس صلاحية: هو فقط «أيّ شخص في بيانات هذا الجهاز أستعرض سجله»،
 * ويُستخدم عندما لا توجد عضوية معتمدة من الخادم (قراءة فقط، لا يمنح أي وصول لبيانات غيرك).
 */
/**
 * كل سجلات المضخات المحفوظة على هذا الجهاز (بلا تكرار).
 * تُستخدم لعرض مضخات الوضع المحلي في تطبيق المستخدم — قراءة فقط.
 */
export function localManagerStates(): AppState[] {
  const seen = new Set<string>();
  const out: AppState[] = [];
  const push = (state: AppState | null) => {
    if (!state?.pump) return;
    if (seen.has(state.pump.id)) return;
    seen.add(state.pump.id);
    out.push(state);
  };
  push(readManagerState(null));
  try {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(`${MANAGER_STORAGE_KEY}::`)) continue;
      push(readManagerState(key.slice(MANAGER_STORAGE_KEY.length + 2)));
    }
  } catch {
    /* ignore */
  }
  return out;
}

/**
 * ذاكرة البيانات الرسمية القادمة من الخادم (cache، وليست مصدرًا).
 * المصدر الرسمي هو PostgreSQL — هذه مجرد نسخة تُعرض للمستخدم على جهازه
 * (وتتيح للمساهم رؤية بيانات المضخة الرسمية من أي جهاز).
 */
const OFFICIAL_PREFIX = "pump-org-official::";

export function officialStorageKey(pumpId: string): string {
  return `${OFFICIAL_PREFIX}${pumpId}`;
}

export function saveOfficialState(pumpId: string, state: AppState): void {
  try {
    localStorage.setItem(officialStorageKey(pumpId), JSON.stringify({ ...state, official: true }));
  } catch {
    /* ignore */
  }
}

export function readOfficialState(pumpId: string): AppState | null {
  try {
    return parseManagerState(localStorage.getItem(officialStorageKey(pumpId)));
  } catch {
    return null;
  }
}

export function readUserLink(): string | null {
  try {
    return localStorage.getItem(USER_LINK_KEY);
  } catch {
    return null;
  }
}

export function saveUserLink(personId: string | null): void {
  try {
    if (!personId) localStorage.removeItem(USER_LINK_KEY);
    else localStorage.setItem(USER_LINK_KEY, personId);
  } catch {
    /* ignore */
  }
}

export function clearLegacyUserLink(): void {
  try {
    localStorage.removeItem(USER_LINK_KEY);
  } catch {
    /* ignore */
  }
}
