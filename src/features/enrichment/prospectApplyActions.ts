"use server";

import { z } from "zod";
import { ERROR_IDS } from "@/constants/errorIds";
import { PROSPECT_SELECTION_MAX } from "@/constants/prospectSearch";
import { db } from "@/db/client";
import { loadContactActor } from "@/features/contacts/actorAdapters";
import { guardCsrf } from "@/features/identity/actions/shared";
import { createContext } from "@/server/trpc/context";
import { type ActionResult, toClientResult } from "@/types/actionResult";
import { applyProspects, type ProspectApplyOutcome } from "./prospectApply";

const APPLY_TIMEOUT_MS = 25_000;
const MAX_SELECTIONS_PER_ITEM = 100;

const selectionInput = z.object({
  canonicalKey: z.string().min(1),
  value: z.union([z.string(), z.number()]),
  makePrimary: z.boolean().optional(),
});

const applyProspectsInput = z.object({
  orgId: z.string().uuid(),
  batchId: z.string().uuid(),
  mappingsFingerprint: z.string(),
  items: z
    .array(
      z.object({
        providerRef: z.string().min(1),
        selections: z.array(selectionInput).max(MAX_SELECTIONS_PER_ITEM),
        existing: z
          .object({
            personId: z.string().uuid(),
            expectedUpdatedAtIso: z.string().min(1),
          })
          .nullable(),
      }),
    )
    .max(PROSPECT_SELECTION_MAX),
});

export async function applyProspectsAction(
  raw: unknown,
  csrfToken: string | null = null,
): Promise<ActionResult<ProspectApplyOutcome[]>> {
  const csrfOk = await guardCsrf(csrfToken);
  if (!csrfOk.ok) return { ok: false, error: { id: "E_AUTH_CSRF" } };

  const { actor } = await createContext();
  if (actor === null) return { ok: false, error: { id: ERROR_IDS.AUTH_SESSION_DEAD } };

  const parsed = applyProspectsInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: { id: ERROR_IDS.ENRICH_INPUT_INVALID } };

  const signal = AbortSignal.timeout(APPLY_TIMEOUT_MS);
  const contactActor = await loadContactActor(db, actor, signal);
  return toClientResult(await applyProspects(db, contactActor, parsed.data, new Date(), signal));
}
