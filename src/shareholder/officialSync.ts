/**
 * قراءة البيانات الرسمية للمضخات التي وافق مسؤولها على ارتباط المستخدم بها.
 *
 * المصدر الرسمي هو الخادم (PostgreSQL) — فيرى المستخدم بيانات المضخة من أي جهاز،
 * وتُخزَّن نسخة للعرض فقط على جهازه (cache) لا تمنح أي صلاحية.
 */
import type { Membership } from "../auth/types";
import { officialStateFromResponse, pullOperating } from "../domain/serverSync";
import { saveOfficialState } from "../domain/storage";

export interface OfficialSyncResult {
  /** معرّفات المضخات التي حُدِّثت بياناتها الرسمية */
  updated: string[];
  /** هل تعذّر الاتصال بالخادم */
  offline: boolean;
}

export async function syncOfficialPumps(memberships: Membership[]): Promise<OfficialSyncResult> {
  const approved = memberships.filter((m) => m.status === "approved");
  const updated: string[] = [];
  let offline = false;

  for (const m of approved) {
    const payload = await pullOperating(m.pumpId);
    if (!payload) {
      offline = true;
      continue;
    }
    try {
      saveOfficialState(m.pumpId, officialStateFromResponse(payload));
      updated.push(m.pumpId);
    } catch {
      /* التخزين ممتلئ — لا نُفشل العرض */
    }
  }

  return { updated, offline };
}
