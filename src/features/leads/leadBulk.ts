import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type * as schema from "@/db/schema";
import { users } from "@/db/schema";
import { leads } from "@/db/schema/leads";
import { syncEntityLabelNames } from "@/features/labels/labelsRepo.entities";
import { mayTransferOwner, toTransferActor } from "@/features/permissions/mayTransferOwner";
import { err, ok, type Result } from "@/types/result";
import type { LeadSession } from "./leadActions";
import { type BulkUpdateLeadsInput, bulkUpdateLeadsInput } from "./schemas";
import { leadVisibilityClause } from "./visibility";

type Db = NodePgDatabase<typeof schema>;

function buildSet(change: BulkUpdateLeadsInput["change"]): Record<string, unknown> {
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (change.ownerId !== undefined) set.ownerId = change.ownerId;
  if (change.labels !== undefined) set.labels = change.labels;
  if (change.archived !== undefined) {
    set.archivedAt = change.archived ? sql`coalesce(${leads.archivedAt}, now())` : null;
  }
  if (change.deleted !== undefined) set.deletedAt = change.deleted ? sql`now()` : null;
  return set;
}

// bulkUpdateLeads: apply one field-change set across many lead ids, each gated by
// leadVisibilityClause. Ids the actor cannot see are silently skipped and counted (batch semantics,
// per the Result-types rule: one invisible id must not abandon the rest). Returns {updated, skipped}.
export async function bulkUpdateLeads(
  db: Db,
  session: LeadSession,
  raw: BulkUpdateLeadsInput,
  signal: AbortSignal,
): Promise<Result<{ updated: number; skipped: number }, AppError>> {
  const input = bulkUpdateLeadsInput.parse(raw);
  signal.throwIfAborted();

  const transferActor = toTransferActor(session);
  const ownerScopedToSelf =
    input.change.ownerId !== undefined && !mayTransferOwner(transferActor, null);
  if (input.change.ownerId !== undefined) {
    if (!mayTransferOwner(transferActor, session.userId)) {
      return err(
        new AppError(ERROR_IDS.PERM_DENIED, "bulk owner change requires deal.changeOwner", {}),
      );
    }
    const [target] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.id, input.change.ownerId), eq(users.isActive, true)));
    signal.throwIfAborted();
    if (target === undefined) {
      return err(
        new AppError(ERROR_IDS.USER_NOT_FOUND, "target owner not found or inactive", {
          ownerId: input.change.ownerId,
        }),
      );
    }
  }

  const uniqueIds = [...new Set(input.ids)];
  const includeDeleted = input.change.deleted === false;
  const predicates = [inArray(leads.id, uniqueIds), leadVisibilityClause(session)];
  if (!includeDeleted) predicates.push(isNull(leads.deletedAt));
  if (ownerScopedToSelf) predicates.push(eq(leads.ownerId, session.userId));

  const updatedRows = await db
    .update(leads)
    .set(buildSet(input.change))
    .where(and(...predicates))
    .returning({ id: leads.id });
  signal.throwIfAborted();
  const updatedIds = updatedRows.map((r) => r.id);

  const bulkLabels = input.change.labels;
  if (bulkLabels !== undefined) {
    for (const id of updatedIds) {
      await syncEntityLabelNames(db, "lead", id, bulkLabels, signal);
    }
  }

  return ok({ updated: updatedIds.length, skipped: uniqueIds.length - updatedIds.length });
}
