"use server";

import { z } from "zod";
import { ERROR_IDS } from "@/constants/errorIds";
import { db } from "@/db/client";
import { assigneeExists, createGoal, deleteGoal, updateGoal } from "@/features/goals/goalsRepo";
import { goalInput } from "@/features/goals/schemas";
import { guardCsrf } from "@/features/identity/actions/shared";
import { SIG } from "@/features/identity/actions/sig";
import { can } from "@/features/permissions/can";
import { createContext } from "@/server/trpc/context";

type ActionResult = { ok: true; value: { id: string } } | { ok: false; error: { id: string } };

// Every goal mutation runs the same gate: a valid CSRF token, a live session, and
// goals.manage. Setting someone's quota is an administrative act, not a personal preference.
async function guard(csrfToken: string | null) {
  const csrfOk = await guardCsrf(csrfToken);
  if (!csrfOk.ok) return { ok: false as const, error: { id: "E_AUTH_CSRF" } };
  const { actor } = await createContext();
  if (actor === null) return { ok: false as const, error: { id: ERROR_IDS.AUTH_SESSION_DEAD } };
  if (!can(actor, "goals.manage")) {
    return { ok: false as const, error: { id: ERROR_IDS.PERM_DENIED } };
  }
  return { ok: true as const, actor };
}

export async function createGoalAction(
  raw: unknown,
  csrfToken: string | null = null,
): Promise<ActionResult> {
  const g = await guard(csrfToken);
  if (!g.ok) return g;

  const parsed = goalInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: { id: ERROR_IDS.GOAL_INVALID } };

  const known = await assigneeExists(db, parsed.data.assigneeKind, parsed.data.assigneeId, SIG());
  if (!known) return { ok: false, error: { id: ERROR_IDS.GOAL_INVALID } };

  const goal = await createGoal(db, parsed.data, SIG());
  return { ok: true, value: { id: goal.id } };
}

// The id is as much untrusted input as the body: a server action is a public endpoint, and an
// unparsed string reaches Postgres as a uuid cast and throws instead of returning a Result.
const goalId = z.string().uuid();

export async function updateGoalAction(
  id: string,
  raw: unknown,
  csrfToken: string | null = null,
): Promise<ActionResult> {
  const g = await guard(csrfToken);
  if (!g.ok) return g;

  const parsedId = goalId.safeParse(id);
  const parsed = goalInput.safeParse(raw);
  if (!parsedId.success || !parsed.success) {
    return { ok: false, error: { id: ERROR_IDS.GOAL_INVALID } };
  }

  const known = await assigneeExists(db, parsed.data.assigneeKind, parsed.data.assigneeId, SIG());
  if (!known) return { ok: false, error: { id: ERROR_IDS.GOAL_INVALID } };

  const goal = await updateGoal(db, parsedId.data, parsed.data, SIG());
  if (goal === null) return { ok: false, error: { id: ERROR_IDS.GOAL_NOT_FOUND } };
  return { ok: true, value: { id: goal.id } };
}

export async function deleteGoalAction(
  id: string,
  csrfToken: string | null = null,
): Promise<ActionResult> {
  const g = await guard(csrfToken);
  if (!g.ok) return g;

  const parsedId = goalId.safeParse(id);
  if (!parsedId.success) return { ok: false, error: { id: ERROR_IDS.GOAL_INVALID } };

  const removed = await deleteGoal(db, parsedId.data, SIG());
  if (!removed) return { ok: false, error: { id: ERROR_IDS.GOAL_NOT_FOUND } };
  return { ok: true, value: { id } };
}
