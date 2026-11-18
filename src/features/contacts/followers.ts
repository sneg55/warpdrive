import { and, eq } from "drizzle-orm";
import type { AppError } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import { contactFollowers, users } from "@/db/schema";
import type { PermSetUser } from "@/features/permissions/effective";
import { assertReferenceVisible } from "@/features/permissions/referenceCheck";
import { ok, type Result } from "@/types/result";
import type { DealVisibilitySession } from "@/types/session";

export type ContactEntityType = "person" | "organization";

type UserRef = { id: string; name: string; avatarUrl: string | null };

export interface ContactFollowersResult {
  followers: UserRef[];
  isFollowedBySelf: boolean;
}

function toRefActor(actor: PermSetUser): DealVisibilitySession {
  return {
    userId: actor.id,
    isActive: actor.isActive,
    sessionLive: true,
    isAdmin: actor.type === "admin",
    visibilityGroupIds: Array.from(actor.groupIds),
    managedUserIds: Array.from(actor.managedUserIds ?? []),
  };
}

function assertVisible(
  db: Db,
  actor: PermSetUser,
  entityType: ContactEntityType,
  entityId: string,
  signal: AbortSignal,
): Promise<Result<void, AppError>> {
  return assertReferenceVisible(db, toRefActor(actor), { kind: entityType, id: entityId }, signal);
}

export async function followContact(
  db: Db,
  actor: PermSetUser,
  entityType: ContactEntityType,
  entityId: string,
  signal: AbortSignal,
): Promise<Result<void, AppError>> {
  const visible = await assertVisible(db, actor, entityType, entityId, signal);
  if (visible.ok === false) return visible;

  await db
    .insert(contactFollowers)
    .values({ entityType, entityId, userId: actor.id })
    .onConflictDoNothing();
  signal.throwIfAborted();
  return ok(undefined);
}

export async function unfollowContact(
  db: Db,
  actor: PermSetUser,
  entityType: ContactEntityType,
  entityId: string,
  signal: AbortSignal,
): Promise<Result<void, AppError>> {
  const visible = await assertVisible(db, actor, entityType, entityId, signal);
  if (visible.ok === false) return visible;

  await db
    .delete(contactFollowers)
    .where(
      and(
        eq(contactFollowers.entityType, entityType),
        eq(contactFollowers.entityId, entityId),
        eq(contactFollowers.userId, actor.id),
      ),
    );
  signal.throwIfAborted();
  return ok(undefined);
}

export async function listContactFollowers(
  db: Db,
  entityType: ContactEntityType,
  entityId: string,
  signal: AbortSignal,
): Promise<UserRef[]> {
  signal.throwIfAborted();
  const rows = await db
    .select({ id: users.id, name: users.name, avatarUrl: users.avatarUrl })
    .from(contactFollowers)
    .innerJoin(users, eq(users.id, contactFollowers.userId))
    .where(
      and(eq(contactFollowers.entityType, entityType), eq(contactFollowers.entityId, entityId)),
    );
  signal.throwIfAborted();
  return rows;
}

const EMPTY_FOLLOWERS: ContactFollowersResult = { followers: [], isFollowedBySelf: false };

export async function getContactFollowers(
  db: Db,
  actor: PermSetUser,
  entityType: ContactEntityType,
  entityId: string,
  signal: AbortSignal,
): Promise<ContactFollowersResult> {
  signal.throwIfAborted();
  const visible = await assertVisible(db, actor, entityType, entityId, signal);
  if (visible.ok === false) return EMPTY_FOLLOWERS;

  const followers = await listContactFollowers(db, entityType, entityId, signal);
  return { followers, isFollowedBySelf: followers.some((f) => f.id === actor.id) };
}
