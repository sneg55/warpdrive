"use server";

import { z } from "zod";
import { LABEL_COLORS, LABEL_TARGETS } from "@/constants/labelColors";
import { db } from "@/db/client";
import { guardCsrf } from "@/features/identity/actions/shared";
import { SIG } from "@/features/identity/actions/sig";
import { requireManage } from "@/features/settings/adminGate";
import { createContext } from "@/server/trpc/context";
import { createLabel, deleteLabel, renameLabel, reorderLabels, setLabelColor } from "./labelsRepo";

export type LabelActionResult = { ok: true } | { ok: false; error: { id: string } };

const createSchema = z.object({
  target: z.enum(LABEL_TARGETS),
  name: z.string().trim().min(1).max(120),
  color: z.enum(LABEL_COLORS),
});
const renameSchema = z.object({ id: z.string().uuid(), name: z.string().trim().min(1).max(120) });
const colorSchema = z.object({ id: z.string().uuid(), color: z.enum(LABEL_COLORS) });
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

export async function createLabelAction(
  input: z.input<typeof createSchema>,
  csrfToken: string | null = null,
): Promise<LabelActionResult> {
  const g = await gate(csrfToken);
  if (!g.ok) return g;
  const parsed = createSchema.parse(input);
  const r = await createLabel(db, parsed, SIG());
  if (!r.ok) return { ok: false, error: { id: r.error.id } };
  return { ok: true };
}

export async function renameLabelAction(
  input: z.input<typeof renameSchema>,
  csrfToken: string | null = null,
): Promise<LabelActionResult> {
  const g = await gate(csrfToken);
  if (!g.ok) return g;
  const parsed = renameSchema.parse(input);
  const r = await renameLabel(db, parsed, SIG());
  if (!r.ok) return { ok: false, error: { id: r.error.id } };
  return { ok: true };
}

export async function setLabelColorAction(
  input: z.input<typeof colorSchema>,
  csrfToken: string | null = null,
): Promise<LabelActionResult> {
  const g = await gate(csrfToken);
  if (!g.ok) return g;
  const parsed = colorSchema.parse(input);
  const r = await setLabelColor(db, parsed, SIG());
  if (!r.ok) return { ok: false, error: { id: r.error.id } };
  return { ok: true };
}

export async function reorderLabelsAction(
  input: z.input<typeof reorderSchema>,
  csrfToken: string | null = null,
): Promise<LabelActionResult> {
  const g = await gate(csrfToken);
  if (!g.ok) return g;
  const parsed = reorderSchema.parse(input);
  const r = await reorderLabels(db, parsed.orderedIds, SIG());
  if (!r.ok) return { ok: false, error: { id: r.error.id } };
  return { ok: true };
}

export async function deleteLabelAction(
  input: z.input<typeof idSchema>,
  csrfToken: string | null = null,
): Promise<LabelActionResult> {
  const g = await gate(csrfToken);
  if (!g.ok) return g;
  const parsed = idSchema.parse(input);
  const r = await deleteLabel(db, parsed, SIG());
  if (!r.ok) return { ok: false, error: { id: r.error.id } };
  return { ok: true };
}
