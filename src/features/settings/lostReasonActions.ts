"use server";

import { z } from "zod";
import { db } from "@/db/client";
import { guardCsrf } from "@/features/identity/actions/shared";
import { SIG } from "@/features/identity/actions/sig";
import { createContext } from "@/server/trpc/context";
import { requireManage } from "./adminGate";
import {
  archiveLostReason,
  createLostReason,
  renameLostReason,
  reorderLostReasons,
} from "./lostReasonsRepo";

export type LostReasonActionResult = { ok: true } | { ok: false; error: { id: string } };

const createSchema = z.object({ name: z.string().trim().min(1).max(200) });
const renameSchema = z.object({ id: z.string().uuid(), name: z.string().trim().min(1).max(200) });
const reorderSchema = z.object({ orderedIds: z.array(z.string().uuid()) });
const idSchema = z.object({ id: z.string().uuid() });

async function gate(
  csrfToken: string | null,
): Promise<{ ok: true } | { ok: false; error: { id: string } }> {
  const csrfOk = await guardCsrf(csrfToken);
  if (!csrfOk.ok) return { ok: false, error: { id: "E_AUTH_CSRF" } };
  const { actor } = await createContext();
  const allowed = requireManage(actor);
  if (!allowed.ok) return allowed;
  return { ok: true };
}

export async function createLostReasonAction(
  input: z.input<typeof createSchema>,
  csrfToken: string | null = null,
): Promise<LostReasonActionResult> {
  const g = await gate(csrfToken);
  if (!g.ok) return g;
  const parsed = createSchema.parse(input);
  const r = await createLostReason(db, parsed, SIG());
  if (!r.ok) return { ok: false, error: { id: r.error.id } };
  return { ok: true };
}

export async function renameLostReasonAction(
  input: z.input<typeof renameSchema>,
  csrfToken: string | null = null,
): Promise<LostReasonActionResult> {
  const g = await gate(csrfToken);
  if (!g.ok) return g;
  const parsed = renameSchema.parse(input);
  const r = await renameLostReason(db, parsed, SIG());
  if (!r.ok) return { ok: false, error: { id: r.error.id } };
  return { ok: true };
}

export async function reorderLostReasonsAction(
  input: z.input<typeof reorderSchema>,
  csrfToken: string | null = null,
): Promise<LostReasonActionResult> {
  const g = await gate(csrfToken);
  if (!g.ok) return g;
  const parsed = reorderSchema.parse(input);
  const r = await reorderLostReasons(db, parsed.orderedIds, SIG());
  if (!r.ok) return { ok: false, error: { id: r.error.id } };
  return { ok: true };
}

export async function archiveLostReasonAction(
  input: z.input<typeof idSchema>,
  csrfToken: string | null = null,
): Promise<LostReasonActionResult> {
  const g = await gate(csrfToken);
  if (!g.ok) return g;
  const parsed = idSchema.parse(input);
  const r = await archiveLostReason(db, parsed, SIG());
  if (!r.ok) return { ok: false, error: { id: r.error.id } };
  return { ok: true };
}
