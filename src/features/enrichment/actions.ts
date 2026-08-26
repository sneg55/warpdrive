"use server";

import { z } from "zod";
import { ERROR_IDS } from "@/constants/errorIds";
import { db } from "@/db/client";
import { toContactActor } from "@/features/contacts/actorAdapters";
import { guardCsrf } from "@/features/identity/actions/shared";
import { createContext } from "@/server/trpc/context";
import { type Applied, applyEnrichment } from "./applyService";
import { type RunView, runEnrichment } from "./service";

// The fan-out waits on RocketReach's polling budget, so the ordinary 8s action signal is too
// short. This is the only place in the app that deliberately runs longer.
const ENRICH_TIMEOUT_MS = 25_000;

type ActionResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: { id: string; context?: Record<string, unknown> } };

const enrichInput = z.object({
  entityType: z.enum(["person", "organization"]),
  entityId: z.string().uuid(),
  refresh: z.boolean().optional(),
});

const applyInput = z.object({
  runId: z.string().uuid(),
  expectedUpdatedAtIso: z.string().min(1),
  mappingsFingerprint: z.string(),
  selections: z
    .array(
      z.object({
        canonicalKey: z.string().min(1),
        value: z.union([z.string(), z.number()]),
        // Set targets only. Declared here because z.object strips what it does not name, so
        // omitting it would silently turn every promotion back into a plain add.
        makePrimary: z.boolean().optional(),
      }),
    )
    .max(100),
});

export async function enrichRecordAction(
  raw: unknown,
  csrfToken: string | null = null,
): Promise<ActionResult<RunView>> {
  const csrfOk = await guardCsrf(csrfToken);
  if (!csrfOk.ok) return { ok: false, error: { id: "E_AUTH_CSRF" } };

  const { actor } = await createContext();
  if (actor === null) return { ok: false, error: { id: ERROR_IDS.AUTH_SESSION_DEAD } };

  const parsed = enrichInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: { id: ERROR_IDS.ENRICH_INPUT_INVALID } };

  const result = await runEnrichment(
    db,
    toContactActor(actor),
    parsed.data,
    new Date(),
    AbortSignal.timeout(ENRICH_TIMEOUT_MS),
  );
  return result.ok
    ? { ok: true, value: result.value }
    : { ok: false, error: { id: result.error.id, context: result.error.context } };
}

export async function applyEnrichmentAction(
  raw: unknown,
  csrfToken: string | null = null,
): Promise<ActionResult<Applied>> {
  const csrfOk = await guardCsrf(csrfToken);
  if (!csrfOk.ok) return { ok: false, error: { id: "E_AUTH_CSRF" } };

  const { actor } = await createContext();
  if (actor === null) return { ok: false, error: { id: ERROR_IDS.AUTH_SESSION_DEAD } };

  const parsed = applyInput.safeParse(raw);
  if (!parsed.success) return { ok: false, error: { id: ERROR_IDS.ENRICH_INPUT_INVALID } };

  const result = await applyEnrichment(
    db,
    toContactActor(actor),
    parsed.data,
    new Date(),
    AbortSignal.timeout(ENRICH_TIMEOUT_MS),
  );
  return result.ok
    ? { ok: true, value: result.value }
    : { ok: false, error: { id: result.error.id, context: result.error.context } };
}
