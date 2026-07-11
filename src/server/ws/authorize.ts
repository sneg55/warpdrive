import { and, eq, sql } from "drizzle-orm";
import { parseChannel } from "@/constants/wsChannels";
import type { Db } from "@/db/client";
import { importBatches } from "@/db/schema";
import { loadLiveSession } from "@/features/auth/session";
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

// Verify signature+exp, atomically consume the jti, then SYNCHRONOUSLY revalidate the
// session + is_active at upgrade time (ops spec A1). Offboarding is immediate.
export async function consumeTicketAndBind(
  db: Db,
  token: string,
  signal: AbortSignal,
): Promise<Result<{ userId: string; sessionId: string }, "rejected">> {
  signal.throwIfAborted();
  const verified = await verifyTicket(token);
  if (verified.ok !== true) return err("rejected");

  // Atomic single-use consume: 0 rows affected means replay.
  const consumed = await db.execute(sql`
    INSERT INTO ws_tickets (jti, user_id, expires_at)
    VALUES (${verified.value.jti}, ${verified.value.userId}, now() + interval '60 seconds')
    ON CONFLICT (jti) DO NOTHING
    RETURNING jti`);
  signal.throwIfAborted();
  if (consumed.rows.length === 0) return err("rejected");

  const live = await loadLiveSession(db, verified.value.sessionId, signal);
  if (live.ok !== true || live.value.userId !== verified.value.userId) return err("rejected");

  return ok({ userId: verified.value.userId, sessionId: verified.value.sessionId });
}

// Channel authorization (ops spec A2 / permissions spec 6.7). Rule 0 first.
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

// An import batch is owner-scoped (like user:): its creator may watch progress. Admins may
// too, matching loadOwnedBatch (getBatch/getResult/listBatches), which grants admins access
// to any batch, so the read surfaces and the realtime channel stay consistent.
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

// UUID v4 format check: any id that does not look like a UUID cannot match a
// real row in the DB. Rejecting early avoids a Postgres cast error and keeps
// the functions fail-closed for garbage input (e.g. presence integration tests
// that use synthetic ids like "test-1" to exercise presence mechanics).
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Column references for the deal+pipeline join used in the existence query.
// d = deals alias, p = pipelines alias (joined for the pipeline restriction gate).
const DEAL_COLS = {
  ownerId: sql`d.owner_id`,
  visibilityLevel: sql`d.visibility_level`,
  visibilityGroupId: sql`d.visibility_group_id`,
  visibleToUserIds: sql`d.visible_to_user_ids`,
  pipelineVisibilityGroupId: sql`p.visibility_group_id`,
};

// A user may subscribe to deal:{id} iff they can SEE that deal per the canonical
// dealVisibilityPredicate (permissions spec 2.7 / 6.3). The deal is joined to its
// pipeline so the pipeline-restriction gate works AND so an archived pipeline hides
// all its deals here too, before the predicate, hiding from admins as well (F37).
// Fail-closed: any error -> denied.
// Exported so the WS fan-out path can re-check canSee(deal) per recipient live at send
// time (ops spec A3): channel membership is coarse; visibility can narrow after subscribe.
export async function authorizeDeal(
  db: Db,
  conn: WsConnection,
  id: string,
  signal: AbortSignal,
): Promise<Result<true, "denied">> {
  signal.throwIfAborted();
  // Non-UUID ids can never match a real row; deny immediately (fail-closed).
  if (!UUID_RE.test(id)) return err("denied");

  const ctx = {
    userId: conn.userId,
    isAdmin: conn.isAdmin,
    isActive: conn.isActive,
    sessionLive: true, // consumeTicketAndBind already revalidated the session at upgrade
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

// Build a uuid[] literal from a JS string array, handling the empty case.
// Mirrors the same helper in @/features/permissions/sql (not exported from there).
function buildUuidArray(ids: string[]) {
  if (ids.length === 0) return sql`ARRAY[]::uuid[]`;
  const parts = ids.map((id) => sql`${id}::uuid`);
  // Same reduction as in @/features/permissions/sql: join parts with commas,
  // then wrap. reduce is safe here because ids.length > 0 is guaranteed above.
  const joined = parts.reduce((acc, part) => sql`${acc}, ${part}`);
  return sql`ARRAY[${joined}]`;
}

// A user may subscribe to pipeline:{id} iff they can see that pipeline. Matches
// the exact rule used by listVisiblePipelines: visible iff admin OR
// visibility_group_id IS NULL OR visibility_group_id is in conn.groupIds.
// Fail-closed: any error -> denied.
async function authorizePipeline(
  db: Db,
  conn: WsConnection,
  id: string,
  signal: AbortSignal,
): Promise<Result<true, "denied">> {
  signal.throwIfAborted();
  // Non-UUID ids can never match a real row; deny immediately (fail-closed).
  if (!UUID_RE.test(id)) return err("denied");

  const groupArray = buildUuidArray(conn.groupIds);

  // Inline boolean for the admin bypass (not injected as a param to keep the
  // query structure consistent whether or not the user is an admin).
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
