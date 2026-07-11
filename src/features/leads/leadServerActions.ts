"use server";

import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { guardCsrf } from "@/features/identity/actions/shared";
import { SIG } from "@/features/identity/actions/sig";
import { createContext } from "@/server/trpc/context";
import { archiveLead, createLead, type LeadSession } from "./leadActions";
import { bulkUpdateLeads } from "./leadBulk";
import { bulkConvertLeads } from "./leadBulkConvert";
import { convertLead } from "./leadConvert";
import { updateLead } from "./leadUpdate";
import type {
  BulkConvertLeadsInput,
  BulkUpdateLeadsInput,
  ConvertLeadInput,
  LeadArchiveInput,
  LeadCreateInput,
  LeadUpdateInput,
} from "./schemas";

export type LeadActionResult<T = undefined> =
  | { ok: true; value: T }
  | { ok: false; error: { id: string } };

// Resolve the current actor into a LeadSession, or an auth/csrf failure result. Trust-boundary
// fields (owner, visibility) are derived server-side inside the pure actions from this session.
async function authorize(
  csrfToken: string | null,
): Promise<{ ok: true; session: LeadSession } | { ok: false; error: { id: string } }> {
  const csrfOk = await guardCsrf(csrfToken);
  if (!csrfOk.ok) return { ok: false, error: { id: "E_AUTH_CSRF" } };
  const { actor } = await createContext();
  if (actor === null) return { ok: false, error: { id: "E_AUTH_003" } };

  const flags: Record<string, boolean> = {};
  for (const f of actor.flags) flags[f] = true;
  const [urow] = await db
    .select({ primaryGroup: users.primaryVisibilityGroupId })
    .from(users)
    .where(eq(users.id, actor.id));

  return {
    ok: true,
    session: {
      userId: actor.id,
      isAdmin: actor.type === "admin",
      isActive: actor.isActive,
      sessionLive: true,
      visibilityGroupIds: Array.from(actor.groupIds),
      managedUserIds: Array.from(actor.managedUserIds ?? []),
      primaryVisibilityGroupId: urow?.primaryGroup ?? null,
      flags,
    },
  };
}

export async function createLeadAction(
  input: LeadCreateInput,
  csrfToken: string | null = null,
): Promise<LeadActionResult<{ id: string }>> {
  const auth = await authorize(csrfToken);
  if (!auth.ok) return auth;
  const r = await createLead(db, auth.session, input, SIG());
  if (!r.ok) return { ok: false, error: { id: r.error.id } };
  return { ok: true, value: { id: r.value.id } };
}

export async function archiveLeadAction(
  input: LeadArchiveInput,
  csrfToken: string | null = null,
): Promise<LeadActionResult> {
  const auth = await authorize(csrfToken);
  if (!auth.ok) return auth;
  const r = await archiveLead(db, auth.session, input, SIG());
  if (!r.ok) return { ok: false, error: { id: r.error.id } };
  return { ok: true, value: undefined };
}

export async function convertLeadAction(
  input: ConvertLeadInput,
  csrfToken: string | null = null,
): Promise<LeadActionResult<{ dealId: string }>> {
  const auth = await authorize(csrfToken);
  if (!auth.ok) return auth;
  const r = await convertLead(db, auth.session, input, SIG());
  if (!r.ok) return { ok: false, error: { id: r.error.id } };
  return { ok: true, value: r.value };
}

export async function bulkUpdateLeadsAction(
  input: BulkUpdateLeadsInput,
  csrfToken: string | null = null,
): Promise<LeadActionResult<{ updated: number; skipped: number }>> {
  const auth = await authorize(csrfToken);
  if (!auth.ok) return auth;
  const r = await bulkUpdateLeads(db, auth.session, input, SIG());
  if (!r.ok) return { ok: false, error: { id: r.error.id } };
  return { ok: true, value: r.value };
}

export async function updateLeadAction(
  input: LeadUpdateInput,
  csrfToken: string | null = null,
): Promise<LeadActionResult<{ id: string; updatedAt: string }>> {
  const auth = await authorize(csrfToken);
  if (!auth.ok) return auth;
  const r = await updateLead(db, auth.session, input, SIG());
  if (!r.ok) return { ok: false, error: { id: r.error.id } };
  return { ok: true, value: r.value };
}

export async function bulkConvertLeadsAction(
  input: BulkConvertLeadsInput,
  csrfToken: string | null = null,
): Promise<LeadActionResult<{ converted: number; skipped: number }>> {
  const auth = await authorize(csrfToken);
  if (!auth.ok) return auth;
  const r = await bulkConvertLeads(db, auth.session, input, SIG());
  if (!r.ok) return { ok: false, error: { id: r.error.id } };
  return { ok: true, value: r.value };
}
