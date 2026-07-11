"use server";

import { db } from "@/db/client";
import {
  createTeamInput,
  deleteTeamInput,
  setTeamMembersInput,
  updateTeamInput,
} from "@/features/identity/schemas";
import {
  createTeam,
  deleteTeam,
  setTeamMembers,
  updateTeam,
} from "@/features/identity/teams.service";
import { createContext } from "@/server/trpc/context";
import { err, type Result } from "@/types/result";
import { guardCsrf, runWithActor } from "./shared";
import { SIG } from "./sig";

export async function createTeamAction(
  csrf: string | null,
  raw: unknown,
): Promise<Result<{ id: string }, string>> {
  const csrfOk = await guardCsrf(csrf);
  if (!csrfOk.ok) return csrfOk;
  const parsed = createTeamInput.safeParse(raw);
  if (!parsed.success) return err("invalid input");
  const { actor } = await createContext();
  return runWithActor(actor, (a) => createTeam(db, a, parsed.data, SIG()));
}

export async function setTeamMembersAction(
  csrf: string | null,
  raw: unknown,
): Promise<Result<true, string>> {
  const csrfOk = await guardCsrf(csrf);
  if (!csrfOk.ok) return csrfOk;
  const parsed = setTeamMembersInput.safeParse(raw);
  if (!parsed.success) return err("invalid input");
  const { actor } = await createContext();
  return runWithActor(actor, (a) => setTeamMembers(db, a, parsed.data, SIG()));
}

export async function updateTeamAction(
  csrf: string | null,
  raw: unknown,
): Promise<Result<true, string>> {
  const csrfOk = await guardCsrf(csrf);
  if (!csrfOk.ok) return csrfOk;
  const parsed = updateTeamInput.safeParse(raw);
  if (!parsed.success) return err("invalid input");
  const { actor } = await createContext();
  return runWithActor(actor, (a) => updateTeam(db, a, parsed.data, SIG()));
}

export async function deleteTeamAction(
  csrf: string | null,
  raw: unknown,
): Promise<Result<true, string>> {
  const csrfOk = await guardCsrf(csrf);
  if (!csrfOk.ok) return csrfOk;
  const parsed = deleteTeamInput.safeParse(raw);
  if (!parsed.success) return err("invalid input");
  const { actor } = await createContext();
  return runWithActor(actor, (a) => deleteTeam(db, a, parsed.data.teamId, SIG()));
}
