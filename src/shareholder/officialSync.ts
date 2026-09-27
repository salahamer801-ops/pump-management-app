/**
 * قراءة البيانات الرسمية للمضخات التي وافق مسؤولها على ارتباط المستخدم بها.
 *
 * المصدر الرسمي هو الخادم (PostgreSQL) — فيرى المستخدم بيانات المضخة من أي جهاز،
 * وتُخزَّن نسخة للعرض فقط على جهازه (cache) لا تمنح أي صلاحية.
 *
 * اقتصاد النداءات: قبل كل تنزيل كامل نسأل «رقم النسخة» وحده؛ فإن كانت النسخة
 * نفسها نكتفي بها. و«جديد» الإشعارات علم شخصي على الخادم لكل مستخدم.
 */
import type { Membership } from "../auth/types";
import {
  fetchOperatingVersion,
  markNotificationsRead,
  officialStateFromResponse,
  pullOperating,
} from "../domain/serverSync";
import { readOfficialMeta, saveOfficialMeta, saveOfficialState } from "../domain/storage";

export interface OfficialSyncResult {
  /** معرّفات المضخات التي حُدِّثت بياناتها الرسمية */
  updated: string[];
  /** مضخات فُحصت ولم تتغيّر نسختها — بلا تنزيل */
  unchanged: string[];
  /** هل تعذّر الاتصال بالخادم */
  offline: boolean;
}

export type PumpSyncOutcome = "updated" | "unchanged" | "offline";

/**
 * مزامنة مضخة واحدة:
 *  - `force` (تحديث يدوي): ينزّل البيانات مهما كان رقم النسخة.
 *  - بلا `force`: يسأل رقم النسخة أولًا، وينزّل عند اختلافها فقط.
 */
export async function syncOfficialPump(pumpId: string, force = false): Promise<PumpSyncOutcome> {
  const local = readOfficialMeta(pumpId);

  if (!force) {
    const remote = await fetchOperatingVersion(pumpId);
    if (!remote) return "offline";
    if (local.syncedAt && remote.version === local.version) {
      /* نفس النسخة: نبضة خفيفة فقط، ولا تنزيل */
      saveOfficialMeta(pumpId, { syncedAt: local.syncedAt });
      return "unchanged";
    }
  }

  const payload = await pullOperating(pumpId);
  if (!payload) return "offline";

  try {
    saveOfficialState(pumpId, officialStateFromResponse(payload));
  } catch {
    /* التخزين ممتلئ — لا نُفشل العرض */
  }

  saveOfficialMeta(pumpId, {
    version: Number(payload.meta?.version) || 0,
    syncedAt: new Date().toISOString(),
    /* علم القراءة يأتي من الخادم (شخصي) — يُدمج مع ما قرأه المستخدم الآن */
    readNotificationIds: mergeReadIds(local.readNotificationIds, payload.readNotificationIds),
  });

  return "updated";
}

/** دمج معرّفات القراءة: الخادم + المحلي (بلا تكرار) */
export function mergeReadIds(local: readonly string[], remote: readonly string[] | undefined): string[] {
  const out = new Set<string>();
  for (const id of local) if (id) out.add(id);
  for (const id of remote ?? []) if (id) out.add(id);
  return [...out];
}

export async function syncOfficialPumps(
  memberships: Membership[],
  options: { force?: boolean } = {}
): Promise<OfficialSyncResult> {
  const approved = memberships.filter((m) => m.status === "approved");
  const updated: string[] = [];
  const unchanged: string[] = [];
  let offline = false;

  for (const m of approved) {
    const outcome = await syncOfficialPump(m.pumpId, options.force === true);
    if (outcome === "updated") updated.push(m.pumpId);
    else if (outcome === "unchanged") unchanged.push(m.pumpId);
    else offline = true;
  }

  return { updated, unchanged, offline };
}

/**
 * تمييز الإشعارات كمقروءة لهذا المستخدم: محليًّا فورًا (فتختفي الشارة بلا انتظار)،
 * ثم على الخادم ليبقى العلم مع المستخدم على أي جهاز.
 */
export async function markMyNotificationsRead(pumpId: string, ids?: string[]): Promise<void> {
  const local = readOfficialMeta(pumpId);
  const optimistic = ids && ids.length ? mergeReadIds(local.readNotificationIds, ids) : local.readNotificationIds;
  if (ids && ids.length) saveOfficialMeta(pumpId, { readNotificationIds: optimistic });

  const remote = await markNotificationsRead(pumpId, ids);
  if (remote) saveOfficialMeta(pumpId, { readNotificationIds: mergeReadIds(local.readNotificationIds, remote) });
}
