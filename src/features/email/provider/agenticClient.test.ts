import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ERROR_IDS } from "@/constants/errorIds";
import { type AgenticClient, createAgenticClient } from "./agenticClient";
import { type FakeAgenticServer, startFakeAgenticServer } from "./agenticFakeServer";

const signal = new AbortController().signal;
const sendBody = { to: "you@example.com", subject: "Hi", html: "<p>x</p>", client_ref: "ref-1" };

let fake: FakeAgenticServer;
let client: AgenticClient;

function clientFor(baseUrl: string) {
  return createAgenticClient({
    baseUrl,
    mailbox: "me@example.com",
    clientId: "id-1",
    clientSecret: "secret-1",
  });
}

beforeEach(async () => {
  fake = await startFakeAgenticServer({ mailbox: "me@example.com" });
  client = clientFor(fake.url);
});

afterEach(async () => {
  await fake.close();
});

function errId(r: { ok: boolean; error?: { id: string } }) {
  return r.ok ? null : r.error?.id;
}

describe("agenticClient", () => {
  it("a 302 maps to E_AINBOX_001", async () => {
    fake.setAuthMode("redirect");
    expect(errId(await client.getMailbox(signal))).toBe(ERROR_IDS.AINBOX_AUTH_FAILED);
  });

  it("a 403 maps to E_AINBOX_001", async () => {
    fake.setAuthMode("forbidden");
    expect(errId(await client.head(signal))).toBe(ERROR_IDS.AINBOX_AUTH_FAILED);
  });

  it("capabilities without warpdrive maps to E_AINBOX_002", async () => {
    fake.setCapabilities({ other: true });
    expect(errId(await client.capabilities(signal))).toBe(ERROR_IDS.AINBOX_NOT_FORK);
  });

  it("capabilities with warpdrive 1 is ok", async () => {
    const r = await client.capabilities(signal);
    expect(r.ok && r.value.warpdrive).toBe(1);
  });

  it("a 404 mailbox maps to E_AINBOX_003", async () => {
    fake.setMailboxExists(false);
    expect(errId(await client.getMailbox(signal))).toBe(ERROR_IDS.AINBOX_MAILBOX_NOT_FOUND);
  });

  it("every request carries the access headers", async () => {
    await client.getMailbox(signal);
    const h = fake.requestHeaders()[0];
    expect(h?.["cf-access-client-id"]).toBe("id-1");
    expect(h?.["cf-access-client-secret"]).toBe("secret-1");
  });

  it("send 200 returns sent and counts one delivery per client_ref", async () => {
    const a = await client.send({ body: sendBody, signal });
    const b = await client.send({ body: sendBody, signal });
    expect(a.ok && a.value.status).toBe("sent");
    expect(b).toEqual(a);
    expect(fake.deliveries("ref-1")).toBe(1);
  });

  it("send 429 with Retry-After 120 returns retry_later 120", async () => {
    fake.setNextSend({ kind: "limit", retryAfter: 120 });
    const r = await client.send({ body: sendBody, signal });
    expect(r.ok && r.value).toEqual({
      status: "retry_later",
      reason: "limit",
      retryAfterSeconds: 120,
    });
  });

  it("send 503 returns retry_later null", async () => {
    fake.setNextSend({ kind: "temporary", code: "E_RATE_LIMIT_EXCEEDED" });
    const r = await client.send({ body: sendBody, signal });
    expect(r.ok && r.value).toEqual({
      status: "retry_later",
      reason: "temporary",
      retryAfterSeconds: null,
    });
  });

  it("send 422 returns rejected with the code", async () => {
    fake.setNextSend({ kind: "permanent", code: "E_RECIPIENT_NOT_ALLOWED" });
    const r = await client.send({ body: sendBody, signal });
    expect(r.ok && r.value).toEqual({ status: "rejected", code: "E_RECIPIENT_NOT_ALLOWED" });
  });

  it("send 409 returns unknown", async () => {
    fake.setNextSend({ kind: "unknown" });
    const r = await client.send({ body: sendBody, signal });
    expect(r.ok && r.value).toEqual({ status: "unknown" });
  });

  it("send 400 returns rejected", async () => {
    fake.setNextSend({ kind: "bad_request" });
    const r = await client.send({ body: sendBody, signal });
    expect(r.ok && r.value).toEqual({ status: "rejected", code: null });
  });

  it("send 404 returns rejected", async () => {
    fake.setNextSend({ kind: "not_found" });
    const r = await client.send({ body: sendBody, signal });
    expect(r.ok && r.value).toEqual({ status: "rejected", code: null });
  });

  it("send 500 returns unknown", async () => {
    fake.setNextSend({ kind: "server_error", status: 500 });
    const r = await client.send({ body: sendBody, signal });
    expect(r.ok && r.value).toEqual({ status: "unknown" });
  });

  it("send 502 returns unknown", async () => {
    fake.setNextSend({ kind: "server_error", status: 502 });
    const r = await client.send({ body: sendBody, signal });
    expect(r.ok && r.value).toEqual({ status: "unknown" });
  });

  it("a malformed send body gets a 400 from the fake and maps to rejected", async () => {
    const res = await fetch(`${fake.url}/api/v1/mailboxes/me%40example.com/emails`, {
      method: "POST",
      body: "{not json",
      signal,
    });
    expect(res.status).toBe(400);
  });

  it("getEmail 404 maps to E_AINBOX_011", async () => {
    expect(errId(await client.getEmail({ id: "missing", signal }))).toBe(
      ERROR_IDS.AINBOX_MESSAGE_NOT_FOUND,
    );
  });

  it("getAttachment 404 maps to E_AINBOX_011", async () => {
    fake.seedEmail({ id: "e1" });
    expect(errId(await client.getAttachment({ emailId: "e1", attachmentId: "nope", signal }))).toBe(
      ERROR_IDS.AINBOX_MESSAGE_NOT_FOUND,
    );
  });

  it("changes pages through seeded emails and head returns the max seq", async () => {
    fake.seedEmail({ id: "e1" });
    fake.seedEmail({ id: "e2", folder: "sent" });
    const page = await client.changes({ after: 0, limit: 1, signal });
    expect(page.ok && page.value.emails.map((e) => e.id)).toEqual(["e1"]);
    const rest = await client.changes({ after: page.ok ? page.value.cursor : 0, limit: 5, signal });
    expect(rest.ok && rest.value.emails.map((e) => e.id)).toEqual(["e2"]);
    const head = await client.head(signal);
    expect(head.ok && head.value).toBe(2);
  });

  it("getEmail and getAttachment read a seeded email", async () => {
    fake.seedEmail({ id: "e1" });
    fake.setAttachment("e1", "a1", new Uint8Array([1, 2, 3]));
    const one = await client.getEmail({ id: "e1", signal });
    const bytes = await client.getAttachment({ emailId: "e1", attachmentId: "a1", signal });
    expect(one.ok && one.value.id).toBe("e1");
    expect(bytes.ok && Array.from(bytes.value)).toEqual([1, 2, 3]);
  });

  it("a malformed changes body maps to E_AINBOX_008", async () => {
    fake.setChangesBody({ emails: [{ id: 5 }], cursor: "x" });
    expect(errId(await client.changes({ after: 0, limit: 10, signal }))).toBe(
      ERROR_IDS.AINBOX_SCHEMA_FAILED,
    );
  });

  it("a connection refused maps to E_AINBOX_009", async () => {
    const dead = await startFakeAgenticServer();
    const url = dead.url;
    await dead.close();
    expect(errId(await clientFor(url).head(signal))).toBe(ERROR_IDS.AINBOX_TRANSPORT_FAILED);
  });

  it("an aborted signal rejects with AbortError", async () => {
    const ac = new AbortController();
    ac.abort();
    await expect(client.head(ac.signal)).rejects.toMatchObject({ name: "AbortError" });
  });
});
