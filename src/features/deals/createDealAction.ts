"use server";

import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { guardCsrf } from "@/features/identity/actions/shared";
import { SIG } from "@/features/identity/actions/sig";
import { guardWrite } from "@/server/guardWrite";
import { createContext } from "@/server/trpc/context";
import { isDealVisibleToSession } from "./createdVisibility";
import { createDeal } from "./dealActions";
import type { DealCreateInput } from "./schemas";

export type CreateDealResult =
  | { ok: true; deal: { id: string; updatedAt: string } | null }
  | { ok: false; error: { id: string } };

export async function createDealAction(
  input: DealCreateInput,
  csrfToken: string | null = null,
): Promise<CreateDealResult> {
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

  const result = await guardWrite("createDealAction", actor.id, () =>
    createDeal(db, session, input, SIG()),
  );
  if (!result.ok) return { ok: false, error: { id: result.error.id } };

  if (!(await isDealVisibleToSession(db, session, result.value.id, SIG()))) {
    return { ok: true, deal: null };
  }

  return {
    ok: true,
    deal: { id: result.value.id, updatedAt: result.value.updatedAt.toISOString() },
  };
}
