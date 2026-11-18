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
