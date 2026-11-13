import { AppError, ERROR_IDS } from "@/constants/errorIds";
import { X_SNOWFLAKE_EPOCH_MS } from "@/constants/xDms";
import { err, ok, type Result } from "@/types/result";
import type { XChatConversation, XClient, XPage, XRawEvent, XTokens, XUser } from "./types";

export interface XFake {
  client: XClient;
  conversations: XChatConversation[];
  events: Map<string, XRawEvent[]>;
  users: Map<string, XUser>;
  sent: Array<{ participantId: string; text: string }>;
  requests: Array<{ path: string; maxResults?: number }>;
  failNext: Map<keyof XClient, AppError>;
  refreshCalls: string[];
  revoked: string[];
  sendAtMs: number | null;
}

export function fakeSendEventId(atMs: number, sendNumber: number): string {
  return ((BigInt(atMs - X_SNOWFLAKE_EPOCH_MS) << 22n) | BigInt(sendNumber)).toString();
}

const later = <T>(f: () => T): Promise<T> => Promise.resolve().then(f);

const FAKE_TOKEN_TTL_MS = 7_200_000;

function paged<T>(
  all: T[],
  a: { maxResults: number; paginationToken?: string },
  users: XUser[],
): XPage<T> {
  const start = a.paginationToken === undefined ? 0 : Number(a.paginationToken);
  const items = all.slice(start, start + a.maxResults);
  const end = start + items.length;
  return { items, users, nextToken: end < all.length ? String(end) : null };
}

export function makeXFake(): XFake {
  const fake: XFake = {
    conversations: [],
    events: new Map(),
    users: new Map(),
    sent: [],
    requests: [],
    failNext: new Map(),
    refreshCalls: [],
    revoked: [],
    sendAtMs: null,
    client: undefined as unknown as XClient,
  };

  function gate<T>(name: keyof XClient): Result<T, AppError> | null {
    const failure = fake.failNext.get(name);
    if (failure === undefined) return null;
    fake.failNext.delete(name);
    return err(failure);
  }

  const tokens = (): XTokens => ({
    accessToken: `fake-access-${fake.refreshCalls.length}`,
    refreshToken: `fake-refresh-${fake.refreshCalls.length}`,
    expiresAt: new Date(Date.now() + FAKE_TOKEN_TTL_MS),
    scopes: ["dm.read", "dm.write", "tweet.read", "users.read", "offline.access"],
  });

  fake.client = {
    exchangeCode: () => Promise.resolve(gate<XTokens>("exchangeCode") ?? ok(tokens())),
    refresh: (refreshToken) => {
      fake.refreshCalls.push(refreshToken);
      return Promise.resolve(gate<XTokens>("refresh") ?? ok(tokens()));
    },
    revoke: (token) => {
      fake.revoked.push(token);
      return Promise.resolve(gate<void>("revoke") ?? ok(undefined));
    },
    getMe: () =>
      later(() => {
        const failed = gate<XUser>("getMe");
        if (failed) return failed;
        const me = fake.users.values().next().value;
        return me
          ? ok(me)
          : err(new AppError(ERROR_IDS.X_HTTP_FAILED, "fake has no users", { status: 404 }));
      }),
    listConversations: (_t, a) =>
      later(() => {
        fake.requests.push({ path: "/2/chat/conversations", maxResults: a.maxResults });
        const failed = gate<XPage<XChatConversation>>("listConversations");
        if (failed) return failed;
        const ids = new Set(fake.conversations.flatMap((c) => c.participantIds));
        const users = [...ids].flatMap((id) => fake.users.get(id) ?? []);
        return ok(paged(fake.conversations, a, users));
      }),
    listEvents: (_t, a) =>
      later(() => {
        fake.requests.push({
          path: `/2/chat/conversations/${a.conversationId}/events`,
          maxResults: a.maxResults,
        });
        const failed = gate<XPage<XRawEvent>>("listEvents");
        if (failed) return failed;
        return ok(paged(fake.events.get(a.conversationId) ?? [], a, []));
      }),
    sendDm: (_t, a) =>
      later(() => {
        const failed = gate<{ eventId: string; conversationId: string }>("sendDm");
        if (failed) return failed;
        fake.sent.push(a);
        return ok({
          eventId: fakeSendEventId(fake.sendAtMs ?? Date.now(), fake.sent.length),
          conversationId: `fake-conversation-${a.participantId}`,
        });
      }),
  };
  return fake;
}
