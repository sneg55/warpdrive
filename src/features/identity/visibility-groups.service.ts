import { and, eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import { pipelines, users, visibilityGroupMembers, visibilityGroups } from "@/db/schema";
import type { PermSetUser } from "@/features/permissions/effective";
import { err, ok, type Result } from "@/types/result";
import { recordAudit } from "./audit";
import { canManageGroupMembership } from "./guards";

export function listVisibilityGroups(db: Db, signal: AbortSignal) {
  signal.throwIfAborted();
  return db.select().from(visibilityGroups);
}

// Viewing a group's roster requires the same permissions.manage/admin gate as managing
// groups at all (list/create); it does not use canManageGroupMembership's stricter
// membership-mutation rules (self-membership, restricted-pipeline block), since reading
// the roster is not a membership change.
export async function listGroupMembers(
  db: Db,
  actor: PermSetUser,
  groupId: string,
  signal: AbortSignal,
): Promise<Result<{ userId: string; name: string }[], string>> {
  if (actor.type !== "admin" && !actor.flags.has("permissions.manage")) {
    return err("permissions.manage required");
  }
  signal.throwIfAborted();
  const rows = await db
    .select({ userId: visibilityGroupMembers.userId, name: users.name })
    .from(visibilityGroupMembers)
    .innerJoin(users, eq(users.id, visibilityGroupMembers.userId))
    .where(eq(visibilityGroupMembers.groupId, groupId));
  return ok(rows);
}

export async function createVisibilityGroup(
  db: Db,
  actor: PermSetUser,
  input: { name: string },
  signal: AbortSignal,
): Promise<Result<{ id: string }, string>> {
  if (actor.type !== "admin" && !actor.flags.has("permissions.manage")) {
    return err("permissions.manage required");
  }
  signal.throwIfAborted();
  const [row] = await db.insert(visibilityGroups).values({ name: input.name }).returning();
  if (row === undefined) return err("create failed");
  await recordAudit(
    db,
    {
      actorId: actor.id,
      targetType: "visibility_group",
      targetId: row.id,
      action: "visibility_group.create",
      after: { name: input.name },
    },
    signal,
  );
  return ok({ id: row.id });
}

async function actorIsMember(db: Db, groupId: string, userId: string): Promise<boolean> {
  const rows = await db
    .select()
    .from(visibilityGroupMembers)
    .where(
      and(eq(visibilityGroupMembers.groupId, groupId), eq(visibilityGroupMembers.userId, userId)),
    )
    .limit(1);
  return rows[0] !== undefined;
}

// True when the group gates at least one restricted pipeline (a pipeline whose
// visibility_group_id points at it). Managing membership of such a group is admin-only
// (permissions spec §5); a delegated permissions.manage holder must be blocked (F3).
async function groupGatesRestrictedPipeline(db: Db, groupId: string): Promise<boolean> {
  const rows = await db
    .select({ id: pipelines.id })
    .from(pipelines)
    .where(eq(pipelines.visibilityGroupId, groupId))
    .limit(1);
  return rows[0] !== undefined;
}

export async function addGroupMember(
  db: Db,
  actor: PermSetUser,
  input: { groupId: string; userId: string },
  signal: AbortSignal,
): Promise<Result<true, string>> {
  const isMember =
    actor.type === "admin" ? false : await actorIsMember(db, input.groupId, actor.id);
  const gatesRestricted =
    actor.type === "admin" ? false : await groupGatesRestrictedPipeline(db, input.groupId);
  const gate = canManageGroupMembership(actor, {
    groupId: input.groupId,
    targetUserId: input.userId,
    groupGatesRestrictedPipeline: gatesRestricted,
    actorIsMemberOfGroup: isMember,
  });
  if (gate.ok === false) return gate;
  signal.throwIfAborted();
  await db
    .insert(visibilityGroupMembers)
    .values({ groupId: input.groupId, userId: input.userId })
    .onConflictDoNothing();
  await recordAudit(
    db,
    {
      actorId: actor.id,
      targetType: "visibility_group",
      targetId: input.groupId,
      action: "visibility_group.member_added",
      after: { userId: input.userId },
    },
    signal,
  );
  return ok(true);
}

export async function removeGroupMember(
  db: Db,
  actor: PermSetUser,
  input: { groupId: string; userId: string },
  signal: AbortSignal,
): Promise<Result<true, string>> {
  const isMember =
    actor.type === "admin" ? false : await actorIsMember(db, input.groupId, actor.id);
  const gatesRestricted =
    actor.type === "admin" ? false : await groupGatesRestrictedPipeline(db, input.groupId);
  const gate = canManageGroupMembership(actor, {
    groupId: input.groupId,
    targetUserId: input.userId,
    groupGatesRestrictedPipeline: gatesRestricted,
    actorIsMemberOfGroup: isMember,
  });
  if (gate.ok === false) return gate;
  signal.throwIfAborted();
  await db
    .delete(visibilityGroupMembers)
    .where(
      and(
        eq(visibilityGroupMembers.groupId, input.groupId),
        eq(visibilityGroupMembers.userId, input.userId),
      ),
    );
  await recordAudit(
    db,
    {
      actorId: actor.id,
      targetType: "visibility_group",
      targetId: input.groupId,
      action: "visibility_group.member_removed",
      before: { userId: input.userId },
    },
    signal,
  );
  return ok(true);
}
