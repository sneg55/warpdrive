import { and, eq, inArray, sql } from "drizzle-orm";
import type { AppError } from "@/constants/errorIds";
import { X_CONVERSATIONS_PAGE_SIZE, X_EVENTS_PAGE_SIZE, X_FIRST_PAGE_SIZE } from "@/constants/xDms";
import type { Db } from "@/db/client";
import { xConversations } from "@/db/schema/xDms";
import { ok, type Result } from "@/types/result";
import { snowflakeToDate } from "./snowflake";
import { withAccessToken } from "./tokens";
import type { XChatConversation, XClient, XPage, XRawEvent, XUser } from "./types";

export interface FetchContext {
  db: Db;
  client: XClient;
  accountId: string;
  accountXUserId: string;
  signal: AbortSignal;
}

export interface ChangedConversation {
  conversation: XChatConversation;
  newestEventId: string;
  participantId: string;
  participant: XUser | null;
  storedNewestEventId: string | null;
  isNew: boolean;
}

const isNewer = (id: string, than: string | null): boolean =>
  than === null || BigInt(id) > BigInt(than);

async function storedNewest(ctx: FetchContext, ids: string[]): Promise<Map<string, string | null>> {
  if (ids.length === 0) return new Map();
  const rows = await ctx.db
    .select({ id: xConversations.xConversationId, newest: xConversations.newestEventId })
    .from(xConversations)
    .where(
      and(
        eq(xConversations.accountId, ctx.accountId),
        inArray(xConversations.xConversationId, ids),
      ),
    );
  ctx.signal.throwIfAborted();
  return new Map(rows.map((r) => [r.id, r.newest]));
}

async function syncedWatermark(ctx: FetchContext): Promise<string | null> {
  const [row] = await ctx.db
    .select({ max: sql<string | null>`max(${xConversations.newestEventId}::numeric)::text` })
    .from(xConversations)
    .where(eq(xConversations.accountId, ctx.accountId));
  ctx.signal.throwIfAborted();
  return row?.max ?? null;
}

interface ScanBounds {
  floorMs: number;
  watermark: string | null;
}

type Scan =
  | { kind: "stop" }
  | { kind: "skip" }
  | { kind: "unchanged" }
  | { kind: "changed"; item: ChangedConversation };

function scan(
  ctx: FetchContext,
  c: XChatConversation,
  stored: Map<string, string | null>,
  users: XUser[],
  bounds: ScanBounds,
): Scan {
  if (c.newestEventId === null) return { kind: "unchanged" };
  const isNew = !stored.has(c.id);
  if (isNew && snowflakeToDate(c.newestEventId).getTime() < bounds.floorMs) return { kind: "stop" };
  const storedNewestEventId = stored.get(c.id) ?? null;
  if (!isNew && !isNewer(c.newestEventId, storedNewestEventId)) return { kind: "stop" };
  const participantId = c.participantIds.find((id) => id !== ctx.accountXUserId);
  if (c.type !== "direct" || participantId === undefined)
    return isNewer(c.newestEventId, bounds.watermark) ? { kind: "skip" } : { kind: "unchanged" };
  const participant = users.find((u) => u.id === participantId) ?? null;
  return {
    kind: "changed",
    item: {
      conversation: c,
      newestEventId: c.newestEventId,
      participantId,
      participant,
      storedNewestEventId,
      isNew,
    },
  };
}

function scanPage(
  ctx: FetchContext,
  page: XPage<XChatConversation>,
  stored: Map<string, string | null>,
  bounds: ScanBounds,
  changed: ChangedConversation[],
): boolean {
  let everyItemChanged = true;
  for (const c of page.items) {
    const s = scan(ctx, c, stored, page.users, bounds);
    if (s.kind === "stop") return false;
    if (s.kind === "unchanged") everyItemChanged = false;
    if (s.kind === "changed") changed.push(s.item);
  }
  return everyItemChanged;
}

export async function listChangedConversations(
  ctx: FetchContext,
  windowFloorMs: number,
): Promise<Result<ChangedConversation[], AppError>> {
  const changed: ChangedConversation[] = [];
  const bounds: ScanBounds = { floorMs: windowFloorMs, watermark: await syncedWatermark(ctx) };
  let paginationToken: string | undefined;
  let maxResults = X_FIRST_PAGE_SIZE;
  for (;;) {
    const page = await withAccessToken(
      ctx.db,
      ctx.client,
      ctx.accountId,
      (token) => ctx.client.listConversations(token, { maxResults, paginationToken }, ctx.signal),
      ctx.signal,
    );
    if (!page.ok) return page;
    const stored = await storedNewest(
      ctx,
      page.value.items.map((c) => c.id),
    );
    const morePages = scanPage(ctx, page.value, stored, bounds, changed);
    if (page.value.nextToken === null || !morePages) return ok(changed);
    paginationToken = page.value.nextToken;
    maxResults = X_CONVERSATIONS_PAGE_SIZE;
  }
}

export async function fetchNewEvents(
  ctx: FetchContext,
  a: { conversationId: string; storedNewestEventId: string | null; floorMs: number | null },
): Promise<Result<XRawEvent[], AppError>> {
  const events: XRawEvent[] = [];
  let paginationToken: string | undefined;
  let maxResults = X_FIRST_PAGE_SIZE;
  for (;;) {
    const page = await withAccessToken(
      ctx.db,
      ctx.client,
      ctx.accountId,
      (token) =>
        ctx.client.listEvents(
          token,
          { conversationId: a.conversationId, maxResults, paginationToken },
          ctx.signal,
        ),
      ctx.signal,
    );
    if (!page.ok) return page;
    for (const e of page.value.items) {
      if (!isNewer(e.id, a.storedNewestEventId)) return ok(events);
      if (a.floorMs !== null && e.createdAt.getTime() < a.floorMs) return ok(events);
      events.push(e);
    }
    if (page.value.nextToken === null) return ok(events);
    paginationToken = page.value.nextToken;
    maxResults = X_EVENTS_PAGE_SIZE;
  }
}
