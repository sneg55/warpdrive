"use server";

import { z } from "zod";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import { PROSPECT_REVEAL_CHUNK, PROSPECT_SELECTION_MAX } from "@/constants/prospectSearch";
import { db } from "@/db/client";
import { toContactActor } from "@/features/contacts/actorAdapters";
import { guardCsrf } from "@/features/identity/actions/shared";
import { createContext } from "@/server/trpc/context";
import { type ActionResult, clientErr, toClientResult } from "@/types/actionResult";
import { ENRICHMENT_PROVIDER_IDS } from "./providers/types";
import { type RevealBatch, revealProspects } from "./revealService";

const REVEAL_TIMEOUT_MS = 25_000;
const PROFILE_TEXT_MAX = 200;
const CHUNK_MAX = Math.min(PROSPECT_REVEAL_CHUNK, PROSPECT_SELECTION_MAX);

const text = z.string().trim().min(1).max(PROFILE_TEXT_MAX);

const profileSchema = z.object({
  providerRef: text,
  fullName: text,
  firstName: text.optional(),
  lastName: text.optional(),
  title: text.optional(),
  seniority: text.optional(),
  department: text.optional(),
  linkedinUrl: text.optional(),
  city: text.optional(),
  country: text.optional(),
  hasEmail: z.boolean(),
  hasPhone: z.boolean(),
});

const revealInput = z.object({
  orgId: z.string().uuid(),
  batchId: z.string().uuid(),
  searchProvider: z.enum(ENRICHMENT_PROVIDER_IDS),
  profiles: z.array(profileSchema).min(1).max(CHUNK_MAX),
});

export async function revealProspectsAction(
  raw: unknown,
  csrfToken: string | null = null,
): Promise<ActionResult<RevealBatch>> {
  const csrf = await guardCsrf(csrfToken);
  if (!csrf.ok) return { ok: false, error: { id: "E_AUTH_CSRF" } };

  const { actor } = await createContext();
  if (actor === null) {
    return clientErr(new AppError(ERROR_IDS.AUTH_SESSION_DEAD, "no session", {}));
  }

  const parsed = revealInput.safeParse(raw);
  if (!parsed.success) {
    return clientErr(new AppError(ERROR_IDS.ENRICH_INPUT_INVALID, "invalid reveal input", {}));
  }

  return toClientResult(
    await revealProspects(
      db,
      toContactActor(actor),
      parsed.data,
      new Date(),
      AbortSignal.timeout(REVEAL_TIMEOUT_MS),
    ),
  );
}
