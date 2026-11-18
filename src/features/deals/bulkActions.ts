import { and, eq, isNull, sql } from "drizzle-orm";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import { deals } from "@/db/schema/deals";
import { stages } from "@/db/schema/stages";
import { can } from "@/features/permissions/can";
import type { PermSetUser } from "@/features/permissions/effective";
import type { DbOrTx } from "@/server/realtime/channelVersions";
import { err, ok, type Result } from "@/types/result";
import type { DealVisibilitySession } from "@/types/session";
import { toVisibleDeal } from "./dealAuth";
import type { BulkStageInput } from "./schemas";
import { dealVisibilityClause } from "./visibility";

export interface BulkRowResult {
  dealId: string;
  outcome: "applied" | "skipped" | "not_found" | "errored" | "pipeline_mismatch";
}

function uuidArraySql(ids: string[]) {
  const parts = ids.map((id) => sql`${id}::uuid`);
  return parts.reduce((acc, part) => sql`${acc}, ${part}`);
}

function toVisibilitySession(session: PermSetUser): DealVisibilitySession {
  return {
    userId: session.id,
    isAdmin: session.type === "admin",
    isActive: session.isActive,
    sessionLive: true,
    visibilityGroupIds: Array.from(session.groupIds),
    managedUserIds: Array.from(session.managedUserIds ?? []),
  };
}

interface Stage1Row {
  id: string;
  pipelineId: string;
  ownerId: string;
  visibilityLevel: "owner" | "group" | "all";
  visibilityGroupId: string | null;
  visibleToUserIds: string[];
  pipelineVisibilityGroupId: string | null;
}

export async function bulkUpdateStage(
  db: DbOrTx,
  session: PermSetUser,
  input: BulkStageInput,
  signal: AbortSignal,
): Promise<Result<BulkRowResult[], AppError>> {
  if (session.type !== "admin" && !session.flags.has("bulk.edit")) {
    return err(
      new AppError(ERROR_IDS.PERM_DENIED, "bulk.edit capability required", {
        userId: session.id,
      }),
    );
  }
  signal.throwIfAborted();

  if (input.dealIds.length === 0) {
    return ok([]);
  }

  const [targetStage] = await db
    .select({ id: stages.id, pipelineId: stages.pipelineId })
    .from(stages)
    .where(eq(stages.id, input.toStageId));
  if (targetStage === undefined) {
    return err(
      new AppError(ERROR_IDS.DEAL_STAGE_MISMATCH, "Target stage not found", {
        toStageId: input.toStageId,
      }),
    );
  }
  signal.throwIfAborted();

  const idArraySql = uuidArraySql(input.dealIds);
  const visClause = dealVisibilityClause(toVisibilitySession(session));
  const visRes = await db.execute(sql`
    SELECT
      d.id,
      d.pipeline_id          AS "pipelineId",
      d.owner_id             AS "ownerId",
      d.visibility_level     AS "visibilityLevel",
      d.visibility_group_id  AS "visibilityGroupId",
      d.visible_to_user_ids  AS "visibleToUserIds",
      p.visibility_group_id  AS "pipelineVisibilityGroupId"
    FROM deals d
    JOIN pipelines p ON p.id = d.pipeline_id
    WHERE d.id = ANY(ARRAY[${idArraySql}])
      AND d.status = 'open'
      AND d.deleted_at IS NULL
      AND p.is_archived = false
      AND ${visClause}
  `);
  signal.throwIfAborted();

  const visibleRows = (visRes as unknown as { rows: Stage1Row[] }).rows;
  const visibleMap = new Map(visibleRows.map((r) => [r.id, r]));

  const results: BulkRowResult[] = [];

  for (const dealId of input.dealIds) {
    const row = visibleMap.get(dealId);
    if (row === undefined) {
      results.push({ dealId, outcome: "not_found" });
      continue;
    }

    if (row.pipelineId !== targetStage.pipelineId) {
      results.push({ dealId, outcome: "pipeline_mismatch" });
      continue;
    }

    const visibleDeal = toVisibleDeal(
      {
        ownerId: row.ownerId,
        visibilityLevel: row.visibilityLevel,
        visibilityGroupId: row.visibilityGroupId,
        visibleToUserIds: row.visibleToUserIds,
      },
      row.pipelineVisibilityGroupId,
    );
    if (!can(session, "deal.edit", visibleDeal)) {
      results.push({ dealId, outcome: "skipped" });
      continue;
    }

    try {
      const updated = await db
        .update(deals)
        .set({ stageId: input.toStageId, stageEnteredAt: new Date(), updatedAt: new Date() })
        .where(
          and(
            eq(deals.id, dealId),
            isNull(deals.deletedAt),
            eq(deals.pipelineId, targetStage.pipelineId),
          ),
        )
        .returning({ id: deals.id });

      results.push({ dealId, outcome: updated.length === 0 ? "errored" : "applied" });
    } catch {
      results.push({ dealId, outcome: "errored" });
    }

    signal.throwIfAborted();
  }

  return ok(results);
}
