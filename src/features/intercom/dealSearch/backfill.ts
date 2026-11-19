import { sql } from "drizzle-orm";
import { INTERCOM_DEAL_SEARCH_BACKFILL_PAGE } from "@/constants/intercom";
import type { Db } from "@/db/client";
import { intercomSearchBackfill } from "@/db/schema";
import { refreshDealIntercomSearch } from "./refresh";

async function readState(db: Db, signal: AbortSignal) {
  signal.throwIfAborted();
  const [row] = await db.select().from(intercomSearchBackfill);
  return row ?? null;
}

export async function advanceCheckpoint(
  db: Db,
  cursorDealId: string,
  signal: AbortSignal,
): Promise<void> {
  signal.throwIfAborted();
  await db
    .insert(intercomSearchBackfill)
    .values({ cursorDealId, completedAt: null })
    .onConflictDoUpdate({
      target: intercomSearchBackfill.id,
      set: { cursorDealId },
      setWhere: sql`${intercomSearchBackfill.completedAt} IS NULL
        AND (${intercomSearchBackfill.cursorDealId} IS NULL
          OR ${intercomSearchBackfill.cursorDealId} < excluded.cursor_deal_id)`,
    });
}

export async function completeCheckpoint(
  db: Db,
  cursorDealId: string | null,
  signal: AbortSignal,
): Promise<void> {
  signal.throwIfAborted();
  await db
    .insert(intercomSearchBackfill)
    .values({ cursorDealId, completedAt: new Date() })
    .onConflictDoUpdate({
      target: intercomSearchBackfill.id,
      set: {
        cursorDealId: sql`greatest(${intercomSearchBackfill.cursorDealId}, excluded.cursor_deal_id)`,
        completedAt: sql`coalesce(${intercomSearchBackfill.completedAt}, excluded.completed_at)`,
      },
    });
}

async function nextDealIds(
  db: Db,
  after: string | null,
  pageSize: number,
  signal: AbortSignal,
): Promise<string[]> {
  signal.throwIfAborted();
  const rows = (
    await db.execute(sql`
      SELECT id FROM deals
      WHERE deleted_at IS NULL AND (${after}::uuid IS NULL OR id > ${after}::uuid)
      ORDER BY id LIMIT ${pageSize}`)
  ).rows as Array<{ id: string }>;
  return rows.map((r) => r.id);
}

export async function runDealSearchBackfill(
  db: Db,
  signal: AbortSignal,
  pageSize: number = INTERCOM_DEAL_SEARCH_BACKFILL_PAGE,
  afterPage: () => void = () => undefined,
): Promise<void> {
  const state = await readState(db, signal);
  let after = state !== null && state.completedAt === null ? state.cursorDealId : null;
  for (;;) {
    const ids = await nextDealIds(db, after, pageSize, signal);
    if (ids.length === 0) break;
    await refreshDealIntercomSearch(db, ids, signal);
    const last = ids[ids.length - 1];
    if (last === undefined) break;
    after = last;
    await advanceCheckpoint(db, last, signal);
    afterPage();
  }
  await completeCheckpoint(db, after, signal);
}

export async function dealSearchBackfillNeeded(db: Db, signal: AbortSignal): Promise<boolean> {
  const state = await readState(db, signal);
  return state === null || state.completedAt === null;
}
