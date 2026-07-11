// Global tsvector search across deals, persons, organizations, and leads.
// Each section is independently visibility-gated and limited to PER_SECTION results.
import { sql } from "drizzle-orm";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import { dealVisibilityClause } from "@/features/deals/visibility";
import type { PermSetUser } from "@/features/permissions/effective";
import { dealVisibilityPredicate } from "@/features/permissions/sql";
import type { Result } from "@/types/result";
import { err, ok } from "@/types/result";
import type { SearchResult, SearchResults } from "@/types/search";

const PER_SECTION = 8;

// Build the DealVisibilitySession shape that dealVisibilityClause expects.
// Mirrors toSession() in src/features/stats/funnel.ts exactly.
function toSession(actor: PermSetUser) {
  return {
    userId: actor.id,
    isAdmin: actor.type === "admin",
    isActive: actor.isActive,
    sessionLive: true,
    visibilityGroupIds: Array.from(actor.groupIds),
    managedUserIds: Array.from(actor.managedUserIds ?? []),
  };
}

// Build the VisibilityCtx shape that dealVisibilityPredicate expects.
// Mirrors toCtx() in src/features/stats/activitiesPerformance.ts exactly.
function toCtx(actor: PermSetUser) {
  return {
    userId: actor.id,
    isAdmin: actor.type === "admin",
    isActive: actor.isActive,
    sessionLive: true,
    groupIds: Array.from(actor.groupIds),
    managedUserIds: Array.from(actor.managedUserIds ?? []),
  };
}

type RawRow = { id: string; primary: string; secondary: string | null };

function toSearchResults(rows: RawRow[]): SearchResult[] {
  return rows.map((r) => ({ id: r.id, primary: r.primary, secondary: r.secondary }));
}

export async function searchAll(
  db: Db,
  actor: PermSetUser,
  q: string,
  signal: AbortSignal,
): Promise<Result<SearchResults, AppError>> {
  signal.throwIfAborted();

  const trimmed = q.trim();
  if (trimmed.length === 0) {
    return err(new AppError(ERROR_IDS.SEARCH_EMPTY_QUERY, "empty search query", {}));
  }

  const tsq = sql`websearch_to_tsquery('simple', ${trimmed})`;

  // Deals: requires JOIN pipelines p so dealVisibilityClause can gate on
  // p.visibility_group_id (pipeline restriction).
  const dealVisClause = dealVisibilityClause(toSession(actor));
  const dealResult = await db.execute(sql`
    SELECT d.id,
           d.title AS primary,
           coalesce(d.value::text, '') AS secondary
    FROM deals d
    JOIN pipelines p ON p.id = d.pipeline_id
    WHERE d.deleted_at IS NULL
      AND p.is_archived = false
      AND d.search_tsv @@ ${tsq}
      AND ${dealVisClause}
    ORDER BY ts_rank(d.search_tsv, ${tsq}) DESC
    LIMIT ${PER_SECTION}
  `);
  signal.throwIfAborted();

  const ctx = toCtx(actor);

  // Persons (alias pe to avoid colliding with pipeline alias p).
  // NULL pipeline gate collapses dealVisibilityPredicate to the universal
  // record-visibility rule (mirror of canSee); persons have no pipeline restriction.
  const personVisPred = dealVisibilityPredicate(ctx, {
    ownerId: sql`pe.owner_id`,
    visibilityLevel: sql`pe.visibility_level`,
    visibilityGroupId: sql`pe.visibility_group_id`,
    visibleToUserIds: sql`pe.visible_to_user_ids`,
    pipelineVisibilityGroupId: sql`NULL::uuid`,
  });
  const personResult = await db.execute(sql`
    SELECT pe.id,
           pe.name AS primary,
           pe.primary_email::text AS secondary
    FROM persons pe
    WHERE pe.deleted_at IS NULL
      AND pe.search_tsv @@ ${tsq}
      AND ${personVisPred}
    ORDER BY ts_rank(pe.search_tsv, ${tsq}) DESC
    LIMIT ${PER_SECTION}
  `);
  signal.throwIfAborted();

  // Organizations (alias o).
  // NULL pipeline gate collapses dealVisibilityPredicate to the universal
  // record-visibility rule (mirror of canSee); orgs have no pipeline restriction.
  const orgVisPred = dealVisibilityPredicate(ctx, {
    ownerId: sql`o.owner_id`,
    visibilityLevel: sql`o.visibility_level`,
    visibilityGroupId: sql`o.visibility_group_id`,
    visibleToUserIds: sql`o.visible_to_user_ids`,
    pipelineVisibilityGroupId: sql`NULL::uuid`,
  });
  const orgResult = await db.execute(sql`
    SELECT o.id,
           o.name AS primary,
           NULL::text AS secondary
    FROM organizations o
    WHERE o.deleted_at IS NULL
      AND o.search_tsv @@ ${tsq}
      AND ${orgVisPred}
    ORDER BY ts_rank(o.search_tsv, ${tsq}) DESC
    LIMIT ${PER_SECTION}
  `);
  signal.throwIfAborted();

  // Leads (alias l). No pipeline, so the NULL pipeline gate collapses the
  // predicate to the universal record-visibility rule (mirror of leadVisibilityClause).
  const leadVisPred = dealVisibilityPredicate(ctx, {
    ownerId: sql`l.owner_id`,
    visibilityLevel: sql`l.visibility_level`,
    visibilityGroupId: sql`l.visibility_group_id`,
    visibleToUserIds: sql`l.visible_to_user_ids`,
    pipelineVisibilityGroupId: sql`NULL::uuid`,
  });
  const leadResult = await db.execute(sql`
    SELECT l.id,
           l.title AS primary,
           coalesce(l.value::text, '') AS secondary
    FROM leads l
    WHERE l.deleted_at IS NULL
      AND l.archived_at IS NULL
      AND l.search_tsv @@ ${tsq}
      AND ${leadVisPred}
    ORDER BY ts_rank(l.search_tsv, ${tsq}) DESC
    LIMIT ${PER_SECTION}
  `);
  signal.throwIfAborted();

  const dealRows = (dealResult as unknown as { rows: RawRow[] }).rows;
  const personRows = (personResult as unknown as { rows: RawRow[] }).rows;
  const orgRows = (orgResult as unknown as { rows: RawRow[] }).rows;
  const leadRows = (leadResult as unknown as { rows: RawRow[] }).rows;

  return ok({
    deals: toSearchResults(dealRows),
    people: toSearchResults(personRows),
    organizations: toSearchResults(orgRows),
    leads: toSearchResults(leadRows),
  });
}
