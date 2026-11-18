import { and, eq, isNull, type SQL, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { organizations } from "@/db/schema";
import { normalisedDomainSql } from "@/db/schema/organizations";
import type { ContactActor } from "@/features/contacts/personsRepo";
import { canSee } from "@/features/permissions/canSee";
import { dealVisibilityPredicate } from "@/features/permissions/sql";
import { normaliseDomain } from "./domain";

export { normaliseDomain };

const STORED_DOMAIN = normalisedDomainSql(sql`${organizations.domain}`);

export interface OrgCandidate {
  name: string;
  domain?: string;
}

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
