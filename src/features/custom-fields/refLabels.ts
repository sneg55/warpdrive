import { and, inArray, isNull } from "drizzle-orm";
import type { CustomFieldTarget } from "@/constants/customFieldTypes";
import type { Db } from "@/db/client";
import { organizations, persons } from "@/db/schema";
import { users } from "@/db/schema/identity";
import { canSee } from "@/features/permissions/canSee";
import type { AuthUser } from "@/features/permissions/types";
import { isUuidParam } from "@/lib/isUuidParam";
import type { CustomFieldDef } from "@/types/customFields";
import { listDefs } from "./defsRepo";
import { type CustomFieldRefLabels, EMPTY_REF_LABELS } from "./refLabelsShared";

export { type CustomFieldRefLabels, EMPTY_REF_LABELS, mergeRefLabels } from "./refLabelsShared";

type RefKind = "user" | "person" | "org";

function toContactRefActor(actor: AuthUser): AuthUser {
  return { id: actor.id, type: actor.type, isActive: actor.isActive, groupIds: actor.groupIds };
}

function collectIds(
  defs: readonly CustomFieldDef[],
  rows: readonly { customFields: Record<string, unknown> }[],
): Record<RefKind, Set<string>> {
  const out: Record<RefKind, Set<string>> = { user: new Set(), person: new Set(), org: new Set() };
  const refDefs = defs.filter(
    (d): d is CustomFieldDef & { type: RefKind } =>
      d.type === "user" || d.type === "person" || d.type === "org",
  );
  if (refDefs.length === 0) return out;
  for (const row of rows) {
    for (const def of refDefs) {
      const v = row.customFields[def.key];
      if (typeof v === "string" && isUuidParam(v)) out[def.type].add(v);
    }
  }
  return out;
}

async function userNames(db: Db, ids: string[]): Promise<Record<string, string>> {
  if (ids.length === 0) return {};
  const rows = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(inArray(users.id, ids));
  return Object.fromEntries(rows.map((r) => [r.id, r.name]));
}

async function personNames(
  db: Db,
  actor: AuthUser,
  ids: string[],
): Promise<Record<string, string>> {
  if (ids.length === 0) return {};
  const rows = await db
    .select({
      id: persons.id,
      name: persons.name,
      ownerId: persons.ownerId,
      visibilityLevel: persons.visibilityLevel,
      visibilityGroupId: persons.visibilityGroupId,
      visibleToUserIds: persons.visibleToUserIds,
    })
    .from(persons)
    .where(and(inArray(persons.id, ids), isNull(persons.deletedAt)));
  const refActor = toContactRefActor(actor);
  return Object.fromEntries(
    rows.filter((r) => canSee(refActor, { kind: "person", ...r })).map((r) => [r.id, r.name]),
  );
}

async function orgNames(db: Db, actor: AuthUser, ids: string[]): Promise<Record<string, string>> {
  if (ids.length === 0) return {};
  const rows = await db
    .select({
      id: organizations.id,
      name: organizations.name,
      ownerId: organizations.ownerId,
      visibilityLevel: organizations.visibilityLevel,
      visibilityGroupId: organizations.visibilityGroupId,
      visibleToUserIds: organizations.visibleToUserIds,
    })
    .from(organizations)
    .where(and(inArray(organizations.id, ids), isNull(organizations.deletedAt)));
  const refActor = toContactRefActor(actor);
  return Object.fromEntries(
    rows.filter((r) => canSee(refActor, { kind: "organization", ...r })).map((r) => [r.id, r.name]),
  );
}

type RefGroup = {
  defs: readonly CustomFieldDef[];
  rows: readonly { customFields: Record<string, unknown> }[];
};

async function resolveGroups(
  db: Db,
  actor: AuthUser,
  groups: readonly RefGroup[],
  signal: AbortSignal,
): Promise<CustomFieldRefLabels> {
  signal.throwIfAborted();
  const ids: Record<RefKind, Set<string>> = { user: new Set(), person: new Set(), org: new Set() };
  for (const group of groups) {
    const groupIds = collectIds(group.defs, group.rows);
    for (const id of groupIds.user) ids.user.add(id);
    for (const id of groupIds.person) ids.person.add(id);
    for (const id of groupIds.org) ids.org.add(id);
  }
  const [user, person, org] = await Promise.all([
    userNames(db, [...ids.user]),
    personNames(db, actor, [...ids.person]),
    orgNames(db, actor, [...ids.org]),
  ]);
  signal.throwIfAborted();
  return { user, person, org };
}

export async function resolveCustomFieldRefLabels(
  db: Db,
  actor: AuthUser,
  defs: readonly CustomFieldDef[],
  rows: readonly { customFields: Record<string, unknown> }[],
  signal: AbortSignal,
): Promise<CustomFieldRefLabels> {
  return resolveGroups(db, actor, [{ defs, rows }], signal);
}

export async function resolveCustomFieldRefLabelsFor(
  db: Db,
  actor: AuthUser,
  groups: readonly RefGroup[],
  signal: AbortSignal,
): Promise<CustomFieldRefLabels> {
  return resolveGroups(db, actor, groups, signal);
}

export async function attachRefLabels<
  T extends { rows: readonly { customFields: Record<string, unknown> }[] },
>(
  db: Db,
  actor: AuthUser,
  target: CustomFieldTarget,
  result: T,
  signal: AbortSignal,
): Promise<T & { refLabels: CustomFieldRefLabels }> {
  const defs = await listDefs(db, target, {}, signal);
  const refLabels = defs.some((d) => d.type === "user" || d.type === "person" || d.type === "org")
    ? await resolveCustomFieldRefLabels(db, actor, defs, result.rows, signal)
    : EMPTY_REF_LABELS;
  return { ...result, refLabels };
}
