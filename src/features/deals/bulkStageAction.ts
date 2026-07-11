"use server";

import { db } from "@/db/client";
import { guardCsrf } from "@/features/identity/actions/shared";
import { SIG } from "@/features/identity/actions/sig";
import { createContext } from "@/server/trpc/context";
import type { BulkRowResult } from "./bulkActions";
import { bulkUpdateStage } from "./bulkActions";
import type { BulkStageInput } from "./schemas";

export type BulkStageResult =
  | { ok: true; rows: BulkRowResult[] }
  | { ok: false; error: { id: string } };

// CSRF-guarded bulk stage action.
// guardCsrf is called FIRST: no DB work happens before CSRF is verified.
// Per-row authorization is enforced inside bulkUpdateStage (two-stage visibility + can check).
export async function bulkStageAction(
  input: BulkStageInput,
  csrfToken: string | null = null,
): Promise<BulkStageResult> {
  const csrfOk = await guardCsrf(csrfToken);
  if (!csrfOk.ok) return { ok: false, error: { id: "E_AUTH_CSRF" } };

  const { actor } = await createContext();
  if (actor === null) return { ok: false, error: { id: "E_AUTH_003" } };

  const result = await bulkUpdateStage(db, actor, input, SIG());
  if (!result.ok) return { ok: false, error: { id: result.error.id } };

  return { ok: true, rows: result.value };
}
