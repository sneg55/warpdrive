import { and, asc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type * as schema from "@/db/schema";
import { pipelines } from "@/db/schema/pipelines";
import { stages } from "@/db/schema/stages";
import { protectedProcedure, router } from "@/server/trpc/trpc";
import { canManagePipelines } from "./canManagePipelines";
import { countDealsByStage, type StageDealCounts } from "./stageDealCounts";

type Db = NodePgDatabase<typeof schema>;

interface ListSession {
  isAdmin: boolean;
  visibilityGroupIds: string[];
}

export async function listVisiblePipelines(db: Db, session: ListSession, signal: AbortSignal) {
  signal.throwIfAborted();
  const groups = session.visibilityGroupIds;
  const restriction = session.isAdmin
    ? sql`true`
    : or(
        isNull(pipelines.visibilityGroupId),
        groups.length > 0 ? inArray(pipelines.visibilityGroupId, groups) : sql`false`,
      );
  const pipeRows = await db
    .select()
    .from(pipelines)
    .where(and(eq(pipelines.isArchived, false), restriction))
    .orderBy(asc(pipelines.order));
  signal.throwIfAborted();
  if (pipeRows.length === 0) return [];
  const stageRows = await db
    .select()
    .from(stages)
    .where(
      inArray(
        stages.pipelineId,
        pipeRows.map((p) => p.id),
      ),
    )
    .orderBy(asc(stages.order));
  return pipeRows.map((p) => ({
    ...p,
    stages: stageRows.filter((st) => st.pipelineId === p.id),
  }));
}

export interface CountsSession extends ListSession {
  canManage: boolean;
}

export async function countDealsByStageForSession(
  db: Db,
  session: CountsSession,
  pipelineId: string,
  signal: AbortSignal,
): Promise<StageDealCounts> {
  if (!session.canManage) return {};
  const visible = await listVisiblePipelines(db, session, signal);
  if (!visible.some((p) => p.id === pipelineId)) return {};
  return countDealsByStage(db, pipelineId, signal);
}

function actorToListSession(actor: { type: string; groupIds: ReadonlySet<string> }): ListSession {
  return {
    isAdmin: actor.type === "admin",
    visibilityGroupIds: Array.from(actor.groupIds),
  };
}

export const pipelineRouter = router({
  list: protectedProcedure.query(({ ctx }) =>
    listVisiblePipelines(ctx.db, actorToListSession(ctx.actor), AbortSignal.timeout(5000)),
  ),
  byId: protectedProcedure
    .input(String)
    .query(({ ctx, input }) =>
      listVisiblePipelines(ctx.db, actorToListSession(ctx.actor), AbortSignal.timeout(5000)).then(
        (list) => list.find((p) => p.id === input) ?? null,
      ),
    ),
  stageDealCounts: protectedProcedure
    .input(String)
    .query(({ ctx, input }) =>
      countDealsByStageForSession(
        ctx.db,
        { ...actorToListSession(ctx.actor), canManage: canManagePipelines(ctx.actor) },
        input,
        AbortSignal.timeout(5000),
      ),
    ),
});
