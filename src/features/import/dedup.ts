import { sql } from "drizzle-orm";
import { organizations, persons } from "@/db/schema";
import { derivePrimaryEmail } from "@/features/contacts/primaryEmail";
import { canSee } from "@/features/permissions/canSee";
import type { AuthUser } from "@/features/permissions/types";
import type { DbOrTx } from "@/server/realtime/channelVersions";
import type { ContactPoint } from "@/types/contactPoint";

export type DedupResult =
  | { outcome: "none" }
  | { outcome: "one"; candidateId: string }
  | { outcome: "ambiguous"; count: number };

// Visibility-scoped dedup: matches a mapped import row against existing records,
// then filters to those the importer canSee. A hidden candidate is never
// surfaced, preserving 404-on-invisible (a duplicate the actor cannot see is
// treated as "no duplicate", not leaked via the import flow).
export async function findCandidates(
  db: DbOrTx,
  actor: AuthUser,
  target: "person" | "organization",
  mapped: Record<string, unknown>,
  signal: AbortSignal,
): Promise<DedupResult> {
  signal.throwIfAborted();

  if (target === "person") {
    const email = derivePrimaryEmail((mapped.emails as ContactPoint[] | undefined) ?? []);
    if (email === null) return { outcome: "none" };
    const rows = await db
      .select()
      .from(persons)
      .where(sql`${persons.primaryEmail} = ${email} and ${persons.deletedAt} is null`);
    const visible = rows.filter((r) =>
      canSee(actor, {
        kind: "person",
        ownerId: r.ownerId,
        visibilityLevel: r.visibilityLevel,
        visibilityGroupId: r.visibilityGroupId,
        visibleToUserIds: r.visibleToUserIds,
      }),
    );
    return resolve(visible.map((r) => r.id));
  }

  const name = (mapped.name as string | undefined)?.trim();
  if (name === undefined || name === "") return { outcome: "none" };
  const rows = await db
    .select()
    .from(organizations)
    .where(
      sql`lower(${organizations.name}) = lower(${name}) and ${organizations.deletedAt} is null`,
    );
  const visible = rows.filter((r) =>
    canSee(actor, {
      kind: "organization",
      ownerId: r.ownerId,
      visibilityLevel: r.visibilityLevel,
      visibilityGroupId: r.visibilityGroupId,
      visibleToUserIds: r.visibleToUserIds,
    }),
  );
  return resolve(visible.map((r) => r.id));
}

// Match a person by NAME, visibility-scoped. The person TARGET's dedup key is deliberately the
// primary email (a name is not identifying enough to merge contacts on). But a deal row's related
// Person group may legitimately carry only a name, and without this a re-import of the same file
// would create a fresh person every time instead of linking the one already there.
export async function findPersonByName(
  db: DbOrTx,
  actor: AuthUser,
  name: string,
  signal: AbortSignal,
): Promise<DedupResult> {
  signal.throwIfAborted();
  const trimmed = name.trim();
  if (trimmed === "") return { outcome: "none" };
  const rows = await db
    .select()
    .from(persons)
    .where(sql`lower(${persons.name}) = lower(${trimmed}) and ${persons.deletedAt} is null`);
  const visible = rows.filter((r) =>
    canSee(actor, {
      kind: "person",
      ownerId: r.ownerId,
      visibilityLevel: r.visibilityLevel,
      visibilityGroupId: r.visibilityGroupId,
      visibleToUserIds: r.visibleToUserIds,
    }),
  );
  return resolve(visible.map((r) => r.id));
}

function resolve(ids: string[]): DedupResult {
  const first = ids[0];
  if (ids.length === 1 && first !== undefined) return { outcome: "one", candidateId: first };
  if (ids.length === 0) return { outcome: "none" };
  return { outcome: "ambiguous", count: ids.length };
}
