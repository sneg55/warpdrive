import { and, eq, isNull, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type * as schema from "@/db/schema";
import { users } from "@/db/schema/identity";
import { leads } from "@/db/schema/leads";
import { validateCustomFieldsPartial } from "@/features/custom-fields/validateForTarget";
import { syncEntityLabelNames } from "@/features/labels/labelsRepo.entities";
import { mayTransferOwner, toTransferActor } from "@/features/permissions/mayTransferOwner";
import { err, ok, type Result } from "@/types/result";
import type { LeadSession } from "./leadActions";
import { type LeadUpdateInput, leadUpdateInput } from "./schemas";
import { leadVisibilityClause } from "./visibility";

type Db = NodePgDatabase<typeof schema>;
type LeadPatch = Partial<typeof leads.$inferInsert>;

function buildPatch(
  input: LeadUpdateInput,
  customFields: Record<string, unknown> | undefined,
  now: Date,
): LeadPatch {
  const patch: LeadPatch = { updatedAt: now };
  if (input.title !== undefined) patch.title = input.title;
  if (input.value !== undefined) {
    patch.value = input.value === null ? null : input.value.toFixed(2);
  }
  if (input.ownerId !== undefined) patch.ownerId = input.ownerId;
  if (input.expectedCloseDate !== undefined) patch.expectedCloseDate = input.expectedCloseDate;
  if (input.labels !== undefined) patch.labels = input.labels;
  if (customFields !== undefined) {
    const jsonPatch = JSON.stringify(customFields);
    patch.customFields = sql`${leads.customFields} || ${jsonPatch}::jsonb`;
  }
  return patch;
}

async function checkOwnerChange(
  db: Db,
  session: LeadSession,
  leadId: string,
  ownerId: string,
  signal: AbortSignal,
): Promise<Result<void, AppError>> {
  const [current] = await db
    .select({ ownerId: leads.ownerId })
    .from(leads)
    .where(and(eq(leads.id, leadId), isNull(leads.deletedAt), leadVisibilityClause(session)));
  signal.throwIfAborted();
  if (current === undefined) {
    return err(new AppError(ERROR_IDS.LEAD_NOT_FOUND, "Lead not found or not visible", { leadId }));
  }
  if (!mayTransferOwner(toTransferActor(session), current.ownerId)) {
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
    const ownerCheck = await checkOwnerChange(db, session, input.leadId, input.ownerId, signal);
    if (!ownerCheck.ok) return ownerCheck;
  }

  let customFields: Record<string, unknown> | undefined;
  if (input.customFields !== undefined) {
    const validated = await validateCustomFieldsPartial(db, "lead", input.customFields, signal);
    if (!validated.ok) return validated;
    customFields = validated.value;
  }

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

  const patch = buildPatch(input, customFields, new Date());

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

  if (patch.labels !== undefined) {
    await syncEntityLabelNames(db, "lead", row.id, patch.labels, signal);
  }

  return ok({ id: row.id, updatedAt: row.updatedAt.toISOString() });
}
