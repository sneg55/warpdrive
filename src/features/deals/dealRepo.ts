import { sql } from "drizzle-orm";
import type { DealStatus } from "@/constants/dealStatus";
import { filterToSql } from "@/features/saved-filters/filterAst";
import { hasStatusCondition } from "@/features/saved-filters/filterFields";
import type { FilterDefinition } from "@/features/saved-filters/schemas";
import type { DbOrTx } from "@/server/realtime/channelVersions";
import type { DealVisibilitySession } from "@/types/session";
import { dealVisibilityClause } from "./visibility";

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

function normalizeCard<T extends RawCard>(
  row: T,
): Omit<T, "nextActivityAt" | "lastActivityAt" | "stageEnteredAt" | "updatedAt"> & {
  nextActivityAt: Date | null;
  lastActivityAt: Date | null;
  stageEnteredAt: Date;
  updatedAt: Date;
} {
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
  status?: DealStatus;
  labels?: string[];
  stageId: string;
  boardPosition: string;
  ownerId: string;
  personId: string | null;
  orgId: string | null;
  ownerName?: string | null;
  ownerAvatarUrl?: string | null;
  personName?: string | null;
  orgName?: string | null;
  nextActivityAt: Date | null;
  nextActivityTitle?: string | null;
  lastActivityAt: Date | null;
  expectedCloseDate?: string | null;
  stageEnteredAt: Date;
  updatedAt: Date;
}

export type DealListCard = BoardCard & { customFields: Record<string, unknown> };

export async function getBoardColumns(
  db: DbOrTx,
  session: DealVisibilitySession,
  pipelineId: string,
  signal: AbortSignal,
  filter?: FilterDefinition,
  timeZone?: string | null,
): Promise<{ cards: BoardCard[] }> {
  signal.throwIfAborted();
  const visClause = dealVisibilityClause(session);
  const filterClause = filter !== undefined ? filterToSql(filter, { timeZone }) : sql`true`;
  const openGate = hasStatusCondition(filter) ? sql`` : sql`AND d.status = 'open'`;
  const result = await db.execute(sql`
    SELECT
      d.id,
      d.title,
      d.status,
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
      na.subject           AS "nextActivityTitle",
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
    -- Soonest OPEN, DATED activity's subject: the same predicate recomputeNextActivity uses, so the
    -- title always pairs with next_activity_at. LATERAL keeps it one row per deal (no fan-out).
    LEFT JOIN LATERAL (
      SELECT a.subject
      FROM activities a
      WHERE a.deal_id = d.id
        AND a.done = false
        AND a.deleted_at IS NULL
        AND a.due_at IS NOT NULL
      ORDER BY a.due_at ASC
      LIMIT 1
    ) na ON true
    WHERE d.pipeline_id = ${pipelineId}
      ${openGate}
      AND d.deleted_at IS NULL
      AND d.archived_at IS NULL
      AND p.is_archived = false
      AND ${visClause}
      AND ${filterClause}
    ORDER BY d.stage_id, d.board_position
  `);
  signal.throwIfAborted();
  const rows = (result as unknown as { rows: RawCard[] }).rows;
  return { cards: rows.map(normalizeCard) };
}

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

export async function listDeals(
  db: DbOrTx,
  session: DealVisibilitySession,
  opts: {
    pipelineId?: string;
    offset: number;
    limit: number;
    archived?: boolean;
    filter?: FilterDefinition;
    timeZone?: string | null;
  },
  signal: AbortSignal,
): Promise<{ rows: DealListCard[]; total: number; totalValue: string }> {
  signal.throwIfAborted();
  const pipelineFilter =
    opts.pipelineId !== undefined ? sql`AND d.pipeline_id = ${opts.pipelineId}` : sql``;
  const archiveGate =
    opts.archived === true ? sql`d.archived_at IS NOT NULL` : sql`d.archived_at IS NULL`;
  const statusGate =
    opts.archived === true || hasStatusCondition(opts.filter) ? sql`` : sql`AND d.status = 'open'`;
  const visClause = dealVisibilityClause(session);
  const filterClause =
    opts.filter !== undefined ? filterToSql(opts.filter, { timeZone: opts.timeZone }) : sql`true`;
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

  const [rowsRes, aggRes] = await Promise.all([
    db.execute(sql`
      SELECT
        d.id,
        d.title,
        d.status,
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
        d.updated_at         AS "updatedAt",
        d.custom_fields       AS "customFields"
      ${base}
      ORDER BY d.updated_at DESC
      LIMIT ${opts.limit} OFFSET ${opts.offset}
    `),
    db.execute(sql`
      SELECT
        count(*)::int                                    AS total,
        coalesce(sum(d.value), 0)::numeric(14,2)        AS "totalValue"
      ${base}
    `),
  ]);
  signal.throwIfAborted();

  const agg = (aggRes as unknown as { rows: Array<{ total: number; totalValue: string }> }).rows[0];
  if (agg === undefined) {
    return { rows: [], total: 0, totalValue: "0.00" };
  }
  const rawRows = (
    rowsRes as unknown as { rows: (RawCard & { customFields: Record<string, unknown> })[] }
  ).rows;
  return {
    rows: rawRows.map(normalizeCard),
    total: agg.total,
    totalValue: agg.totalValue,
  };
}
