import { eq, type SQL, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { teamMembers } from "@/db/schema";
import type { PermSetUser } from "@/features/permissions/effective";
import { buildUuidArray } from "@/features/permissions/sql";
import type { OwnerIdFilter, OwnerScope } from "@/types/stats";

export const EVERYONE: OwnerIdFilter = { everyone: true };

export function onlyOwners(ids: string[]): OwnerIdFilter {
  return { everyone: false, ids };
}

export function ownerFilterClause(column: SQL, owners: OwnerIdFilter): SQL {
  if (owners.everyone) return sql``;
  if (owners.ids.length === 0) return sql`AND FALSE`;
  return sql`AND ${column} = ANY(${buildUuidArray(owners.ids)})`;
}

export async function resolveOwnerIds(
  db: Db,
  actor: PermSetUser,
  scope: OwnerScope,
  signal: AbortSignal,
): Promise<OwnerIdFilter> {
  signal.throwIfAborted();
  switch (scope.kind) {
    case "all":
      return { everyone: true };
    case "me":
      return { everyone: false, ids: [actor.id] };
    case "user":
      return { everyone: false, ids: [scope.userId] };
    case "team": {
      const rows = await db
        .select({ userId: teamMembers.userId })
        .from(teamMembers)
        .where(eq(teamMembers.teamId, scope.teamId));
      signal.throwIfAborted();
      return { everyone: false, ids: rows.map((r) => r.userId) };
    }
  }
}
