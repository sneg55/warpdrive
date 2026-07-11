import { and, eq, isNull, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type * as schema from "@/db/schema";
import { leads } from "@/db/schema/leads";
import { settings } from "@/db/schema/system";
import {
  type EntityCreateSession,
  resolveOwnerId,
  resolveVisibilityGroup,
} from "@/features/permissions/entityCreate";
import { assertReferenceVisible } from "@/features/permissions/referenceCheck";
import { err, ok, type Result } from "@/types/result";
import {
  type LeadArchiveInput,
  type LeadCreateInput,
  leadArchiveInput,
  leadCreateInput,
} from "./schemas";
import { leadVisibilityClause } from "./visibility";

type Db = NodePgDatabase<typeof schema>;

// Leads share the deal creation trust boundary (owner override, group defaulting).
export type LeadSession = EntityCreateSession;

// A lead may only reference a person/org the creator can actually see; otherwise a client could
// attach a lead to (and probe the existence of) hidden contacts. Mirrors createDeal's gate.
async function assertLeadReferences(
  db: Db,
  session: LeadSession,
  input: LeadCreateInput,
  signal: AbortSignal,
): Promise<Result<void, AppError>> {
  if (input.personId !== null && input.personId !== undefined) {
    const ref = await assertReferenceVisible(
      db,
      session,
      { kind: "person", id: input.personId },
      signal,
    );
    if (!ref.ok) return ref;
  }
  if (input.orgId !== null && input.orgId !== undefined) {
    const ref = await assertReferenceVisible(
      db,
      session,
      { kind: "organization", id: input.orgId },
      signal,
    );
    if (!ref.ok) return ref;
  }
  return ok(undefined);
}

export async function createLead(
  db: Db,
  session: LeadSession,
  raw: LeadCreateInput,
  signal: AbortSignal,
): Promise<Result<typeof leads.$inferSelect, AppError>> {
  const input = leadCreateInput.parse(raw);
  signal.throwIfAborted();

  if (session.isAdmin !== true && session.flags["deal.create"] !== true) {
    return err(
      new AppError(ERROR_IDS.PERM_DENIED, "deal.create capability required", {
        userId: session.userId,
      }),
    );
  }

  const ownerResult = await resolveOwnerId(db, session, input.ownerId, signal);
  if (!ownerResult.ok) return ownerResult;

  const refResult = await assertLeadReferences(db, session, input, signal);
  if (!refResult.ok) return refResult;

  // Visibility derived server-side from the deal default (leads share the deal visibility policy).
  const [cfg] = await db.select().from(settings).where(eq(settings.id, true));
  const level = (cfg?.defaultVisibilityLevels.deal ?? "owner") as "owner" | "group" | "all";
  let visibilityGroupId: string | null = null;
  if (level === "group") {
    const group = resolveVisibilityGroup(session, input.visibilityGroupId);
    if (!group.ok) return group;
    visibilityGroupId = group.value;
  }
  signal.throwIfAborted();

  const [row] = await db
    .insert(leads)
    .values({
      title: input.title,
      value: input.value === null ? null : input.value.toFixed(2),
      personId: input.personId,
      orgId: input.orgId,
      expectedCloseDate: input.expectedCloseDate,
      labels: input.labels,
      sourceChannel: input.sourceChannel,
      sourceChannelId: input.sourceChannelId,
      sourceOrigin: input.sourceOrigin,
      ownerId: ownerResult.value,
      visibilityLevel: level,
      visibilityGroupId,
    })
    .returning();
  if (row === undefined) {
    throw new AppError(ERROR_IDS.DB_INSERT_FAILED, "createLead: insert returned no rows");
  }
  return ok(row);
}

export async function archiveLead(
  db: Db,
  session: LeadSession,
  raw: LeadArchiveInput,
  signal: AbortSignal,
): Promise<Result<typeof leads.$inferSelect, AppError>> {
  const input = leadArchiveInput.parse(raw);
  signal.throwIfAborted();

  // Only a lead visible to the actor can be archived (404-on-invisible: do not leak existence).
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

  const [row] = await db
    .update(leads)
    .set({ archivedAt: input.archived ? sql`now()` : null, updatedAt: new Date() })
    .where(eq(leads.id, input.leadId))
    .returning();
  if (row === undefined) {
    return err(
      new AppError(ERROR_IDS.LEAD_NOT_FOUND, "Lead vanished before archive", {
        leadId: input.leadId,
      }),
    );
  }
  return ok(row);
}
