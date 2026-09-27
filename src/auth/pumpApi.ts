/** نداءات المضخات والعضوية وسجل التدقيق */
import { api } from "./api";
import type { AuditRow, ManagedPump, MemberRow, Membership } from "./types";

export const createPump = (input: { name: string; description?: string; location?: string }) =>
  api<{ pump: ManagedPump }>("/api/pumps", { method: "POST", body: input }).then((r) => r.pump);

export const updatePump = (
  pumpId: string,
  patch: { name?: string; description?: string; location?: string }
) => api<{ pump: ManagedPump }>(`/api/pumps/${pumpId}`, { method: "PATCH", body: patch }).then((r) => r.pump);

export const listPumps = () =>
  api<{ managedPumps: ManagedPump[]; memberships: Membership[] }>("/api/pumps");

export const requestJoin = (pumpCode: string, note = "") =>
  api<{ request: { id: string; status: string } }>("/api/pumps/join", {
    method: "POST",
    body: { pumpCode, note },
  });

export const listRequests = (pumpId: string) =>
  api<{ requests: MemberRow[] }>(`/api/pumps/${pumpId}/requests`).then((r) => r.requests ?? []);

export const listMembers = (pumpId: string) =>
  api<{ members: MemberRow[] }>(`/api/pumps/${pumpId}/members`).then((r) => r.members ?? []);

export const decideRequest = (
  pumpId: string,
  membershipId: string,
  body:
    | { action: "approve"; membershipType: string; personId?: string | null; personName?: string; shareRef?: string; note?: string }
    | { action: "reject"; reason?: string }
) =>
  api<{ membership: Membership }>(`/api/pumps/${pumpId}/requests/${membershipId}/decision`, {
    method: "POST",
    body,
  }).then((r) => r.membership);

export const updateMember = (
  pumpId: string,
  membershipId: string,
  body: { membershipType?: string; personId?: string | null; personName?: string; shareRef?: string; reason?: string }
) =>
  api<{ membership: Membership }>(`/api/pumps/${pumpId}/members/${membershipId}`, {
    method: "PATCH",
    body,
  }).then((r) => r.membership);

export const removeMember = (pumpId: string, membershipId: string, reason: string) =>
  api<{ membership: Membership }>(`/api/pumps/${pumpId}/members/${membershipId}/remove`, {
    method: "POST",
    body: { reason },
  }).then((r) => r.membership);

export const pumpAudit = (pumpId: string) =>
  api<{ logs: AuditRow[] }>(`/api/pumps/${pumpId}/audit`).then((r) => r.logs ?? []);

export const myAudit = () => api<{ logs: AuditRow[] }>("/api/audit/me").then((r) => r.logs ?? []);
