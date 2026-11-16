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
  storedEncrypted: boolean;
  isNew: boolean;
}

interface StoredConversation {
  newest: string | null;
  encrypted: boolean;
}

export interface FetchedEvents {
  events: XRawEvent[];
  keyEvents: string[];
  contextEvents: string[];
}

const isNewer = (id: string, than: string | null): boolean =>
  than === null || BigInt(id) > BigInt(than);

async function storedConversations(
  ctx: FetchContext,
  ids: string[],
): Promise<Map<string, StoredConversation>> {
  if (ids.length === 0) return new Map();
  const rows = await ctx.db
    .select({
      id: xConversations.xConversationId,
      newest: xConversations.newestEventId,
      encrypted: xConversations.encrypted,
    })
    .from(xConversations)
    .where(
      and(
        eq(xConversations.accountId, ctx.accountId),
        inArray(xConversations.xConversationId, ids),
      ),
    );
  ctx.signal.throwIfAborted();
  return new Map(rows.map((r) => [r.id, { newest: r.newest, encrypted: r.encrypted }]));
}

function changedItem(
  ctx: FetchContext,
  c: XChatConversation,
  stored: Map<string, StoredConversation>,
  users: XUser[],
  floorMs: number,
): ChangedConversation | null {
  if (c.newestEventId === null) return null;
  const isNew = !stored.has(c.id);
  if (isNew && snowflakeToDate(c.newestEventId).getTime() < floorMs) return null;
  const storedNewestEventId = stored.get(c.id)?.newest ?? null;
  if (!isNew && !isNewer(c.newestEventId, storedNewestEventId)) return null;
  const participantId = c.participantIds.find((id) => id !== ctx.accountXUserId);
  if (c.type !== "direct" || participantId === undefined) return null;
  return {
    conversation: c,
    newestEventId: c.newestEventId,
    participantId,
    participant: users.find((u) => u.id === participantId) ?? null,
    storedNewestEventId,
    storedEncrypted: stored.get(c.id)?.encrypted ?? false,
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
    const stored = await storedConversations(
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

interface EventsRequest {
  conversationId: string;
  storedNewestEventId: string | null;
  floorMs: number | null;
}

const isWanted = (e: XRawEvent, a: EventsRequest): boolean =>
  isNewer(e.id, a.storedNewestEventId) &&
  (a.floorMs === null || e.createdAt.getTime() >= a.floorMs);

function takeNewEvents(items: XRawEvent[], a: EventsRequest, into: FetchedEvents): boolean {
  let more = true;
  for (const e of items) {
    more = more && isWanted(e, a);
    if (more) into.events.push(e);
    else into.contextEvents.push(e.encodedEvent);
  }
  return more;
}

function addKeyEvents(into: FetchedEvents, keyEvents: string[]): void {
  for (const k of keyEvents) if (!into.keyEvents.includes(k)) into.keyEvents.push(k);
}

export async function fetchNewEvents(
  ctx: FetchContext,
  a: EventsRequest,
): Promise<Result<FetchedEvents, AppError>> {
  const fetched: FetchedEvents = { events: [], keyEvents: [], contextEvents: [] };
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
    addKeyEvents(fetched, page.value.keyEvents);
    const more = takeNewEvents(page.value.items, a, fetched);
    if (!more || page.value.nextToken === null) return ok(fetched);
    paginationToken = page.value.nextToken;
    maxResults = X_EVENTS_PAGE_SIZE;
  }
}
