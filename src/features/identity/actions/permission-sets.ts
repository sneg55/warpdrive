"use server";

import { db } from "@/db/client";
import {
  createPermissionSet,
  updatePermissionSetFlags,
} from "@/features/identity/permission-sets.service";
import { createPermissionSetInput, updateFlagsInput } from "@/features/identity/schemas";
import { createContext } from "@/server/trpc/context";
import { err, type Result } from "@/types/result";
import { guardCsrf, runWithActor } from "./shared";
import { SIG } from "./sig";

export async function createPermissionSetAction(
  csrf: string | null,
  raw: unknown,
): Promise<Result<{ id: string }, string>> {
  const csrfOk = await guardCsrf(csrf);
  if (!csrfOk.ok) return csrfOk;
  const parsed = createPermissionSetInput.safeParse(raw);
  if (!parsed.success) return err("invalid input");
  const { actor } = await createContext();
  return runWithActor(actor, (a) => createPermissionSet(db, a, parsed.data, SIG()));
}

export async function updateFlagsAction(
  csrf: string | null,
  raw: unknown,
): Promise<Result<true, string>> {
  const csrfOk = await guardCsrf(csrf);
  if (!csrfOk.ok) return csrfOk;
  const parsed = updateFlagsInput.safeParse(raw);
  if (!parsed.success) return err("invalid input");
  const { actor } = await createContext();
  return runWithActor(actor, (a) => updatePermissionSetFlags(db, a, parsed.data, SIG()));
}
