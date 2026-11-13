import { AppError, ERROR_IDS, type ErrorId } from "@/constants/errorIds";
import { X_API_BASE, X_REVOKE_URL, X_TOKEN_URL } from "@/constants/xDms";
import { err, ok, type Result } from "@/types/result";
import type { XDmSettings } from "./settings";
import type {
  XChatConversation,
  XClient,
  XHttpConfig,
  XPage,
  XRawEvent,
  XTokens,
  XUser,
} from "./types";
import { basicAuth, bearer, type XRequestSpec, xRequest } from "./xHttp";
import {
  conversationsResponseSchema,
  eventsResponseSchema,
  meResponseSchema,
  sendResponseSchema,
  tokenResponseSchema,
  type UserWire,
} from "./xSchemas";

interface XClientDeps extends XHttpConfig {
  settings: XDmSettings;
}

interface Parser<T> {
  safeParse(v: unknown): { success: true; data: T } | { success: false };
}

const hyphenId = (id: string): string => id.replaceAll(":", "-");

function toUser(u: UserWire): XUser {
  return {
    id: u.id,
    username: u.username,
    name: u.name,
    profileImageUrl: u.profile_image_url ?? null,
  };
}

function parseBody<T>(schema: Parser<T>, body: unknown, path: string): Result<T, AppError> {
  const parsed = schema.safeParse(body);
  if (parsed.success) return ok(parsed.data);
  return err(
    new AppError(ERROR_IDS.X_PARSE_FAILED, "x response did not match the schema", { path }),
  );
}

function remapId(e: AppError, from: ErrorId, to: ErrorId): AppError {
  return e.id === from ? new AppError(to, e.message, e.context) : e;
}

export function makeXClient(deps: XClientDeps): XClient {
  const { settings } = deps;
  const basic = basicAuth(settings.clientId, settings.clientSecret);

  async function call<T>(
    spec: XRequestSpec,
    schema: Parser<T>,
    signal: AbortSignal,
  ): Promise<Result<T, AppError>> {
    const res = await xRequest(deps, spec, signal);
    if (!res.ok) return res;
    return parseBody(schema, res.value, new URL(spec.url).pathname);
  }

  const get = (url: string, token: string): XRequestSpec => ({
    url,
    method: "GET",
    headers: { Authorization: bearer(token) },
  });

  async function tokenCall(
    form: Record<string, string>,
    failureId: ErrorId,
    signal: AbortSignal,
  ): Promise<Result<XTokens, AppError>> {
    const r = await call(
      {
        url: X_TOKEN_URL,
        method: "POST",
        headers: { Authorization: basic, "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ ...form, client_id: settings.clientId }).toString(),
      },
      tokenResponseSchema,
      signal,
    );
    if (!r.ok) return err(remapId(r.error, ERROR_IDS.X_HTTP_FAILED, failureId));
    const t = r.value;
    return ok({
      accessToken: t.access_token,
      refreshToken: t.refresh_token,
      expiresAt: new Date(deps.nowMs() + t.expires_in * 1000),
      scopes: t.scope.split(" ").filter((s) => s !== ""),
    });
  }

  function pageUrl(path: string, params: Record<string, string | undefined>): string {
    const url = new URL(`${X_API_BASE}${path}`);
    for (const [k, v] of Object.entries(params)) if (v !== undefined) url.searchParams.set(k, v);
    return url.toString();
  }

  return {
    exchangeCode: (a, s) =>
      tokenCall(
        {
          grant_type: "authorization_code",
          code: a.code,
          redirect_uri: settings.redirectUri,
          code_verifier: a.codeVerifier,
        },
        ERROR_IDS.X_OAUTH_FAILED,
        s,
      ),
    refresh: (refreshToken, s) =>
      tokenCall(
        { grant_type: "refresh_token", refresh_token: refreshToken },
        ERROR_IDS.X_TOKEN_REFRESH_FAILED,
        s,
      ),
    async revoke(token, s) {
      const r = await xRequest(
        deps,
        {
          url: X_REVOKE_URL,
          method: "POST",
          headers: { Authorization: basic, "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ token, client_id: settings.clientId }).toString(),
        },
        s,
      );
      return r.ok ? ok(undefined) : r;
    },
    async getMe(accessToken, s) {
      const url = pageUrl("/2/users/me", { "user.fields": "profile_image_url" });
      const r = await call(get(url, accessToken), meResponseSchema, s);
      return r.ok ? ok(toUser(r.value.data)) : r;
    },
    async listConversations(accessToken, a, s) {
      const url = pageUrl("/2/chat/conversations", {
        max_results: String(a.maxResults),
        pagination_token: a.paginationToken,
        "chat_conversation.fields": "type,unread,newest_event_id",
        expansions: "participant_ids",
        "user.fields": "username,name,profile_image_url",
      });
      const r = await call(get(url, accessToken), conversationsResponseSchema, s);
      if (!r.ok) return r;
      const items: XChatConversation[] = r.value.data.map((c) => ({
        id: hyphenId(c.id),
        type: c.type,
        participantIds: c.participant_ids,
        unread: c.unread,
        newestEventId: c.newest_event_id ?? null,
      }));
      return ok(page(items, r.value.includes?.users, r.value.meta.next_token));
    },
    async listEvents(accessToken, a, s) {
      const url = pageUrl(
        `/2/chat/conversations/${encodeURIComponent(hyphenId(a.conversationId))}/events`,
        {
          max_results: String(a.maxResults),
          pagination_token: a.paginationToken,
        },
      );
      const r = await call(get(url, accessToken), eventsResponseSchema, s);
      if (!r.ok) return r;
      const items: XRawEvent[] = r.value.data.map((e) => ({
        id: e.id,
        conversationId: hyphenId(e.conversation_id),
        senderId: e.sender_id,
        createdAt: e.created_at,
        isTrusted: e.is_trusted ?? null,
        encodedEvent: e.encoded_event,
      }));
      return ok(page(items, r.value.includes?.users, r.value.meta.next_token));
    },
    async sendDm(accessToken, a, s) {
      const r = await call(
        {
          url: pageUrl(
            `/2/dm_conversations/with/${encodeURIComponent(a.participantId)}/messages`,
            {},
          ),
          method: "POST",
          headers: { Authorization: bearer(accessToken), "Content-Type": "application/json" },
          body: JSON.stringify({ text: a.text }),
          forbiddenIsSendRefusal: true,
        },
        sendResponseSchema,
        s,
      );
      if (!r.ok) return r;
      return ok({
        eventId: r.value.data.dm_event_id,
        conversationId: hyphenId(r.value.data.dm_conversation_id),
      });
    },
  };
}

function page<T>(
  items: T[],
  users: UserWire[] | undefined,
  next: string | null | undefined,
): XPage<T> {
  return { items, users: (users ?? []).map(toUser), nextToken: next ?? null };
}
