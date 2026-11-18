import { and, desc, eq, gt } from "drizzle-orm";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import { type EnrichmentRunRow, enrichmentRuns } from "@/db/schema/enrichment";
import type { EnrichEntity } from "./canonical";
import type { ProviderOutcome } from "./providers/types";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

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
