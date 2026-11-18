import { sql } from "drizzle-orm";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { PermissionFlagKey } from "@/constants/permissionFlags";
import type { withTestDb } from "@/db/testing";
import { seedPipelineWithStages } from "@/db/testing/factories";
import type { PermSetUser } from "@/features/permissions/effective";

type Db = Parameters<Parameters<typeof withTestDb>[0]>[0];

function firstStageId(stages: { id: string }[]): string {
  const stage = stages[0];
  if (stage === undefined) throw new AppError(ERROR_IDS.DB_INVARIANT, "seed: no stage");
  return stage.id;
}

export const signal = new AbortController().signal;

export function actorFor(id: string): PermSetUser {
  return {
    id,
    type: "regular",
    isActive: true,
    groupIds: new Set<string>(),
    flags: new Set<PermissionFlagKey>(["deal.edit_any", "contact.edit_any", "activity.edit_any"]),
  };
}

export function readerFor(id: string): PermSetUser {
  return {
    id,
    type: "regular",
    isActive: true,
    groupIds: new Set<string>(),
    flags: new Set<PermissionFlagKey>(),
  };
}

export async function seedOwnerDeal(db: Db, ownerId: string): Promise<string> {
  const { pipeline, stages } = await seedPipelineWithStages(db, ["Lead", "Won"]);
  const row = (
    await db.execute(sql`
      INSERT INTO deals (title, pipeline_id, stage_id, owner_id, visibility_level)
      VALUES ('Secret', ${pipeline.id}, ${firstStageId(stages)}, ${ownerId}, 'owner')
      RETURNING id
    `)
  ).rows[0] as { id: string };
  return row.id;
}

export async function seedPublicDeal(db: Db, ownerId: string): Promise<string> {
  const { pipeline, stages } = await seedPipelineWithStages(db, ["Lead"]);
  const row = (
    await db.execute(sql`
      INSERT INTO deals (title, pipeline_id, stage_id, owner_id, visibility_level)
      VALUES ('Public', ${pipeline.id}, ${firstStageId(stages)}, ${ownerId}, 'all')
      RETURNING id
    `)
  ).rows[0] as { id: string };
  return row.id;
}

export async function seedArchivedDeal(db: Db, ownerId: string): Promise<string> {
  const { pipeline, stages } = await seedPipelineWithStages(db, ["Lead"], { isArchived: true });
  const row = (
    await db.execute(sql`
      INSERT INTO deals (title, pipeline_id, stage_id, owner_id, visibility_level)
      VALUES ('Archived', ${pipeline.id}, ${firstStageId(stages)}, ${ownerId}, 'all')
      RETURNING id
    `)
  ).rows[0] as { id: string };
  return row.id;
}
