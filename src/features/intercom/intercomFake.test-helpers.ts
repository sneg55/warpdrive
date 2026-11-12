import { makeIntercomClient } from "./intercomClient";
import type { IntercomClient } from "./types";

export interface FakeContact {
  id: string;
  email: string | null;
  role?: string;
}

export interface FakeConversation {
  id: string;
  updated_at: number;
  created_at?: number;
  title?: string | null;
  state?: string;
  source?: Record<string, unknown> | null;
  contacts: string[];
  parts?: Array<Record<string, unknown>>;
}

export interface IntercomFake {
  conversations: Map<string, FakeConversation>;
  contacts: Map<string, FakeContact>;
  failConversation: Map<string, number>;
  failContact: Map<string, number>;
  malformedConversation: Set<string>;
  failSearch: number | null;
  requests: string[];
  onRequest: (path: string) => void;
  client: IntercomClient;
}

function searchPage(fake: IntercomFake, body: unknown): Response {
  if (fake.failSearch !== null) return new Response("", { status: fake.failSearch });
  const b = body as {
    query: { value: number };
    pagination: { per_page: number; starting_after?: string };
  };
  const all = [...fake.conversations.values()]
    .filter((c) => c.updated_at >= b.query.value)
    .sort((a, z) => a.updated_at - z.updated_at || a.id.localeCompare(z.id));
  const start = b.pagination.starting_after === undefined ? 0 : Number(b.pagination.starting_after);
  const slice = all.slice(start, start + b.pagination.per_page);
  const end = start + slice.length;
  return Response.json({
    type: "conversation.list",
    conversations: slice.map((c) => ({ id: c.id, updated_at: c.updated_at })),
    total_count: all.length,
    pages: end < all.length ? { next: { starting_after: String(end) } } : {},
  });
}

function conversationBody(c: FakeConversation): Record<string, unknown> {
  return {
    type: "conversation",
    id: c.id,
    title: c.title ?? null,
    state: c.state ?? "open",
    created_at: c.created_at ?? c.updated_at - 100,
    updated_at: c.updated_at,
    source: c.source ?? null,
    contacts: { type: "contact.list", contacts: c.contacts.map((id) => ({ type: "contact", id })) },
    conversation_parts: { type: "conversation_part.list", conversation_parts: c.parts ?? [] },
  };
}

function route(fake: IntercomFake, path: string, init: RequestInit): Response {
  if (path === "/conversations/search") {
    return searchPage(fake, JSON.parse(typeof init.body === "string" ? init.body : "{}"));
  }
  const conv = /^\/conversations\/(.+)$/.exec(path);
  if (conv?.[1] !== undefined) {
    const id = decodeURIComponent(conv[1]);
    const status = fake.failConversation.get(id);
    if (status !== undefined) return new Response("", { status });
    if (fake.malformedConversation.has(id)) return Response.json({ id, state: 7 });
    const c = fake.conversations.get(id);
    return c === undefined ? new Response("", { status: 404 }) : Response.json(conversationBody(c));
  }
  const contact = /^\/contacts\/(.+)$/.exec(path);
  if (contact?.[1] !== undefined) {
    const id = decodeURIComponent(contact[1]);
    const status = fake.failContact.get(id);
    if (status !== undefined) return new Response("", { status });
    const k = fake.contacts.get(id);
    return k === undefined
      ? new Response("", { status: 404 })
      : Response.json({ type: "contact", id, email: k.email, role: k.role ?? "user" });
  }
  return new Response("", { status: 404 });
}

export function makeIntercomFake(): IntercomFake {
  const fake: IntercomFake = {
    conversations: new Map(),
    contacts: new Map(),
    failConversation: new Map(),
    failContact: new Map(),
    malformedConversation: new Set(),
    failSearch: null,
    requests: [],
    onRequest: () => {},
    client: undefined as unknown as IntercomClient,
  };
  fake.client = makeIntercomClient({
    token: "test-token",
    baseUrl: "https://api.intercom.test",
    fetch: (url, init) => {
      const path = url.replace("https://api.intercom.test", "");
      fake.requests.push(path);
      fake.onRequest(path);
      init.signal?.throwIfAborted();
      return Promise.resolve(route(fake, path, init));
    },
    sleep: () => Promise.resolve(),
    nowMs: () => Date.now(),
  });
  return fake;
}

export function comment(id: string, createdAt: number, body = `<p>${id}</p>`) {
  return {
    type: "conversation_part",
    id,
    part_type: "comment",
    body,
    created_at: createdAt,
    author: { type: "admin", name: "Agent", email: "agent@example.com" },
    redacted: false,
  };
}

export function source(body: string, authorName = "Pat Customer") {
  return {
    type: "conversation",
    id: "s",
    delivered_as: "customer_initiated",
    body,
    author: { type: "user", name: authorName, email: "pat@example.com" },
    redacted: false,
  };
}
