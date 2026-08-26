// Enrichment run persistence. A run is both the cache that stops a repeat click spending credits
// and the audit trail of what each provider actually said.
import { and, desc, eq, gt } from "drizzle-orm";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import { type EnrichmentRunRow, enrichmentRuns } from "@/db/schema/enrichment";
import type { EnrichEntity } from "./canonical";
import type { ProviderOutcome } from "./providers/types";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// `fingerprint` is the record's identity right now. A run researched for a former email, company
// or domain answers a different question, so it is a miss even inside the TTL: the equality drops
// the NULL fingerprints of rows written before the column existed, which is the same verdict.
export async function findCachedRun(
  db: Db,
  entityType: EnrichEntity,
  entityId: string,
  fingerprint: string,
  ttlDays: number,
  now: Date,
  signal: AbortSignal,
): Promise<EnrichmentRunRow | null> {
  signal.throwIfAborted();
  // A TTL of zero disables the cache, which is the honest reading of "never reuse".
  if (ttlDays <= 0) return null;
  const cutoff = new Date(now.getTime() - ttlDays * MS_PER_DAY);
  const [row] = await db
    .select()
    .from(enrichmentRuns)
    .where(
      and(
        eq(enrichmentRuns.entityType, entityType),
        eq(enrichmentRuns.entityId, entityId),
        eq(enrichmentRuns.lookupFingerprint, fingerprint),
        gt(enrichmentRuns.createdAt, cutoff),
      ),
    )
    .orderBy(desc(enrichmentRuns.createdAt))
    .limit(1);
  return row ?? null;
}

export async function insertRun(
  db: Db,
  input: {
    entityType: EnrichEntity;
    entityId: string;
    requestedBy: string;
    outcomes: ProviderOutcome[];
    lookupFingerprint: string;
  },
  signal: AbortSignal,
): Promise<EnrichmentRunRow> {
  signal.throwIfAborted();
  const [row] = await db.insert(enrichmentRuns).values(input).returning();
  if (row === undefined) {
    throw new AppError(ERROR_IDS.DB_INSERT_FAILED, "enrichment run insert returned no rows", {
      entityType: input.entityType,
    });
  }
  return row;
}

export async function getRun(
  db: Db,
  runId: string,
  signal: AbortSignal,
): Promise<EnrichmentRunRow | null> {
  signal.throwIfAborted();
  const [row] = await db.select().from(enrichmentRuns).where(eq(enrichmentRuns.id, runId));
  return row ?? null;
}

// Merged, not replaced. A cached run can be applied in more than one pass, and overwriting would
// leave the audit naming only the last batch while the earlier writes stayed committed.
export async function markApplied(
  db: Db,
  runId: string,
  appliedFields: string[],
  now: Date,
  signal: AbortSignal,
): Promise<void> {
  signal.throwIfAborted();
  const [existing] = await db
    .select({ appliedFields: enrichmentRuns.appliedFields })
    .from(enrichmentRuns)
    .where(eq(enrichmentRuns.id, runId))
    .for("update");
  const merged = [...new Set([...(existing?.appliedFields ?? []), ...appliedFields])];
  await db
    .update(enrichmentRuns)
    .set({ appliedFields: merged, appliedAt: now })
    .where(eq(enrichmentRuns.id, runId));
}
