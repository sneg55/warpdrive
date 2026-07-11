import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type * as schema from "@/db/schema";
import { users } from "@/db/schema";
import { leads } from "@/db/schema/leads";
import { err, ok, type Result } from "@/types/result";
import type { LeadSession } from "./leadActions";
import { type BulkUpdateLeadsInput, bulkUpdateLeadsInput } from "./schemas";
import { leadVisibilityClause } from "./visibility";

type Db = NodePgDatabase<typeof schema>;

// Build the UPDATE ... SET payload from one bulk change. Multiple fields may be set together; each
// maps to the same column semantics as the single-lead actions (archive/delete toggle a timestamp).
function buildSet(change: BulkUpdateLeadsInput["change"]): Record<string, unknown> {
  const set: Record<string, unknown> = { updatedAt: new Date() };
  if (change.ownerId !== undefined) set.ownerId = change.ownerId;
  if (change.labels !== undefined) set.labels = change.labels;
  if (change.archived !== undefined) set.archivedAt = change.archived ? sql`now()` : null;
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

  // Owner reassignment is permission-gated (mirrors resolveOwnerId on create and the deal
  // changeOwner action): only admins or holders of deal.changeOwner may reassign, and the target
  // must be an active user. Visibility alone is NOT sufficient for owner change.
  if (input.change.ownerId !== undefined) {
    const canReassign = session.isAdmin || session.flags["deal.changeOwner"] === true;
    if (!canReassign) {
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
  // Restore (deleted:false) targets soft-deleted rows; every other change targets live rows.
  const includeDeleted = input.change.deleted === false;
  const gate = includeDeleted
    ? and(inArray(leads.id, uniqueIds), leadVisibilityClause(session))
    : and(inArray(leads.id, uniqueIds), isNull(leads.deletedAt), leadVisibilityClause(session));

  const visible = await db.select({ id: leads.id }).from(leads).where(gate);
  signal.throwIfAborted();
  const visibleIds = visible.map((r) => r.id);

  if (visibleIds.length > 0) {
    await db.update(leads).set(buildSet(input.change)).where(inArray(leads.id, visibleIds));
    signal.throwIfAborted();
  }

  return ok({ updated: visibleIds.length, skipped: uniqueIds.length - visibleIds.length });
}
