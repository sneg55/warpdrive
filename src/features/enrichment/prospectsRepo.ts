import { and, asc, count, desc, eq, gt, isNull, max, sql } from "drizzle-orm";
import { PROSPECT_RESUME_WINDOW_MS } from "@/constants/prospectSearch";
import {
  type NewProspectReveal,
  type ProspectRevealRow,
  prospectReveals,
} from "@/db/schema/prospects";
import type { DbOrTx } from "@/server/realtime/channelVersions";

export async function insertReveals(
  db: DbOrTx,
  rows: readonly NewProspectReveal[],
  signal: AbortSignal,
): Promise<void> {
  signal.throwIfAborted();
  if (rows.length === 0) return;
  await db.insert(prospectReveals).values([...rows]);
}

export async function acquireRevealLock(
  tx: DbOrTx,
  batchId: string,
  providerRef: string,
  signal: AbortSignal,
): Promise<void> {
  signal.throwIfAborted();
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtext(${batchId}::text), hashtext(${providerRef}::text))`,
  );
  signal.throwIfAborted();
}

export async function getReservedReveal(
  tx: DbOrTx,
  batchId: string,
  providerRef: string,
  signal: AbortSignal,
): Promise<ProspectRevealRow | null> {
  signal.throwIfAborted();
  const [row] = await tx
    .select()
    .from(prospectReveals)
    .where(and(eq(prospectReveals.batchId, batchId), eq(prospectReveals.providerRef, providerRef)));
  return row ?? null;
}

export async function getOwnUnappliedBatch(
  db: DbOrTx,
  batchId: string,
  orgId: string,
  requestedBy: string,
  signal: AbortSignal,
): Promise<ProspectRevealRow[]> {
  signal.throwIfAborted();
  return await db
    .select()
    .from(prospectReveals)
    .where(
      and(
        eq(prospectReveals.batchId, batchId),
        eq(prospectReveals.orgId, orgId),
        eq(prospectReveals.requestedBy, requestedBy),
        isNull(prospectReveals.appliedAt),
      ),
    )
    .orderBy(asc(prospectReveals.createdAt), asc(prospectReveals.providerRef));
}

export async function getOwnBatch(
  db: DbOrTx,
  batchId: string,
  orgId: string,
  requestedBy: string,
  signal: AbortSignal,
): Promise<ProspectRevealRow[]> {
  signal.throwIfAborted();
  return await db
    .select()
    .from(prospectReveals)
    .where(
      and(
        eq(prospectReveals.batchId, batchId),
        eq(prospectReveals.orgId, orgId),
        eq(prospectReveals.requestedBy, requestedBy),
      ),
    )
    .orderBy(asc(prospectReveals.createdAt), asc(prospectReveals.providerRef));
}

export async function findResumableBatch(
  db: DbOrTx,
  orgId: string,
  requestedBy: string,
  now: Date,
  signal: AbortSignal,
): Promise<{ batchId: string; count: number } | null> {
  signal.throwIfAborted();
  const cutoff = new Date(now.getTime() - PROSPECT_RESUME_WINDOW_MS);
  const [row] = await db
    .select({ batchId: prospectReveals.batchId, pending: count() })
    .from(prospectReveals)
    .where(
      and(
        eq(prospectReveals.orgId, orgId),
        eq(prospectReveals.requestedBy, requestedBy),
        isNull(prospectReveals.appliedAt),
        gt(prospectReveals.createdAt, cutoff),
      ),
    )
    .groupBy(prospectReveals.batchId)
    .orderBy(desc(max(prospectReveals.createdAt)))
    .limit(1);
  return row === undefined ? null : { batchId: row.batchId, count: row.pending };
}

export interface RevealClaim {
  claimed: boolean;
  personId: string | null;
}

export async function claimReveal(
  tx: DbOrTx,
  id: string,
  now: Date,
  signal: AbortSignal,
): Promise<RevealClaim> {
  signal.throwIfAborted();
  const taken = await tx
    .update(prospectReveals)
    .set({ appliedAt: now })
    .where(and(eq(prospectReveals.id, id), isNull(prospectReveals.appliedAt)))
    .returning({ id: prospectReveals.id });
  if (taken.length > 0) return { claimed: true, personId: null };

  const [row] = await tx
    .select({ personId: prospectReveals.personId })
    .from(prospectReveals)
    .where(eq(prospectReveals.id, id));
  return { claimed: false, personId: row?.personId ?? null };
}

export async function markRevealApplied(
  tx: DbOrTx,
  id: string,
  personId: string,
  now: Date,
  signal: AbortSignal,
): Promise<void> {
  signal.throwIfAborted();
  await tx
    .update(prospectReveals)
    .set({ personId, appliedAt: now })
    .where(eq(prospectReveals.id, id));
}
