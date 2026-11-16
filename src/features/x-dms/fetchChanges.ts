import { and, eq, inArray } from "drizzle-orm";
import type { AppError } from "@/constants/errorIds";
import { X_CONVERSATIONS_PAGE_SIZE, X_EVENTS_PAGE_SIZE, X_FIRST_PAGE_SIZE } from "@/constants/xDms";
import type { Db } from "@/db/client";
import { xConversations } from "@/db/schema/xDms";
import { ok, type Result } from "@/types/result";
import { snowflakeToDate } from "./snowflake";
import { withAccessToken } from "./tokens";
import type { XChatConversation, XClient, XRawEvent, XUser } from "./types";

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

function changedItem(
  ctx: FetchContext,
  c: XChatConversation,
  stored: Map<string, string | null>,
  users: XUser[],
  floorMs: number,
): ChangedConversation | null {
  if (c.newestEventId === null) return null;
  const isNew = !stored.has(c.id);
  if (isNew && snowflakeToDate(c.newestEventId).getTime() < floorMs) return null;
  const storedNewestEventId = stored.get(c.id) ?? null;
  if (!isNew && !isNewer(c.newestEventId, storedNewestEventId)) return null;
  const participantId = c.participantIds.find((id) => id !== ctx.accountXUserId);
  if (c.type !== "direct" || participantId === undefined) return null;
  return {
    conversation: c,
    newestEventId: c.newestEventId,
    participantId,
    participant: users.find((u) => u.id === participantId) ?? null,
    storedNewestEventId,
    isNew,
  };
}

function byNewestEventId(a: ChangedConversation, b: ChangedConversation): number {
  const x = BigInt(a.newestEventId);
  const y = BigInt(b.newestEventId);
  return x < y ? -1 : x > y ? 1 : 0;
}

export async function listChangedConversations(
  ctx: FetchContext,
  windowFloorMs: number,
): Promise<Result<ChangedConversation[], AppError>> {
  const changed: ChangedConversation[] = [];
  let paginationToken: string | undefined;
  for (;;) {
    const page = await withAccessToken(
      ctx.db,
      ctx.client,
      ctx.accountId,
      (token) =>
        ctx.client.listConversations(
          token,
          { maxResults: X_CONVERSATIONS_PAGE_SIZE, paginationToken },
          ctx.signal,
        ),
      ctx.signal,
    );
    if (!page.ok) return page;
    const stored = await storedNewest(
      ctx,
      page.value.items.map((c) => c.id),
    );
    for (const c of page.value.items) {
      const item = changedItem(ctx, c, stored, page.value.users, windowFloorMs);
      if (item !== null) changed.push(item);
    }
    if (page.value.nextToken === null) return ok(changed.sort(byNewestEventId));
    paginationToken = page.value.nextToken;
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
