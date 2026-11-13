import { describe, expect, it } from "vitest";
import { ERROR_IDS } from "@/constants/errorIds";
import type { XDmSettings } from "./settings";
import { makeXClient } from "./xClient";

const settings: XDmSettings = {
  clientId: "cid",
  clientSecret: "csecret",
  redirectUri: "https://crm.example.test/api/x/oauth/callback",
};
const signal = new AbortController().signal;

function bodyText(seen: Seen | undefined): string {
  const b = seen?.init.body;
  return typeof b === "string" ? b : "";
}

interface Seen {
  url: URL;
  init: RequestInit;
}

function harness(respond: (seen: Seen) => Response) {
  const calls: Seen[] = [];
  const fetchStub = ((input: string | URL | Request, init?: RequestInit) => {
    const seen = { url: new URL(input instanceof Request ? input.url : input), init: init ?? {} };
    calls.push(seen);
    return Promise.resolve(respond(seen));
  }) as typeof fetch;
  const client = makeXClient({
    settings,
    fetch: fetchStub,
    sleep: () => Promise.resolve(),
    nowMs: () => 1_000_000,
  });
  return { client, calls };
}

describe("x client", () => {
  it("parses a conversations page with users", async () => {
    const { client, calls } = harness(() =>
      Response.json({
        data: [
          {
            id: "10:20",
            type: "direct",
            unread: true,
            newest_event_id: "99",
            participant_ids: ["20"],
          },
        ],
        includes: { users: [{ id: "20", name: "Pat Doe", username: "patdoe" }] },
        meta: { result_count: 1, has_more: true, next_token: "tok2" },
      }),
    );
    const r = await client.listConversations("at", { maxResults: 5 }, signal);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.items).toEqual([
      { id: "10-20", type: "direct", participantIds: ["20"], unread: true, newestEventId: "99" },
    ]);
    expect(r.value.users).toEqual([
      { id: "20", name: "Pat Doe", username: "patdoe", profileImageUrl: null },
    ]);
    expect(r.value.nextToken).toBe("tok2");
    const q = calls[0]?.url.searchParams;
    expect(q?.get("max_results")).toBe("5");
    expect(q?.get("chat_conversation.fields")).toBe("type,unread,newest_event_id");
    expect(q?.get("expansions")).toBe("participant_ids");
    expect(q?.get("user.fields")).toBe("username,name,profile_image_url");
    expect(calls[0]?.init.headers).toMatchObject({ Authorization: "Bearer at" });
  });

  it("uses the hyphenated id in the events path", async () => {
    const { client, calls } = harness(() =>
      Response.json({
        data: [
          {
            id: "e1",
            conversation_id: "10:20",
            sender_id: "20",
            created_at: "2026-11-01T10:00:00.000Z",
            encoded_event: "abc",
            is_trusted: true,
          },
        ],
        meta: { result_count: 1 },
      }),
    );
    const r = await client.listEvents(
      "at",
      { conversationId: "10:20", maxResults: 100, paginationToken: "p" },
      signal,
    );
    expect(calls[0]?.url.pathname).toBe("/2/chat/conversations/10-20/events");
    expect(calls[0]?.url.searchParams.get("pagination_token")).toBe("p");
    expect(r.ok && r.value.items[0]?.createdAt.toISOString()).toBe("2026-11-01T10:00:00.000Z");
    expect(r.ok && r.value.items[0]?.conversationId).toBe("10-20");
    expect(r.ok && r.value.nextToken).toBeNull();
  });

  it("maps 429 to X_RATE_LIMITED with resetAtMs", async () => {
    const { client } = harness(
      () => new Response("", { status: 429, headers: { "x-rate-limit-reset": "1800000000" } }),
    );
    const r = await client.getMe("at", signal);
    expect(!r.ok && r.error.id).toBe(ERROR_IDS.X_RATE_LIMITED);
    expect(!r.ok && r.error.context?.resetAtMs).toBe(1_800_000_000_000);
  });

  it("maps 401 to X_HTTP_FAILED with status 401", async () => {
    const { client } = harness(() => new Response("", { status: 401 }));
    const r = await client.getMe("at", signal);
    expect(!r.ok && r.error.id).toBe(ERROR_IDS.X_HTTP_FAILED);
    expect(!r.ok && r.error.context?.status).toBe(401);
  });

  it("maps a 403 send to X_SEND_REFUSED with detail", async () => {
    const { client, calls } = harness(() =>
      Response.json({ detail: "not verified", status: 403, title: "Forbidden" }, { status: 403 }),
    );
    const r = await client.sendDm("at", { participantId: "20", text: "hi" }, signal);
    expect(!r.ok && r.error.id).toBe(ERROR_IDS.X_SEND_REFUSED);
    expect(!r.ok && r.error.context?.detail).toBe("not verified");
    expect(calls[0]?.url.pathname).toBe("/2/dm_conversations/with/20/messages");
    expect(calls[0]?.init.body).toBe(JSON.stringify({ text: "hi" }));
  });

  it("returns the event and conversation ids from a send", async () => {
    const { client } = harness(() =>
      Response.json({ data: { dm_conversation_id: "10:20", dm_event_id: "e9" } }, { status: 201 }),
    );
    const r = await client.sendDm("at", { participantId: "20", text: "hi" }, signal);
    expect(r.ok && r.value).toEqual({ eventId: "e9", conversationId: "10-20" });
  });

  it("sends basic auth on token refresh and computes expiry", async () => {
    const { client, calls } = harness(() =>
      Response.json({
        token_type: "bearer",
        expires_in: 7200,
        access_token: "new-at",
        refresh_token: "new-rt",
        scope: "dm.read dm.write",
      }),
    );
    const r = await client.refresh("old-rt", signal);
    const expected = `Basic ${Buffer.from("cid:csecret").toString("base64")}`;
    expect(calls[0]?.init.headers).toMatchObject({ Authorization: expected });
    expect(calls[0]?.url.href).toBe("https://api.x.com/2/oauth2/token");
    const body = new URLSearchParams(bodyText(calls[0]));
    expect(body.get("grant_type")).toBe("refresh_token");
    expect(body.get("refresh_token")).toBe("old-rt");
    expect(r.ok && r.value.expiresAt.getTime()).toBe(1_000_000 + 7_200_000);
    expect(r.ok && r.value.scopes).toEqual(["dm.read", "dm.write"]);
    expect(r.ok && r.value.refreshToken).toBe("new-rt");
  });

  it("exchanges a code with the verifier and redirect uri", async () => {
    const { client, calls } = harness(() =>
      Response.json({ expires_in: 60, access_token: "a", refresh_token: "r", scope: "dm.read" }),
    );
    await client.exchangeCode({ code: "c", codeVerifier: "v" }, signal);
    const body = new URLSearchParams(bodyText(calls[0]));
    expect(body.get("grant_type")).toBe("authorization_code");
    expect(body.get("code_verifier")).toBe("v");
    expect(body.get("redirect_uri")).toBe(settings.redirectUri);
  });

  it("revokes with basic auth", async () => {
    const { client, calls } = harness(() => Response.json({ revoked: true }));
    const r = await client.revoke("tok", signal);
    expect(r.ok).toBe(true);
    expect(calls[0]?.url.href).toBe("https://api.x.com/2/oauth2/revoke");
    expect(calls[0]?.init.headers).toMatchObject({
      Authorization: `Basic ${Buffer.from("cid:csecret").toString("base64")}`,
    });
  });

  it("requests the avatar field on getMe", async () => {
    const { client, calls } = harness(() =>
      Response.json({ data: { id: "1", name: "N", username: "u", profile_image_url: "http://i" } }),
    );
    const r = await client.getMe("at", signal);
    expect(calls[0]?.url.searchParams.get("user.fields")).toBe("profile_image_url");
    expect(r.ok && r.value.profileImageUrl).toBe("http://i");
  });

  it("keeps a page whose conversations include an unknown type", async () => {
    const { client } = harness(() =>
      Response.json({
        data: [
          { id: "10:30", type: "broadcast", newest_event_id: "98", participant_ids: ["30"] },
          { id: "10:20", type: "direct", newest_event_id: "97", participant_ids: ["20"] },
        ],
        meta: {},
      }),
    );
    const r = await client.listConversations("at", { maxResults: 5 }, signal);
    expect(r.ok && r.value.items.map((c) => [c.id, c.type])).toEqual([
      ["10-30", "broadcast"],
      ["10-20", "direct"],
    ]);
  });

  it("rejects a malformed page with X_PARSE_FAILED", async () => {
    const { client } = harness(() => Response.json({ data: [{ id: 5, type: "weird" }], meta: {} }));
    const r = await client.listConversations("at", { maxResults: 5 }, signal);
    expect(!r.ok && r.error.id).toBe(ERROR_IDS.X_PARSE_FAILED);
  });
});
