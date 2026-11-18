import { and, eq, isNull } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type * as schema from "@/db/schema";
import { deals, leads, organizations, persons, pipelines, users } from "@/db/schema";
import { leadVisibilityClause } from "@/features/leads/visibility";
import type { EntityRef } from "@/types/entityRef";
import { assertNever, err, ok, type Result } from "@/types/result";
import type { DealVisibilitySession } from "@/types/session";
import { canSee } from "./canSee";
import type { AuthUser, VisibleDeal, VisiblePersonOrOrg } from "./types";

type Db = NodePgDatabase<typeof schema>;

function toAuthUser(actor: DealVisibilitySession): AuthUser {
  return {
    id: actor.userId,
    type: actor.isAdmin ? "admin" : "regular",
    isActive: actor.isActive,
    groupIds: new Set(actor.visibilityGroupIds),
    managedUserIds: new Set(actor.managedUserIds ?? []),
  };
}

async function checkPersonOrOrg(
  tx: Db,
  authUser: AuthUser,
  ref: EntityRef,
  signal: AbortSignal,
): Promise<Result<void, AppError>> {
  const table = ref.kind === "person" ? persons : organizations;
  const [row] = await tx
    .select()
    .from(table)
    .where(and(eq(table.id, ref.id), isNull(table.deletedAt)));
  signal.throwIfAborted();
  if (row === undefined) {
    return err(new AppError(ERROR_IDS.CONTACT_NOT_FOUND, "not found", { ref }));
  }
  const record: VisiblePersonOrOrg = {
    kind: ref.kind as "person" | "organization",
    ownerId: row.ownerId,
    visibilityLevel: row.visibilityLevel,
    visibilityGroupId: row.visibilityGroupId ?? null,
    visibleToUserIds: row.visibleToUserIds,
  };
  if (!canSee(authUser, record)) {
    return err(new AppError(ERROR_IDS.CONTACT_NOT_FOUND, "not found", { ref }));
  }
  return ok(undefined);
}

async function checkDeal(
  tx: Db,
  authUser: AuthUser,
  ref: EntityRef,
  signal: AbortSignal,
): Promise<Result<void, AppError>> {
  const [row] = await tx
    .select()
    .from(deals)
    .where(and(eq(deals.id, ref.id), isNull(deals.deletedAt)));
  signal.throwIfAborted();
  if (row === undefined) {
    return err(new AppError(ERROR_IDS.DEAL_NOT_FOUND, "not found", { ref }));
  }
  const [pipe] = await tx
    .select({ vg: pipelines.visibilityGroupId, isArchived: pipelines.isArchived })
    .from(pipelines)
    .where(eq(pipelines.id, row.pipelineId));
  signal.throwIfAborted();
  if (pipe === undefined) {
    return err(new AppError(ERROR_IDS.DEAL_NOT_FOUND, "not found", { ref }));
  }
  if (pipe.isArchived) {
    return err(new AppError(ERROR_IDS.DEAL_NOT_FOUND, "not found", { ref }));
  }
  const record: VisibleDeal = {
    kind: "deal",
    ownerId: row.ownerId,
    visibilityLevel: row.visibilityLevel,
    visibilityGroupId: row.visibilityGroupId ?? null,
    visibleToUserIds: row.visibleToUserIds,
    pipelineVisibilityGroupId: pipe.vg ?? null,
  };
  if (!canSee(authUser, record)) {
    return err(new AppError(ERROR_IDS.DEAL_NOT_FOUND, "not found", { ref }));
  }
  return ok(undefined);
}

async function checkLead(
  tx: Db,
  actor: DealVisibilitySession,
  ref: EntityRef,
  signal: AbortSignal,
): Promise<Result<void, AppError>> {
  const [row] = await tx
    .select({ id: leads.id })
    .from(leads)
    .where(and(eq(leads.id, ref.id), isNull(leads.deletedAt), leadVisibilityClause(actor)));
  signal.throwIfAborted();
  if (row === undefined) {
    return err(new AppError(ERROR_IDS.LEAD_NOT_FOUND, "not found", { ref }));
  }
  return ok(undefined);
}

async function checkUser(
  tx: Db,
  ref: EntityRef,
  signal: AbortSignal,
): Promise<Result<void, AppError>> {
  const [row] = await tx.select().from(users).where(eq(users.id, ref.id));
  signal.throwIfAborted();
  if (row === undefined || row.isActive !== true) {
    return err(new AppError(ERROR_IDS.USER_NOT_FOUND, "not found", { ref }));
  }
  return ok(undefined);
}

export async function assertReferenceVisible(
  tx: Db,
  actor: DealVisibilitySession,
  ref: EntityRef,
  signal: AbortSignal,
): Promise<Result<void, AppError>> {
  signal.throwIfAborted();
  const authUser = toAuthUser(actor);
  switch (ref.kind) {
    case "person":
    case "organization":
      return checkPersonOrOrg(tx, authUser, ref, signal);
    case "deal":
      return checkDeal(tx, authUser, ref, signal);
    case "lead":
      return checkLead(tx, actor, ref, signal);
    case "user":
      return checkUser(tx, ref, signal);
    default:
      return assertNever(ref.kind);
  }
}
