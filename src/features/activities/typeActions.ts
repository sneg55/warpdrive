"use server";

import { z } from "zod";
import { db } from "@/db/client";
import { guardCsrf } from "@/features/identity/actions/shared";
import { SIG } from "@/features/identity/actions/sig";
import { requireManage } from "@/features/settings/adminGate";
import { createContext } from "@/server/trpc/context";
import { createType, deleteType, renameType, reorderTypes, setTypeActive } from "./typesRepo";

export type TypeActionResult = { ok: true } | { ok: false; error: { id: string } };

async function gate(
  csrfToken: string | null,
): Promise<{ ok: true; actorId: string } | { ok: false; error: { id: string } }> {
  const csrfOk = await guardCsrf(csrfToken);
  if (!csrfOk.ok) return { ok: false, error: { id: "E_AUTH_CSRF" } };
  const { actor } = await createContext();
  const allowed = requireManage(actor);
  if (!allowed.ok) return allowed;
  return { ok: true, actorId: allowed.value.id };
}

const createSchema = z.object({
  key: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(120),
  icon: z.string().trim().min(1).max(64).optional(),
});
const renameSchema = z.object({ id: z.string().uuid(), name: z.string().trim().min(1).max(120) });
const reorderSchema = z.object({ orderedIds: z.array(z.string().uuid()) });
const setActiveSchema = z.object({ id: z.string().uuid(), active: z.boolean() });
const idSchema = z.object({ id: z.string().uuid() });

export async function createActivityTypeAction(
  input: z.input<typeof createSchema>,
  csrfToken: string | null = null,
): Promise<TypeActionResult> {
  const g = await gate(csrfToken);
  if (!g.ok) return g;
  const parsed = createSchema.parse(input);
  const r = await createType(db, parsed, SIG());
  if (!r.ok) return { ok: false, error: { id: r.error.id } };
  return { ok: true };
}

export async function renameActivityTypeAction(
  input: z.input<typeof renameSchema>,
  csrfToken: string | null = null,
): Promise<TypeActionResult> {
  const g = await gate(csrfToken);
  if (!g.ok) return g;
  const parsed = renameSchema.parse(input);
  const r = await renameType(db, parsed, SIG());
  if (!r.ok) return { ok: false, error: { id: r.error.id } };
  return { ok: true };
}

export async function reorderActivityTypesAction(
  input: z.input<typeof reorderSchema>,
  csrfToken: string | null = null,
): Promise<TypeActionResult> {
  const g = await gate(csrfToken);
  if (!g.ok) return g;
  const parsed = reorderSchema.parse(input);
  const r = await reorderTypes(db, parsed.orderedIds, SIG());
  if (!r.ok) return { ok: false, error: { id: r.error.id } };
  return { ok: true };
}

export async function setActivityTypeActiveAction(
  input: z.input<typeof setActiveSchema>,
  csrfToken: string | null = null,
): Promise<TypeActionResult> {
  const g = await gate(csrfToken);
  if (!g.ok) return g;
  const parsed = setActiveSchema.parse(input);
  const r = await setTypeActive(db, parsed, SIG());
  if (!r.ok) return { ok: false, error: { id: r.error.id } };
  return { ok: true };
}

export async function deleteActivityTypeAction(
  input: z.input<typeof idSchema>,
  csrfToken: string | null = null,
): Promise<TypeActionResult> {
  const g = await gate(csrfToken);
  if (!g.ok) return g;
  const parsed = idSchema.parse(input);
  const r = await deleteType(db, parsed, SIG());
  if (!r.ok) return { ok: false, error: { id: r.error.id } };
  return { ok: true };
}
