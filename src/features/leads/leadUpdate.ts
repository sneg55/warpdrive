// leadUpdate.ts: compare-and-swap field update (Value / Owner / Expected close) for the lead
// sidebar's inline-edit panel. Mirrors updateDeal's single-UPDATE-WHERE CAS; owner reassignment is
// gated a second time by deal.changeOwner (mirrors bulkUpdateLeads), same as every other
// owner-touching write in this feature.
import { and, eq, isNull, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type * as schema from "@/db/schema";
import { users } from "@/db/schema/identity";
import { leads } from "@/db/schema/leads";
import { err, ok, type Result } from "@/types/result";
import type { LeadSession } from "./leadActions";
import { type LeadUpdateInput, leadUpdateInput } from "./schemas";
import { leadVisibilityClause } from "./visibility";

type Db = NodePgDatabase<typeof schema>;
type LeadPatch = Partial<typeof leads.$inferInsert>;

function buildPatch(input: LeadUpdateInput, now: Date): LeadPatch {
  const patch: LeadPatch = { updatedAt: now };
  if (input.value !== undefined) {
    patch.value = input.value === null ? null : input.value.toFixed(2);
  }
  if (input.ownerId !== undefined) patch.ownerId = input.ownerId;
  if (input.expectedCloseDate !== undefined) patch.expectedCloseDate = input.expectedCloseDate;
  return patch;
}

// Owner reassignment is permission-gated (mirrors bulkUpdateLeads/resolveOwnerId): only admins or
// holders of deal.changeOwner may reassign, and the target must be an active user.
async function checkOwnerChange(
  db: Db,
  session: LeadSession,
  ownerId: string,
  signal: AbortSignal,
): Promise<Result<void, AppError>> {
  const canReassign = session.isAdmin || session.flags["deal.changeOwner"] === true;
  if (!canReassign) {
    return err(
      new AppError(ERROR_IDS.PERM_DENIED, "lead owner change requires deal.changeOwner", {
        userId: session.userId,
      }),
    );
  }
  const [target] = await db
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, ownerId), eq(users.isActive, true)));
  signal.throwIfAborted();
  if (target === undefined) {
    return err(
      new AppError(ERROR_IDS.USER_NOT_FOUND, "target owner not found or inactive", { ownerId }),
    );
  }
  return ok(undefined);
}

export async function updateLead(
  db: Db,
  session: LeadSession,
  raw: LeadUpdateInput,
  signal: AbortSignal,
): Promise<Result<{ id: string; updatedAt: string }, AppError>> {
  const parsed = leadUpdateInput.safeParse(raw);
  if (!parsed.success) {
    return err(
      new AppError(ERROR_IDS.LEAD_UPDATE_INPUT_INVALID, "updateLead: invalid input", {
        issues: parsed.error.issues,
      }),
    );
  }
  const input = parsed.data;
  signal.throwIfAborted();

  if (input.ownerId !== undefined) {
    const ownerCheck = await checkOwnerChange(db, session, input.ownerId, signal);
    if (!ownerCheck.ok) return ownerCheck;
  }

  // Load under the visibility gate (404-on-invisible): an invisible lead must not leak existence
  // via a distinguishable CAS-mismatch response.
  const [visible] = await db
    .select({ id: leads.id })
    .from(leads)
    .where(and(eq(leads.id, input.leadId), isNull(leads.deletedAt), leadVisibilityClause(session)));
  signal.throwIfAborted();
  if (visible === undefined) {
    return err(
      new AppError(ERROR_IDS.LEAD_NOT_FOUND, "Lead not found or not visible", {
        leadId: input.leadId,
      }),
    );
  }

  const patch = buildPatch(input, new Date());

  // Atomic CAS: single UPDATE WHERE id=:id AND date_trunc('milliseconds', updated_at)=:expected.
  // 0 rows means a concurrent write won; we write nothing.
  const updated = await db
    .update(leads)
    .set(patch)
    .where(
      and(
        eq(leads.id, input.leadId),
        isNull(leads.deletedAt),
        sql`date_trunc('milliseconds', ${leads.updatedAt}) = ${new Date(input.expectedUpdatedAt)}`,
      ),
    )
    .returning({ id: leads.id, updatedAt: leads.updatedAt });
  signal.throwIfAborted();

  const row = updated[0];
  if (row === undefined) {
    return err(
      new AppError(ERROR_IDS.LEAD_PRECONDITION, "Lead was modified by a concurrent request", {
        leadId: input.leadId,
      }),
    );
  }

  return ok({ id: row.id, updatedAt: row.updatedAt.toISOString() });
}
