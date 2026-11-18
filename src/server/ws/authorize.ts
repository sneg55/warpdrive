import { and, eq, sql } from "drizzle-orm";
import { parseChannel } from "@/constants/wsChannels";
import type { Db } from "@/db/client";
import { importBatches } from "@/db/schema";
import { loadLiveSessionById } from "@/features/auth/session";
import { dealVisibilityPredicate } from "@/features/permissions/sql";
import { err, ok, type Result } from "@/types/result";
import { verifyTicket } from "./ticket";

export interface WsConnection {
  userId: string;
  sessionId: string;
  name: string;
  isAdmin: boolean;
  isActive: boolean;
  groupIds: string[];
}

export async function consumeTicketAndBind(
  db: Db,
  token: string,
  signal: AbortSignal,
): Promise<Result<{ userId: string; sessionId: string }, "rejected">> {
  signal.throwIfAborted();
  const verified = await verifyTicket(token);
  if (verified.ok !== true) return err("rejected");

  const consumed = await db.execute(sql`
    INSERT INTO ws_tickets (jti, user_id, expires_at)
    VALUES (${verified.value.jti}, ${verified.value.userId}, now() + interval '60 seconds')
    ON CONFLICT (jti) DO NOTHING
    RETURNING jti`);
  signal.throwIfAborted();
  if (consumed.rows.length === 0) return err("rejected");

  const live = await loadLiveSessionById(db, verified.value.sessionId, signal);
  if (live.ok !== true || live.value.userId !== verified.value.userId) return err("rejected");

  return ok({ userId: verified.value.userId, sessionId: verified.value.sessionId });
}

export async function authorizeSubscribe(
  db: Db,
  conn: WsConnection,
  channel: string,
  signal: AbortSignal,
): Promise<Result<true, "denied">> {
  signal.throwIfAborted();
  if (conn.isActive !== true) return err("denied");
  const parsed = parseChannel(channel);
  if (parsed === null) return err("denied");

  switch (parsed.family) {
    case "user":
      return parsed.id === conn.userId ? ok(true) : err("denied");
    case "deal":
      return authorizeDeal(db, conn, parsed.id, signal);
    case "pipeline":
      return authorizePipeline(db, conn, parsed.id, signal);
    case "import":
      return authorizeImportBatch(db, conn, parsed.id, signal);
    default:
      return err("denied");
  }
}

async function authorizeImportBatch(
  db: Db,
  conn: WsConnection,
  batchId: string,
  signal: AbortSignal,
): Promise<Result<true, "denied">> {
  signal.throwIfAborted();
  if (!UUID_RE.test(batchId)) return err("denied");
  const [b] = await db
    .select({ createdBy: importBatches.createdBy })
    .from(importBatches)
    .where(and(eq(importBatches.id, batchId)))
    .limit(1);
  signal.throwIfAborted();
  if (b === undefined) return err("denied");
  if (b.createdBy !== conn.userId && conn.isAdmin !== true) return err("denied");
  return ok(true);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const DEAL_COLS = {
  ownerId: sql`d.owner_id`,
  visibilityLevel: sql`d.visibility_level`,
  visibilityGroupId: sql`d.visibility_group_id`,
  visibleToUserIds: sql`d.visible_to_user_ids`,
  pipelineVisibilityGroupId: sql`p.visibility_group_id`,
};

export async function authorizeDeal(
  db: Db,
  conn: WsConnection,
  id: string,
  signal: AbortSignal,
): Promise<Result<true, "denied">> {
  signal.throwIfAborted();
  if (!UUID_RE.test(id)) return err("denied");

  const ctx = {
    userId: conn.userId,
    isAdmin: conn.isAdmin,
    isActive: conn.isActive,
    sessionLive: true,
    groupIds: conn.groupIds,
  };

  const predicate = dealVisibilityPredicate(ctx, DEAL_COLS);

  const rows = await db.execute(sql`
    SELECT 1 FROM deals d
    JOIN pipelines p ON p.id = d.pipeline_id
    WHERE d.id = ${id}::uuid
      AND d.deleted_at IS NULL
      AND p.is_archived = false
      AND ${predicate}
    LIMIT 1
  `);
  signal.throwIfAborted();

  return rows.rows.length > 0 ? ok(true) : err("denied");
}

function buildUuidArray(ids: string[]) {
  if (ids.length === 0) return sql`ARRAY[]::uuid[]`;
  const parts = ids.map((id) => sql`${id}::uuid`);
  const joined = parts.reduce((acc, part) => sql`${acc}, ${part}`);
  return sql`ARRAY[${joined}]`;
}

async function authorizePipeline(
  db: Db,
  conn: WsConnection,
  id: string,
  signal: AbortSignal,
): Promise<Result<true, "denied">> {
  signal.throwIfAborted();
  if (!UUID_RE.test(id)) return err("denied");

  const groupArray = buildUuidArray(conn.groupIds);

  const adminBypass = conn.isAdmin ? sql`TRUE` : sql`FALSE`;

  const rows = await db.execute(sql`
    SELECT 1 FROM pipelines
    WHERE id = ${id}::uuid
      AND is_archived = FALSE
      AND (${adminBypass} OR visibility_group_id IS NULL OR visibility_group_id = ANY(${groupArray}))
    LIMIT 1
  `);
  signal.throwIfAborted();

  return rows.rows.length > 0 ? ok(true) : err("denied");
}
