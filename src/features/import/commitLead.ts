// Lead import commit authority (Wave 3 Task 12). Reuses the REAL createLead authority (deal.
// create gate, owner/visibility derivation) rather than duplicating insert logic. Leads have no
// pipeline/stage (they live outside any pipeline) and no natural dedup key, so commit.ts always
// creates (never updates). Leads also have no custom fields (CUSTOM_FIELD_TARGETS has no "lead"
// entry), so the lead's own cells are just title/value/date/source.
//
// A lead row may also describe its organization and a note. Resolving and writing those is
// commit.ts's job (one savepoint for the whole row); this file only takes the resolved orgId.
import { createLead } from "@/features/leads/leadActions";
import { leadCreateInput } from "@/features/leads/schemas";
import { err, ok, type Result } from "@/types/result";
import type { ImportActor, RowError } from "./commitHelpers";
import { type applyCreate, authorityError, issuesOf, toEntityCreateSession } from "./commitHelpers";
import { leadImportRowSchema } from "./importRowSchemas";

// The transaction type applyCreate/findCandidates run inside (a real Tx, never a bare Db).
type Tx = Parameters<typeof applyCreate>[0];

export async function applyCreateLead(
  tx: Tx,
  actor: ImportActor,
  mapped: Record<string, unknown>,
  orgId: string | null,
  signal: AbortSignal,
): Promise<Result<string, RowError[]>> {
  const parsed = leadImportRowSchema.safeParse(mapped);
  if (parsed.success === false) return err(issuesOf(parsed.error));
  const data = parsed.data;

  // Omit the source-channel keys entirely when unmapped: leadCreateInput's enum rejects null-ish
  // strings, and its own defaults are the right fallback. sourceOrigin is set explicitly to
  // "imported" so the leads list reflects the true origin instead of leadCreateInput's
  // "manually_created" default.
  const candidate = {
    title: data.title,
    value: data.value,
    orgId,
    expectedCloseDate: data.expectedCloseDate,
    sourceOrigin: "imported",
    ...(data.sourceChannel !== null ? { sourceChannel: data.sourceChannel } : {}),
    ...(data.sourceChannelId !== null ? { sourceChannelId: data.sourceChannelId } : {}),
  };
  const finalParsed = leadCreateInput.safeParse(candidate);
  if (finalParsed.success === false) return err(issuesOf(finalParsed.error));

  const result = await createLead(tx, toEntityCreateSession(actor), finalParsed.data, signal);
  if (result.ok === false) return err(authorityError(result.error));
  return ok(result.value.id);
}
