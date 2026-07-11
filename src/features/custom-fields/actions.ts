"use server";

import { z } from "zod";
import { ERROR_IDS } from "@/constants/errorIds";
import { db } from "@/db/client";
import { guardCsrf } from "@/features/identity/actions/shared";
import { SIG } from "@/features/identity/actions/sig";
import { can } from "@/features/permissions/can";
import { createContext } from "@/server/trpc/context";
import type { CustomFieldDef } from "@/types/customFields";
import { setBuiltinHiddenSchema } from "./builtinSchema";
import { archiveDefInputSchema, createDefInputSchema, setDefFlagsInputSchema } from "./defSchema";
import {
  archiveDef,
  type CreateDefInput,
  createDef,
  reorderDefs,
  setDefFlags,
  updateDefName,
} from "./defsRepo";
import { addOption, archiveOption, renameOption } from "./defsRepo.options";
import { setBuiltinFieldHidden } from "./hiddenBuiltinsRepo";

type DefResult = { ok: true; value: CustomFieldDef } | { ok: false; error: { id: string } };
type VoidResult = { ok: true } | { ok: false; error: { id: string } };

const renameSchema = z.object({ id: z.string().uuid(), name: z.string().trim().min(1).max(255) });
// Bounded: a tenant never has hundreds of custom fields, so cap the array to keep the reorder
// transaction (one UPDATE per id) from being driven arbitrarily long by a crafted request.
const reorderSchema = z.object({ orderedIds: z.array(z.string().uuid()).max(200) });
const addOptionSchema = z.object({
  id: z.string().uuid(),
  label: z.string().trim().min(1).max(255),
});
const renameOptionSchema = z.object({
  id: z.string().uuid(),
  optionId: z.string().min(1),
  label: z.string().trim().min(1).max(255),
});
const archiveOptionSchema = z.object({ id: z.string().uuid(), optionId: z.string().min(1) });

// The ACTION layer enforces the metadata.manage gate: the repo functions are ungated.
async function gateMetadata(
  csrfToken: string | null,
): Promise<{ ok: true } | { ok: false; error: { id: string } }> {
  const csrfOk = await guardCsrf(csrfToken);
  if (!csrfOk.ok) return { ok: false, error: { id: "E_AUTH_CSRF" } };
  const { actor } = await createContext();
  if (actor === null) return { ok: false, error: { id: ERROR_IDS.AUTH_SESSION_DEAD } };
  if (!can(actor, "metadata.manage")) return { ok: false, error: { id: ERROR_IDS.PERM_DENIED } };
  return { ok: true };
}

export async function createDefAction(
  input: CreateDefInput,
  csrfToken: string | null = null,
): Promise<DefResult> {
  const g = await gateMetadata(csrfToken);
  if (!g.ok) return g;
  const parsed = createDefInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: { id: ERROR_IDS.CF_INPUT_INVALID } };
  const result = await createDef(db, parsed.data, SIG());
  if (!result.ok) return { ok: false, error: { id: result.error.id } };
  return { ok: true, value: result.value };
}

export async function archiveDefAction(
  input: { id: string },
  csrfToken: string | null = null,
): Promise<DefResult> {
  const g = await gateMetadata(csrfToken);
  if (!g.ok) return g;
  const parsed = archiveDefInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: { id: ERROR_IDS.CF_INPUT_INVALID } };
  const result = await archiveDef(db, parsed.data.id, SIG());
  if (!result.ok) return { ok: false, error: { id: result.error.id } };
  return { ok: true, value: result.value };
}

export async function renameDefAction(
  input: z.input<typeof renameSchema>,
  csrfToken: string | null = null,
): Promise<DefResult> {
  const g = await gateMetadata(csrfToken);
  if (!g.ok) return g;
  const parsed = renameSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: { id: ERROR_IDS.CF_INPUT_INVALID } };
  const result = await updateDefName(db, parsed.data, SIG());
  if (!result.ok) return { ok: false, error: { id: result.error.id } };
  return { ok: true, value: result.value };
}

export async function setDefFlagsAction(
  input: z.input<typeof setDefFlagsInputSchema>,
  csrfToken: string | null = null,
): Promise<VoidResult> {
  const g = await gateMetadata(csrfToken);
  if (!g.ok) return g;
  const parsed = setDefFlagsInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: { id: ERROR_IDS.CF_INPUT_INVALID } };
  const result = await setDefFlags(db, parsed.data, SIG());
  if (!result.ok) return { ok: false, error: { id: result.error.id } };
  return { ok: true };
}

export async function reorderDefsAction(
  input: z.input<typeof reorderSchema>,
  csrfToken: string | null = null,
): Promise<VoidResult> {
  const g = await gateMetadata(csrfToken);
  if (!g.ok) return g;
  const parsed = reorderSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: { id: ERROR_IDS.CF_INPUT_INVALID } };
  const result = await reorderDefs(db, parsed.data.orderedIds, SIG());
  if (!result.ok) return { ok: false, error: { id: result.error.id } };
  return { ok: true };
}

export async function addOptionAction(
  input: z.input<typeof addOptionSchema>,
  csrfToken: string | null = null,
): Promise<DefResult> {
  const g = await gateMetadata(csrfToken);
  if (!g.ok) return g;
  const parsed = addOptionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: { id: ERROR_IDS.CF_INPUT_INVALID } };
  const result = await addOption(db, parsed.data, SIG());
  if (!result.ok) return { ok: false, error: { id: result.error.id } };
  return { ok: true, value: result.value };
}

export async function renameOptionAction(
  input: z.input<typeof renameOptionSchema>,
  csrfToken: string | null = null,
): Promise<DefResult> {
  const g = await gateMetadata(csrfToken);
  if (!g.ok) return g;
  const parsed = renameOptionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: { id: ERROR_IDS.CF_INPUT_INVALID } };
  const result = await renameOption(db, parsed.data, SIG());
  if (!result.ok) return { ok: false, error: { id: result.error.id } };
  return { ok: true, value: result.value };
}

export async function archiveOptionAction(
  input: z.input<typeof archiveOptionSchema>,
  csrfToken: string | null = null,
): Promise<DefResult> {
  const g = await gateMetadata(csrfToken);
  if (!g.ok) return g;
  const parsed = archiveOptionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: { id: ERROR_IDS.CF_INPUT_INVALID } };
  const result = await archiveOption(db, parsed.data, SIG());
  if (!result.ok) return { ok: false, error: { id: result.error.id } };
  return { ok: true, value: result.value };
}

// Hide or unhide a built-in field. The repo rejects locked/unknown keys (E_CF_005/E_CF_006);
// the action layer enforces the same metadata.manage gate as the def actions.
export async function setBuiltinFieldHiddenAction(
  input: z.input<typeof setBuiltinHiddenSchema>,
  csrfToken: string | null = null,
): Promise<VoidResult> {
  const g = await gateMetadata(csrfToken);
  if (!g.ok) return g;
  const parsed = setBuiltinHiddenSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: { id: ERROR_IDS.CF_INPUT_INVALID } };
  const result = await setBuiltinFieldHidden(db, parsed.data, SIG());
  if (!result.ok) return { ok: false, error: { id: result.error.id } };
  return { ok: true };
}
