// Resolves a provider's company reference to an existing organization. Domain first, then exact
// case-insensitive name (spec 9.3): two organizations can share a name, but a domain names one
// company. Only an unambiguous match links, and nothing here ever creates an organization.
import { and, eq, isNull, type SQL, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { organizations } from "@/db/schema";
import { normalisedDomainSql } from "@/db/schema/organizations";
import type { ContactActor } from "@/features/contacts/personsRepo";
import { canSee } from "@/features/permissions/canSee";
import { dealVisibilityPredicate } from "@/features/permissions/sql";
import { normaliseDomain } from "./domain";

export { normaliseDomain };

// Applied to the stored column so a saved "https://acme.com/" still matches a provider's
// "acme.com". Same expression the organizations.search_tsv generated column uses.
const STORED_DOMAIN = normalisedDomainSql(sql`${organizations.domain}`);

export interface OrgCandidate {
  name: string;
  domain?: string;
}

// An organization the actor cannot see must read as no match: returning its id only makes
// updatePerson reject the reference and fail the whole apply, losing the other selected fields.
// The gate is SQL rather than a filter over the rows, because uniqueness is decided by the query
// and a hidden row would otherwise use up one of the two rows it looks at.
function visibleToActor(actor: ContactActor | undefined): SQL {
  if (actor === undefined) return sql`TRUE`;
  return dealVisibilityPredicate(
    {
      userId: actor.id,
      isAdmin: actor.type === "admin",
      isActive: actor.isActive,
      sessionLive: true,
      groupIds: Array.from(actor.groupIds),
      managedUserIds: Array.from(actor.managedUserIds ?? []),
    },
    {
      ownerId: sql`${organizations.ownerId}`,
      visibilityLevel: sql`${organizations.visibilityLevel}`,
      visibilityGroupId: sql`${organizations.visibilityGroupId}`,
      visibleToUserIds: sql`${organizations.visibleToUserIds}`,
      // Organizations carry no pipeline restriction, so a NULL gate collapses the predicate to
      // the universal record-visibility rule (mirror of canSee).
      pipelineVisibilityGroupId: sql`NULL::uuid`,
    },
  );
}

export async function resolveOrgLink(
  db: Db,
  candidate: OrgCandidate,
  signal: AbortSignal,
  actor?: ContactActor,
): Promise<string | null> {
  signal.throwIfAborted();
  const visible = visibleToActor(actor);
  const domain = candidate.domain === undefined ? "" : normaliseDomain(candidate.domain);
  if (domain.length > 0) {
    const byDomain = await uniqueMatch(db, sql`${STORED_DOMAIN} = ${domain}`, visible);
    if (byDomain !== null) return byDomain;
  }
  const name = candidate.name.trim();
  if (name.length === 0) return null;
  return uniqueMatch(db, sql`lower(${organizations.name}) = lower(${name})`, visible);
}

// The linked organization as the actor is allowed to see it. A person can stay visible after its
// organization is hidden, and neither the change log nor an outbound provider request may carry a
// name the reader is not entitled to.
export async function visibleOrgSummary(
  db: Db,
  actor: ContactActor,
  orgId: string | null,
  signal: AbortSignal,
): Promise<{ name: string; domain: string | null } | null> {
  signal.throwIfAborted();
  if (orgId === null) return null;
  const [row] = await db
    .select()
    .from(organizations)
    .where(and(eq(organizations.id, orgId), isNull(organizations.deletedAt)));
  if (row === undefined) return null;
  const visible = canSee(actor, {
    kind: "organization",
    ownerId: row.ownerId,
    visibilityLevel: row.visibilityLevel,
    visibilityGroupId: row.visibilityGroupId,
    visibleToUserIds: row.visibleToUserIds,
  });
  return visible ? { name: row.name, domain: row.domain } : null;
}

async function uniqueMatch(db: Db, match: SQL, visible: SQL): Promise<string | null> {
  const rows = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(and(isNull(organizations.deletedAt), match, visible))
    .limit(2);
  return rows.length === 1 ? (rows[0]?.id ?? null) : null;
}
