"use server";

import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { guardCsrf } from "@/features/identity/actions/shared";
import { SIG } from "@/features/identity/actions/sig";
import { createContext } from "@/server/trpc/context";
import { createDeal } from "./dealActions";
import type { DealCreateInput } from "./schemas";

export type CreateDealResult =
  | { ok: true; deal: { id: string; updatedAt: string } }
  | { ok: false; error: { id: string } };

// CSRF-guarded deal create action.
// guardCsrf is called FIRST: no DB work happens before CSRF is verified.
// Trust-boundary fields (ownerId, visibilityLevel) are derived server-side inside createDeal.
export async function createDealAction(
  input: DealCreateInput,
  csrfToken: string | null = null,
): Promise<CreateDealResult> {
  const csrfOk = await guardCsrf(csrfToken);
  if (!csrfOk.ok) return { ok: false, error: { id: "E_AUTH_CSRF" } };

  const { actor } = await createContext();
  if (actor === null) return { ok: false, error: { id: "E_AUTH_003" } };

  // Build the CreateDealSession shape createDeal expects from the PermSetUser actor.
  // Flags must carry the actor's real capability set: createDeal enforces deal.create
  // and the pipeline-visibility gate from these (an empty map would deny every regular
  // user, and previously bypassed the gate entirely).
  const flags: Record<string, boolean> = {};
  for (const f of actor.flags) flags[f] = true;

  // Resolve the actor's stored primary visibility group so a group-default deal can inherit
  // it (createDeal falls back to this when no group hint is supplied). PermSetUser does not
  // carry this field, so read it here rather than hardcoding null.
  const [urow] = await db
    .select({ primaryGroup: users.primaryVisibilityGroupId })
    .from(users)
    .where(eq(users.id, actor.id));

  const session = {
    userId: actor.id,
    isAdmin: actor.type === "admin",
    isActive: actor.isActive,
    sessionLive: true,
    visibilityGroupIds: Array.from(actor.groupIds),
    managedUserIds: Array.from(actor.managedUserIds ?? []),
    primaryVisibilityGroupId: urow?.primaryGroup ?? null,
    flags,
  };

  const result = await createDeal(db, session, input, SIG());
  if (!result.ok) return { ok: false, error: { id: result.error.id } };

  return {
    ok: true,
    deal: { id: result.value.id, updatedAt: result.value.updatedAt.toISOString() },
  };
}
