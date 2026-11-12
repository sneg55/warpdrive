import { describe, expect, it } from "vitest";
import { ERROR_IDS } from "@/constants/errorIds";
import { INTERCOM_API_VERSION } from "@/constants/intercom";
import { isTransientIntercomError, makeIntercomClient } from "./intercomClient";

const SIG = (): AbortSignal => new AbortController().signal;

interface Call {
  url: string;
  init: RequestInit;
}

function bodyOf(call: Call | undefined): unknown {
  const body = call?.init.body;
  return typeof body === "string" ? JSON.parse(body) : undefined;
}

function harness(responses: Array<() => Response>) {
  const calls: Call[] = [];
  const sleeps: number[] = [];
  let i = 0;
  const client = makeIntercomClient({
    token: "test-token",
    baseUrl: "https://api.eu.intercom.io",
    fetch: (url, init) => {
      calls.push({ url: String(url), init: init ?? {} });
      const next = responses[Math.min(i, responses.length - 1)];
      i += 1;
      if (next === undefined) return Promise.reject(new TypeError("no response"));
      return Promise.resolve(next());
    },
    sleep: (ms) => {
      sleeps.push(ms);
      return Promise.resolve();
    },
    nowMs: () => 1_700_000_000_000,
  });
  return { client, calls, sleeps };
}

describe("makeIntercomClient", () => {
  it("searches by updated_at ascending with the pinned version and bearer token", async () => {
    const h = harness([
      () =>
        Response.json({
          type: "conversation.list",
          conversations: [{ id: "1", updated_at: 1700 }],
          pages: { next: { starting_after: "abc" } },
        }),
    ]);
    const r = await h.client.searchConversations(
      { updatedAfter: 1600, startingAfter: null },
      SIG(),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.items).toEqual([{ id: "1", updatedAt: 1700 }]);
    expect(r.value.nextCursor).toBe("abc");
    const call = h.calls[0];
    expect(call?.url).toBe("https://api.eu.intercom.io/conversations/search");
    const headers = new Headers(call?.init.headers);
    expect(headers.get("authorization")).toBe("Bearer test-token");
    expect(headers.get("intercom-version")).toBe(INTERCOM_API_VERSION);
    expect(call?.init.signal).toBeDefined();
    expect(bodyOf(call)).toEqual({
      query: { field: "updated_at", operator: ">", value: 1600 },
      sort: { field: "updated_at", order: "ascending" },
      pagination: { per_page: 150 },
    });
  });

  it("passes the starting_after cursor on later pages and reports the last page", async () => {
    const h = harness([() => Response.json({ conversations: [] })]);
    const r = await h.client.searchConversations({ updatedAfter: 1, startingAfter: "abc" }, SIG());
    expect(r.ok && r.value.nextCursor).toBeNull();
    expect(bodyOf(h.calls[0])).toMatchObject({
      pagination: { per_page: 150, starting_after: "abc" },
    });
  });

  it("drops a search item with no id instead of failing the page", async () => {
    const h = harness([
      () => Response.json({ conversations: [{ updated_at: 5 }, { id: 7, updated_at: 6 }] }),
    ]);
    const r = await h.client.searchConversations({ updatedAfter: 1, startingAfter: null }, SIG());
    expect(r.ok && r.value.items).toEqual([{ id: "7", updatedAt: 6 }]);
  });

  it("waits until X-RateLimit-Reset on a 429, then retries", async () => {
    const h = harness([
      () => new Response("", { status: 429, headers: { "X-RateLimit-Reset": "1700000003" } }),
      () => Response.json({ type: "contact", id: "k1", email: "Pat@Example.com", role: "user" }),
    ]);
    const r = await h.client.getContact("k1", SIG());
    expect(r.ok && r.value).toEqual({ id: "k1", email: "Pat@Example.com", role: "user" });
    expect(h.sleeps).toEqual([3_000]);
    expect(h.calls).toHaveLength(2);
  });

  it("backs off exponentially without a reset header and gives up as a transient error", async () => {
    const h = harness([() => new Response("", { status: 429 })]);
    const r = await h.client.getConversation("c1", SIG());
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.id).toBe(ERROR_IDS.INTERCOM_RATE_LIMITED);
    expect(isTransientIntercomError(r.error)).toBe(true);
    expect(h.sleeps).toEqual([1_000, 2_000, 4_000, 8_000, 16_000]);
  });

  it("maps 404 and 410 to a permanent not-found error", async () => {
    for (const status of [404, 410]) {
      const h = harness([() => new Response("", { status })]);
      const r = await h.client.getContact("k1", SIG());
      expect(r.ok).toBe(false);
      if (r.ok) continue;
      expect(r.error.id).toBe(ERROR_IDS.INTERCOM_NOT_FOUND);
      expect(isTransientIntercomError(r.error)).toBe(false);
    }
  });

  it("treats a 5xx and a network failure as transient, a 401 as permanent", async () => {
    const server = await harness([() => new Response("", { status: 503 })]).client.getContact(
      "k",
      SIG(),
    );
    expect(!server.ok && isTransientIntercomError(server.error)).toBe(true);
    const net = await harness([]).client.getContact("k", SIG());
    expect(!net.ok && net.error.id).toBe(ERROR_IDS.INTERCOM_NETWORK_FAILED);
    expect(!net.ok && isTransientIntercomError(net.error)).toBe(true);
    const denied = await harness([() => new Response("", { status: 401 })]).client.getContact(
      "k",
      SIG(),
    );
    expect(!denied.ok && isTransientIntercomError(denied.error)).toBe(false);
  });

  it("reports a malformed body as a parse error", async () => {
    const h = harness([() => Response.json({ id: 5, state: 42 })]);
    const r = await h.client.getConversation("c1", SIG());
    expect(!r.ok && r.error.id).toBe(ERROR_IDS.INTERCOM_PARSE_FAILED);
  });

  it("parses a conversation leniently, keeping unknown keys out of the typed shape", async () => {
    const h = harness([
      () =>
        Response.json({
          type: "conversation",
          id: "c1",
          title: null,
          state: "open",
          created_at: 100,
          updated_at: 200,
          extra_field: { nested: true },
          source: { id: "s1", body: "<p>Hi</p>", author: { type: "user", name: "Pat" } },
          contacts: { contacts: [{ id: "k1" }, { type: "contact" }] },
          conversation_parts: {
            conversation_parts: [
              { id: "p1", part_type: "comment", body: "<p>Yo</p>", created_at: 150 },
            ],
          },
        }),
    ]);
    const r = await h.client.getConversation("c1", SIG());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.id).toBe("c1");
    expect(r.value.contactIds).toEqual(["k1"]);
    expect(r.value.parts).toHaveLength(1);
    expect(r.value.source?.body).toBe("<p>Hi</p>");
  });
});
