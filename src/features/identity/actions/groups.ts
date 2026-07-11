"use server";

import { db } from "@/db/client";
import { createGroupInput, groupMemberInput } from "@/features/identity/schemas";
import {
  addGroupMember,
  createVisibilityGroup,
  removeGroupMember,
} from "@/features/identity/visibility-groups.service";
import { createContext } from "@/server/trpc/context";
import { err, type Result } from "@/types/result";
import { guardCsrf, runWithActor } from "./shared";
import { SIG } from "./sig";

export async function createGroupAction(
  csrf: string | null,
  raw: unknown,
): Promise<Result<{ id: string }, string>> {
  const csrfOk = await guardCsrf(csrf);
  if (!csrfOk.ok) return csrfOk;
  const parsed = createGroupInput.safeParse(raw);
  if (!parsed.success) return err("invalid input");
  const { actor } = await createContext();
  return runWithActor(actor, (a) => createVisibilityGroup(db, a, parsed.data, SIG()));
}

export async function addGroupMemberAction(
  csrf: string | null,
  raw: unknown,
): Promise<Result<true, string>> {
  const csrfOk = await guardCsrf(csrf);
  if (!csrfOk.ok) return csrfOk;
  const parsed = groupMemberInput.safeParse(raw);
  if (!parsed.success) return err("invalid input");
  const { actor } = await createContext();
  return runWithActor(actor, (a) => addGroupMember(db, a, parsed.data, SIG()));
}

export async function removeGroupMemberAction(
  csrf: string | null,
  raw: unknown,
): Promise<Result<true, string>> {
  const csrfOk = await guardCsrf(csrf);
  if (!csrfOk.ok) return csrfOk;
  const parsed = groupMemberInput.safeParse(raw);
  if (!parsed.success) return err("invalid input");
  const { actor } = await createContext();
  return runWithActor(actor, (a) => removeGroupMember(db, a, parsed.data, SIG()));
}
