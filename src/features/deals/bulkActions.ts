// Bulk deal operations. Implements permissions spec §6.5 two-stage visibility:
// 1. Gate the whole operation on bulk.edit once (deny -> err before touching any row).
// 2. Load requested ids THROUGH the visibility predicate (missing == invisible == not_found).
// 3. Authorize each visible survivor with the CANONICAL can(session,'deal.edit',deal),
//    the same authority move/update use, so the deal-edit rule never drifts across actions.
// 4. Return per-row BulkRowResult so one failure never aborts the rest.
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

// A row may also be reported pipeline_mismatch when toStageId belongs to a
// different pipeline than the deal (cross-pipeline move is never applied).
export interface BulkRowResult {
  dealId: string;
  outcome: "applied" | "skipped" | "not_found" | "errored" | "pipeline_mismatch";
}

// Build a parameterized ARRAY[id::uuid, ...] literal for use in ANY().
// Same pattern as sql.ts buildUuidArray; avoids passing a JS array directly
// to Drizzle raw SQL which would bind it as a record, not a uuid[].
function uuidArraySql(ids: string[]) {
  const parts = ids.map((id) => sql`${id}::uuid`);
  return parts.reduce((acc, part) => sql`${acc}, ${part}`);
}

// Derive the visibility-predicate session from the canonical PermSetUser actor
// (mirrors dealRouter.actorToSession). One actor type; the predicate needs the
// array form, can() needs the actor form, so both read from the same source.
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

// Stage-1 row: the deal columns can() needs (via toVisibleDeal) plus its pipeline's
// visibility group, so stage 2 authorizes without re-querying. Columns are aliased to
// camelCase in the SELECT because db.execute returns raw column names otherwise.
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
  // Stage 0: gate the entire operation on bulk.edit once (before touching any row).
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

  // Resolve the target stage's pipeline once; every survivor must belong to it.
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

  // Stage 1: load requested ids THROUGH the visibility predicate. status='open'
  // and deleted_at IS NULL keep closed/deleted deals out of scope (they collapse
  // to the same not_found as missing/invisible). Missing AND invisible -> no row.
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
      // Stage 1 miss: missing / invisible / closed / deleted -> not_found.
      results.push({ dealId, outcome: "not_found" });
      continue;
    }

    // A deal must only move into a stage of its OWN pipeline.
    if (row.pipelineId !== targetStage.pipelineId) {
      results.push({ dealId, outcome: "pipeline_mismatch" });
      continue;
    }

    // Stage 2: authorize the visible survivor with the CANONICAL deal-edit authority
    // (same can() move/update use), so the rule cannot drift across actions.
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
      // Visible but cannot edit -> skipped (§6.5: visible-but-unauthorized may be reported).
      results.push({ dealId, outcome: "skipped" });
      continue;
    }

    // Apply: direct stage update, with defense-in-depth guards in the WHERE so a
    // concurrently soft-deleted or cross-pipeline deal is never mutated.
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
