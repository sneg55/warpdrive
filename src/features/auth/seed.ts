import { eq, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import {
  buildDefaultStageValues,
  DEFAULT_LABELS,
  DEFAULT_PIPELINE,
} from "@/constants/defaultCatalog";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { LabelTarget } from "@/constants/labelColors";
import { ADMIN_DEFAULT_FLAGS, REGULAR_DEFAULT_FLAGS } from "@/constants/permissionFlags";
import type * as schema from "@/db/schema";
import { labels, permissionSets, pipelines, settings, stages, visibilityGroups } from "@/db/schema";

// Transaction alias: the Drizzle tx passed from db.transaction().
type Tx = Parameters<Parameters<NodePgDatabase<typeof schema>["transaction"]>[0]>[0];

export interface SeedHandles {
  everyoneGroupId: string;
  regularSetId: string;
  adminSetId: string;
}

// Idempotent: ensures the settings singleton, default permission sets, and the "Everyone"
// visibility group. Called only on the bootstrap branch (bootstrappedAt IS NULL) so
// duplicate rows cannot arise from concurrent calls after bootstrap closes.
export async function ensureSeedData(tx: Tx, signal: AbortSignal): Promise<SeedHandles> {
  signal.throwIfAborted();

  // Settings singleton: id is fixed boolean true; ON CONFLICT no-op if already present.
  await tx.insert(settings).values({ baseCurrency: "USD" }).onConflictDoNothing();

  // Use onConflictDoNothing + SQL re-read so this function is safe even if seed rows
  // already exist (e.g. two new-user logins arrive before bootstrap closes).
  await tx
    .insert(permissionSets)
    .values({ name: "Regular", flags: REGULAR_DEFAULT_FLAGS, isDefault: true })
    .onConflictDoNothing();

  await tx
    .insert(permissionSets)
    .values({ name: "Admin", flags: ADMIN_DEFAULT_FLAGS, isDefault: false })
    .onConflictDoNothing();

  await tx.insert(visibilityGroups).values({ name: "Everyone" }).onConflictDoNothing();

  signal.throwIfAborted();

  await seedDefaultCatalog(tx, signal);

  signal.throwIfAborted();

  // Re-read IDs by name after upsert (works whether rows were just inserted or already existed).
  return readSeedHandles(tx, signal);
}

// Seeds the default pipeline (+ stages, +settings.default_pipeline_id) and the default label
// sets for all four targets. Each is count-guarded (skip if any row already exists) because
// neither pipelines nor labels has a unique key to lean on for onConflictDoNothing.
async function seedDefaultCatalog(tx: Tx, signal: AbortSignal): Promise<void> {
  const existingPipeline = await tx.select({ id: pipelines.id }).from(pipelines).limit(1);
  if (existingPipeline[0] === undefined) {
    const [pipeline] = await tx
      .insert(pipelines)
      .values({ name: DEFAULT_PIPELINE.name })
      .returning();
    if (pipeline === undefined) {
      throw new AppError(
        ERROR_IDS.DB_INSERT_FAILED,
        "seed: default pipeline insert returned no rows",
      );
    }
    await tx.insert(stages).values(buildDefaultStageValues(pipeline.id));
    await tx.update(settings).set({ defaultPipelineId: pipeline.id }).where(eq(settings.id, true));
  }

  signal.throwIfAborted();

  const existingLabel = await tx.select({ id: labels.id }).from(labels).limit(1);
  if (existingLabel[0] === undefined) {
    const rows = (
      Object.entries(DEFAULT_LABELS) as [LabelTarget, (typeof DEFAULT_LABELS)[LabelTarget]][]
    ).flatMap(([target, defs]) =>
      defs.map(([name, color], order) => ({ target, name, color, order })),
    );
    await tx.insert(labels).values(rows);
  }
}

// Re-read existing seed row IDs when bootstrap is already closed (ensureSeedData not called).
export async function readSeedHandles(tx: Tx, signal: AbortSignal): Promise<SeedHandles> {
  signal.throwIfAborted();

  const regularRow = await tx.execute(
    sql`SELECT id FROM permission_sets WHERE name = 'Regular' AND is_default = true LIMIT 1`,
  );
  const adminRow = await tx.execute(
    sql`SELECT id FROM permission_sets WHERE name = 'Admin' AND is_default = false LIMIT 1`,
  );
  const everyoneRow = await tx.execute(
    sql`SELECT id FROM visibility_groups WHERE name = 'Everyone' LIMIT 1`,
  );

  const regular = regularRow.rows[0] as { id: string } | undefined;
  const admin = adminRow.rows[0] as { id: string } | undefined;
  const everyone = everyoneRow.rows[0] as { id: string } | undefined;

  if (regular === undefined || admin === undefined || everyone === undefined) {
    throw new AppError(
      ERROR_IDS.DB_INVARIANT,
      "seed read failed: missing seed rows after bootstrap closed",
    );
  }

  return {
    everyoneGroupId: everyone.id,
    regularSetId: regular.id,
    adminSetId: admin.id,
  };
}
