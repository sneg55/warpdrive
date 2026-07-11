// Deal import commit authority (Wave 3 Task 12). Reuses the REAL createDeal authority (deal.
// create gate, pipeline-visibility gate, board position, event publish) rather than duplicating
// insert logic; this file only resolves the CSV's raw pipeline/stage NAMES to real ids (or the
// org default pipeline / that pipeline's first stage when the columns were left unmapped) before
// handing off. Deals have no natural dedup key, so commit.ts always creates (never updates).
import { and, asc, eq, sql } from "drizzle-orm";
import { pipelines, stages } from "@/db/schema";
import { settings } from "@/db/schema/system";
import { createDeal } from "@/features/deals/dealActions";
import { dealCreateInput } from "@/features/deals/schemas";
import type { DbOrTx } from "@/server/realtime/channelVersions";
import { err, ok, type Result } from "@/types/result";
import type { ImportActor, RowError } from "./commitHelpers";
import { authorityError, issuesOf, toEntityCreateSession } from "./commitHelpers";
import { dealImportRowSchema } from "./importRowSchemas";

// Resolve a pipeline NAME to an id (case-insensitive, non-archived), or the org default
// pipeline when the CSV left the column unmapped, or the first non-archived pipeline (by
// display order) when no org default is configured. Absent any pipeline at all, the row fails
// (there is nowhere to import the deal into).
async function resolvePipelineId(
  tx: DbOrTx,
  pipelineName: string | null,
  signal: AbortSignal,
): Promise<Result<string, RowError[]>> {
  signal.throwIfAborted();
  if (pipelineName !== null) {
    const [pipe] = await tx
      .select({ id: pipelines.id })
      .from(pipelines)
      .where(
        sql`lower(${pipelines.name}) = lower(${pipelineName}) and ${pipelines.isArchived} = false`,
      );
    if (pipe === undefined) {
      return err([{ field: "pipeline", message: `unknown pipeline: ${pipelineName}` }]);
    }
    return ok(pipe.id);
  }

  const [cfg] = await tx
    .select({ defaultPipelineId: settings.defaultPipelineId })
    .from(settings)
    .where(eq(settings.id, true));
  if (cfg?.defaultPipelineId != null) return ok(cfg.defaultPipelineId);

  const [first] = await tx
    .select({ id: pipelines.id })
    .from(pipelines)
    .where(eq(pipelines.isArchived, false))
    .orderBy(asc(pipelines.order))
    .limit(1);
  if (first === undefined) {
    return err([{ field: "pipeline", message: "no pipeline available to import into" }]);
  }
  return ok(first.id);
}

// Resolve a stage NAME (scoped to the resolved pipeline) to an id, or that pipeline's first
// stage (lowest order) when the CSV left the column unmapped.
async function resolveStageId(
  tx: DbOrTx,
  pipelineId: string,
  stageName: string | null,
  signal: AbortSignal,
): Promise<Result<string, RowError[]>> {
  signal.throwIfAborted();
  if (stageName !== null) {
    const [stage] = await tx
      .select({ id: stages.id })
      .from(stages)
      .where(
        and(eq(stages.pipelineId, pipelineId), sql`lower(${stages.name}) = lower(${stageName})`),
      );
    if (stage === undefined) {
      return err([{ field: "stage", message: `unknown stage: ${stageName}` }]);
    }
    return ok(stage.id);
  }

  const [first] = await tx
    .select({ id: stages.id })
    .from(stages)
    .where(eq(stages.pipelineId, pipelineId))
    .orderBy(asc(stages.order))
    .limit(1);
  if (first === undefined) {
    return err([{ field: "stage", message: "pipeline has no stages" }]);
  }
  return ok(first.id);
}

// CREATE path: parse the mapped CSV row, resolve pipeline/stage names to ids, then reuse the
// audited createDeal authority so imported deals get identical treatment to API-created ones
// (deal.create gate, owner = actor, visibility from settings). err arm -> commitRow finalizes
// "invalid" without aborting the rest of the batch.
//
// A deal row may also describe its organization and contact person. Resolving those is commit.ts's
// job (one savepoint for the whole row); this file only takes the already-resolved ids.
export async function applyCreateDeal(
  tx: DbOrTx,
  actor: ImportActor,
  mapped: Record<string, unknown>,
  links: { orgId: string | null; personId: string | null },
  signal: AbortSignal,
): Promise<Result<string, RowError[]>> {
  const parsed = dealImportRowSchema.safeParse(mapped);
  if (parsed.success === false) return err(issuesOf(parsed.error));

  const pipelineResult = await resolvePipelineId(tx, parsed.data.pipeline, signal);
  if (pipelineResult.ok === false) return pipelineResult;
  const stageResult = await resolveStageId(tx, pipelineResult.value, parsed.data.stage, signal);
  if (stageResult.ok === false) return stageResult;

  const candidate = {
    title: parsed.data.title,
    value: parsed.data.value,
    expectedCloseDate: parsed.data.expectedCloseDate,
    pipelineId: pipelineResult.value,
    stageId: stageResult.value,
    orgId: links.orgId,
    personId: links.personId,
  };
  const finalParsed = dealCreateInput.safeParse(candidate);
  if (finalParsed.success === false) return err(issuesOf(finalParsed.error));

  const result = await createDeal(tx, toEntityCreateSession(actor), finalParsed.data, signal);
  if (result.ok === false) return err(authorityError(result.error));
  return ok(result.value.id);
}
