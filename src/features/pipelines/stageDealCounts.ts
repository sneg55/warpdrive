import { eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type * as schema from "@/db/schema";
import { deals } from "@/db/schema/deals";

type Db = NodePgDatabase<typeof schema>;

export interface StageDealCount {
  total: number;
  closed: number;
}

export type StageDealCounts = Record<string, StageDealCount>;

export async function countDealsByStage(
  db: Db,
  pipelineId: string,
  signal: AbortSignal,
): Promise<StageDealCounts> {
  signal.throwIfAborted();
  const rows = await db
    .select({
      stageId: deals.stageId,
      total: sql<number>`count(*)::int`,
      closed: sql<number>`count(*) filter (where ${deals.status} <> 'open')::int`,
    })
    .from(deals)
    .where(eq(deals.pipelineId, pipelineId))
    .groupBy(deals.stageId);
  const counts: StageDealCounts = {};
  for (const r of rows) counts[r.stageId] = { total: r.total, closed: r.closed };
  return counts;
}
