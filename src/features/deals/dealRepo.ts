// Board and list reads behind the deal visibility predicate.
// All queries JOIN pipelines (alias p) so dealVisibilityClause can reference
// p.visibility_group_id; none leak hidden deals into counts or totals.
import { sql } from "drizzle-orm";
import { filterToSql } from "@/features/saved-filters/filterAst";
import type { FilterDefinition } from "@/features/saved-filters/schemas";
import type { DbOrTx } from "@/server/realtime/channelVersions";
import type { DealVisibilitySession } from "@/types/session";
import { dealVisibilityClause } from "./visibility";

// Raw pg returns timestamptz columns as strings; the SELECT aliases below map to
// this shape before coercion. Card type promises Date, so normalize once here.
interface RawCard
  extends Omit<BoardCard, "nextActivityAt" | "lastActivityAt" | "stageEnteredAt" | "updatedAt"> {
  nextActivityAt: string | null;
  lastActivityAt: string | null;
  stageEnteredAt: string;
  updatedAt: string;
}

function toDate(v: string | null): Date | null {
  return v === null ? null : new Date(v);
}

// Coerce the string timestamp columns to Date so the BoardCard contract holds at
// runtime (consumers call .toISOString()/.getTime() and would otherwise crash).
function normalizeCard(row: RawCard): BoardCard {
  return {
    ...row,
    nextActivityAt: toDate(row.nextActivityAt),
    lastActivityAt: toDate(row.lastActivityAt),
    stageEnteredAt: new Date(row.stageEnteredAt),
    updatedAt: new Date(row.updatedAt),
  };
}

export interface BoardCard {
  id: string;
  title: string;
  value: string | null;
  // Label keys (hot/warm/cold); resolved to name+color at the card boundary.
  // Optional like the other join-provided display fields so hand-built fixtures need not set it.
  labels?: string[];
  stageId: string;
  boardPosition: string;
  ownerId: string;
  personId: string | null;
  orgId: string | null;
  // Resolved display names (LEFT JOINed by the board/list reads). Optional so hand-built
  // fixtures need not set them; null when the related row is absent.
  ownerName?: string | null;
  // The owner's uploaded photo (users.avatar_url), so the card avatar shows the real picture
  // instead of only initials. Null/absent when the owner has no avatar.
  ownerAvatarUrl?: string | null;
  personName?: string | null;
  orgName?: string | null;
  nextActivityAt: Date | null;
  lastActivityAt: Date | null;
  // Date-only column (YYYY-MM-DD): kept as the raw string so the list can format it in local time
  // without a UTC off-by-one. Optional so hand-built fixtures need not set it.
  expectedCloseDate?: string | null;
  stageEnteredAt: Date;
  // deal's updated_at: used as the compare-and-swap precondition for optimistic updates.
  updatedAt: Date;
}

// Returns open, non-deleted, visible cards for the pipeline ordered by
// (stageId, boardPosition). Owner/person/org are returned as IDs only;
// name resolution is Phase 3.
export async function getBoardColumns(
  db: DbOrTx,
  session: DealVisibilitySession,
  pipelineId: string,
  signal: AbortSignal,
  filter?: FilterDefinition,
): Promise<{ cards: BoardCard[] }> {
  signal.throwIfAborted();
  const visClause = dealVisibilityClause(session);
  // filterToSql narrows only (boolean AND-able predicate over d/p); it cannot widen visibility.
  const filterClause = filter !== undefined ? filterToSql(filter) : sql`true`;
  const result = await db.execute(sql`
    SELECT
      d.id,
      d.title,
      d.value,
      d.labels,
      d.stage_id        AS "stageId",
      d.board_position  AS "boardPosition",
      d.owner_id        AS "ownerId",
      d.person_id       AS "personId",
      d.org_id          AS "orgId",
      u.name            AS "ownerName",
      u.avatar_url      AS "ownerAvatarUrl",
      pe.name           AS "personName",
      o.name            AS "orgName",
      d.next_activity_at   AS "nextActivityAt",
      d.last_activity_at   AS "lastActivityAt",
      d.expected_close_date AS "expectedCloseDate",
      d.stage_entered_at   AS "stageEnteredAt",
      d.updated_at         AS "updatedAt"
    FROM deals d
    JOIN pipelines p ON p.id = d.pipeline_id
    LEFT JOIN stages s ON s.id = d.stage_id
    LEFT JOIN users u ON u.id = d.owner_id
    LEFT JOIN persons pe ON pe.id = d.person_id
    LEFT JOIN organizations o ON o.id = d.org_id
    WHERE d.pipeline_id = ${pipelineId}
      AND d.status = 'open'
      AND d.deleted_at IS NULL
      AND d.archived_at IS NULL
      AND p.is_archived = false
      AND ${visClause}
      AND ${filterClause}
    ORDER BY d.stage_id, d.board_position
  `);
  signal.throwIfAborted();
  // Drizzle's db.execute returns { rows: unknown[] } for raw SQL with string timestamps.
  const rows = (result as unknown as { rows: RawCard[] }).rows;
  return { cards: rows.map(normalizeCard) };
}

// Per-stage value sums (data-model spec §13). Visibility predicate is injected
// via the same JOIN + WHERE so hidden deals are excluded from both count and sum.
export async function getStageSums(
  db: DbOrTx,
  session: DealVisibilitySession,
  pipelineId: string,
  signal: AbortSignal,
): Promise<Array<{ stageId: string; dealCount: number; total: string }>> {
  signal.throwIfAborted();
  const visClause = dealVisibilityClause(session);
  const result = await db.execute(sql`
    SELECT
      d.stage_id          AS "stageId",
      count(*)::int       AS "dealCount",
      coalesce(sum(d.value), 0)::numeric(14,2) AS total
    FROM deals d
    JOIN pipelines p ON p.id = d.pipeline_id
    WHERE d.pipeline_id = ${pipelineId}
      AND d.status = 'open'
      AND d.deleted_at IS NULL
      AND d.archived_at IS NULL
      AND p.is_archived = false
      AND ${visClause}
    GROUP BY d.stage_id
  `);
  signal.throwIfAborted();
  const rows = (
    result as unknown as {
      rows: Array<{ stageId: string; dealCount: number; total: string }>;
    }
  ).rows;
  return rows;
}

// Paginated deal list behind the visibility predicate.
// total and totalValue are computed over the FULL filtered set, not just the page,
// so the footer is always accurate regardless of offset/limit.
export async function listDeals(
  db: DbOrTx,
  session: DealVisibilitySession,
  opts: {
    pipelineId?: string;
    offset: number;
    limit: number;
    archived?: boolean;
    filter?: FilterDefinition;
  },
  signal: AbortSignal,
): Promise<{ rows: BoardCard[]; total: number; totalValue: string }> {
  signal.throwIfAborted();
  const pipelineFilter =
    opts.pipelineId !== undefined ? sql`AND d.pipeline_id = ${opts.pipelineId}` : sql``;
  // Default list shows active open deals; the Archive tab (archived:true) shows archived
  // deals of ANY status (Pipedrive keeps won/lost status when archiving), so the status
  // filter is dropped there, otherwise an archived won/lost deal would be visible nowhere.
  const archiveGate =
    opts.archived === true ? sql`d.archived_at IS NOT NULL` : sql`d.archived_at IS NULL`;
  const statusGate = opts.archived === true ? sql`` : sql`AND d.status = 'open'`;
  const visClause = dealVisibilityClause(session);
  const filterClause = opts.filter !== undefined ? filterToSql(opts.filter) : sql`true`;
  const base = sql`
    FROM deals d
    JOIN pipelines p ON p.id = d.pipeline_id
    LEFT JOIN stages s ON s.id = d.stage_id
    LEFT JOIN users u ON u.id = d.owner_id
    LEFT JOIN persons pe ON pe.id = d.person_id
    LEFT JOIN organizations o ON o.id = d.org_id
    WHERE d.deleted_at IS NULL
      ${statusGate}
      AND ${archiveGate}
      AND p.is_archived = false
      ${pipelineFilter}
      AND ${visClause}
      AND ${filterClause}
  `;

  const rowsRes = await db.execute(sql`
    SELECT
      d.id,
      d.title,
      d.value,
      d.labels,
      d.stage_id        AS "stageId",
      d.board_position  AS "boardPosition",
      d.owner_id        AS "ownerId",
      d.person_id       AS "personId",
      d.org_id          AS "orgId",
      u.name            AS "ownerName",
      u.avatar_url      AS "ownerAvatarUrl",
      pe.name           AS "personName",
      o.name            AS "orgName",
      d.next_activity_at   AS "nextActivityAt",
      d.last_activity_at   AS "lastActivityAt",
      d.expected_close_date AS "expectedCloseDate",
      d.stage_entered_at   AS "stageEnteredAt",
      d.updated_at         AS "updatedAt"
    ${base}
    ORDER BY d.updated_at DESC
    LIMIT ${opts.limit} OFFSET ${opts.offset}
  `);
  signal.throwIfAborted();

  const aggRes = await db.execute(sql`
    SELECT
      count(*)::int                                    AS total,
      coalesce(sum(d.value), 0)::numeric(14,2)        AS "totalValue"
    ${base}
  `);
  signal.throwIfAborted();

  const agg = (aggRes as unknown as { rows: Array<{ total: number; totalValue: string }> }).rows[0];
  if (agg === undefined) {
    return { rows: [], total: 0, totalValue: "0.00" };
  }
  const rawRows = (rowsRes as unknown as { rows: RawCard[] }).rows;
  return {
    rows: rawRows.map(normalizeCard),
    total: agg.total,
    totalValue: agg.totalValue,
  };
}
