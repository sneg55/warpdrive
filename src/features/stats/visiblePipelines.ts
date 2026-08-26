// Which pipelines an actor may see, and the gate for one named pipeline.
// Reproduces pipelineRouter.listVisiblePipelines exactly: archived pipelines are never
// visible, an admin sees the rest, and everyone else sees only unrestricted pipelines plus
// those in a visibility group they belong to.
//
// Both the single-pipeline view and the "All pipelines" aggregate run through here. Stage
// names are pipeline metadata, so a path that skipped this gate would leak the stage names of
// a restricted pipeline even while its deals stayed hidden.
import { and, eq, inArray, isNull, or, type SQL, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { pipelines } from "@/db/schema";
import type { PermSetUser } from "@/features/permissions/effective";

function predicate(actor: PermSetUser): SQL | undefined {
  if (actor.type === "admin") return sql`true`;
  const groupIds = Array.from(actor.groupIds);
  return or(
    isNull(pipelines.visibilityGroupId),
    groupIds.length > 0 ? inArray(pipelines.visibilityGroupId, groupIds) : sql`false`,
  );
}

// id + name, for pickers. Same gate: a restricted pipeline's NAME is protected metadata, so
// an options list built from a raw select leaks it to anyone who can open the picker.
export async function visiblePipelineOptions(
  db: Db,
  actor: PermSetUser,
  signal: AbortSignal,
): Promise<{ id: string; name: string }[]> {
  signal.throwIfAborted();
  return db
    .select({ id: pipelines.id, name: pipelines.name })
    .from(pipelines)
    .where(and(eq(pipelines.isArchived, false), predicate(actor)))
    .orderBy(pipelines.order);
}

export async function visiblePipelineIds(
  db: Db,
  actor: PermSetUser,
  signal: AbortSignal,
): Promise<string[]> {
  signal.throwIfAborted();
  const rows = await db
    .select({ id: pipelines.id })
    .from(pipelines)
    .where(and(eq(pipelines.isArchived, false), predicate(actor)))
    .orderBy(pipelines.order);
  return rows.map((r) => r.id);
}

export async function isPipelineVisible(
  db: Db,
  actor: PermSetUser,
  pipelineId: string,
  signal: AbortSignal,
): Promise<boolean> {
  signal.throwIfAborted();
  const [row] = await db
    .select({ id: pipelines.id })
    .from(pipelines)
    .where(and(eq(pipelines.id, pipelineId), eq(pipelines.isArchived, false), predicate(actor)));
  return row !== undefined;
}
