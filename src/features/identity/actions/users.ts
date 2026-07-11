"use server";

import { db } from "@/db/client";
import { assignSetInput, setActiveInput, setAdminInput } from "@/features/identity/schemas";
import {
  assignPermissionSet,
  setUserActive,
  setUserAdmin,
} from "@/features/identity/users.service";
import { createContext } from "@/server/trpc/context";
import { err, type Result } from "@/types/result";
import { guardCsrf, runWithActor } from "./shared";
import { SIG } from "./sig";

export async function assignPermissionSetAction(
  csrf: string | null,
  raw: unknown,
): Promise<Result<true, string>> {
  const csrfOk = await guardCsrf(csrf);
  if (!csrfOk.ok) return csrfOk;
  const parsed = assignSetInput.safeParse(raw);
  if (!parsed.success) return err("invalid input");
  const { actor } = await createContext();
  return runWithActor(actor, (a) => assignPermissionSet(db, a, parsed.data, SIG()));
}

export async function setUserAdminAction(
  csrf: string | null,
  raw: unknown,
): Promise<Result<true, string>> {
  const csrfOk = await guardCsrf(csrf);
  if (!csrfOk.ok) return csrfOk;
  const parsed = setAdminInput.safeParse(raw);
  if (!parsed.success) return err("invalid input");
  const { actor } = await createContext();
  return runWithActor(actor, (a) => setUserAdmin(db, a, parsed.data, SIG()));
}

export async function setUserActiveAction(
  csrf: string | null,
  raw: unknown,
): Promise<Result<true, string>> {
  const csrfOk = await guardCsrf(csrf);
  if (!csrfOk.ok) return csrfOk;
  const parsed = setActiveInput.safeParse(raw);
  if (!parsed.success) return err("invalid input");
  const { actor } = await createContext();
  return runWithActor(actor, (a) => setUserActive(db, a, parsed.data, SIG()));
}
