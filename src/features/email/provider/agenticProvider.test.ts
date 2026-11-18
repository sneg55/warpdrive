import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ok } from "@/types/result";
import { fakeAgenticProvider } from "../agentic.test-helpers";
import { type FakeAgenticServer, startFakeAgenticServer } from "./agenticFakeServer";
import type { OutboundMessage } from "./types";

const MAILBOX = "media@example.com";
const signal = () => AbortSignal.timeout(8000);

let fake: FakeAgenticServer;
beforeEach(async () => {
  fake = await startFakeAgenticServer({ mailbox: MAILBOX });
});
afterEach(async () => {
  await fake.close();
});

function outbound(partial: Partial<OutboundMessage> = {}): OutboundMessage {
  return {
    from: MAILBOX,
    fromName: null,
    to: ["jane@acme.com"],
    cc: [],
    bcc: [],
    subject: "Re: Hello",
    html: "<p>Hi</p>",
    text: null,
    messageIdHeader: "<ignored@warpdrive>",
    providerThreadId: null,
    attachments: [],
    attemptId: "attempt-1",
    ...partial,
  };
}

describe("agenticProvider", () => {
  it("has no Gmail client and sends idempotently", () => {
    const { provider, client } = fakeAgenticProvider(fake);
    expect([provider.kind, provider.idempotentSend, provider.gmail]).toEqual([
      "agentic_inbox",
      true,
      null,
    ]);
    expect(provider.agentic).toBe(client);
  });

  it("fetchParsed returns null for a missing message and for a draft", async () => {
    const { provider } = fakeAgenticProvider(fake);
    fake.seedEmail({ id: "d1", folder: "draft" });
    fake.seedEmail({ id: "m1" });
    expect(await provider.fetchParsed({ id: "gone", signal: signal() })).toEqual(ok(null));
    expect(await provider.fetchParsed({ id: "d1", signal: signal() })).toEqual(ok(null));
    const m1 = await provider.fetchParsed({ id: "m1", signal: signal() });
    expect(m1.ok && m1.value?.gmailMessageId).toBe("m1");
  });

  it("replyHeaders chains the parent's references and message id in angle brackets", async () => {
    const { provider } = fakeAgenticProvider(fake);
    fake.seedEmail({
      id: "p1",
      message_id: "c@acme",
      email_references: JSON.stringify(["a@acme", "<b@acme>"]),
    });
    fake.seedEmail({ id: "p2", message_id: "<only@acme>", email_references: null });
    fake.seedEmail({ id: "p3", message_id: null });
    const reply = (id: string) =>
      provider.replyHeaders({ parentProviderMessageId: id, signal: signal() });
    expect(await reply("p1")).toEqual({
      inReplyTo: "<c@acme>",
      references: "<a@acme> <b@acme> <c@acme>",
    });
    expect(await reply("p2")).toEqual({ inReplyTo: "<only@acme>", references: "<only@acme>" });
    expect(await reply("p3")).toEqual({});
    expect(await reply("missing")).toEqual({});
  });

  it("send posts JSON with client_ref, thread_id, bare threading ids and base64 attachments", async () => {
    const { provider } = fakeAgenticProvider(fake);
    const sent = await provider.send({
      message: outbound({
        providerThreadId: "t-9",
        inReplyTo: "<c@acme>",
        references: "<a@acme> <c@acme>",
        cc: ["bob@acme.com"],
        attachments: [{ filename: "a.txt", contentType: "text/plain", bytes: Buffer.from("hi") }],
      }),
      signal: signal(),
    });
    expect(sent).toEqual(
      ok({ kind: "sent", providerMessageId: "sent-1", providerThreadId: "t-9" }),
    );
    expect(fake.sendBodies()[0]).toEqual({
      to: ["jane@acme.com"],
      from: MAILBOX,
      subject: "Re: Hello",
      html: "<p>Hi</p>",
      cc: ["bob@acme.com"],
      client_ref: "attempt-1",
      thread_id: "t-9",
      in_reply_to: "c@acme",
      references: ["a@acme", "c@acme"],
      attachments: [
        { content: "aGk=", filename: "a.txt", type: "text/plain", disposition: "attachment" },
      ],
    });
  });

  it("send maps each worker answer to an outcome and never to an err", async () => {
    const { provider } = fakeAgenticProvider(fake);
    const kindOf = async (attemptId: string) => {
      const r = await provider.send({ message: outbound({ attemptId }), signal: signal() });
      return r.ok
        ? [r.value.kind, "error" in r.value ? r.value.error.id : null]
        : ["err", r.error.id];
    };
    fake.setNextSend({ kind: "limit", retryAfter: 120 });
    expect(await kindOf("a")).toEqual(["retry_later", "E_AINBOX_004"]);
    fake.setNextSend({ kind: "permanent", code: "E_BAD" });
    expect(await kindOf("b")).toEqual(["rejected", "E_AINBOX_006"]);
    fake.setNextSend({ kind: "unknown" });
    expect(await kindOf("c")).toEqual(["unknown", "E_AINBOX_010"]);
    fake.setAuthMode("redirect");
    expect(await kindOf("d")).toEqual(["rejected", "E_AINBOX_001"]);
    fake.setAuthMode("ok");
    fake.setMailboxExists(false);
    expect(await kindOf("e")).toEqual(["rejected", "E_AINBOX_006"]);
  });

  it("a 503 is a temporary error, E_AINBOX_005, while a bare 429 stays E_AINBOX_004", async () => {
    const { provider } = fakeAgenticProvider(fake);
    const send = async (attemptId: string) => {
      const r = await provider.send({ message: outbound({ attemptId }), signal: signal() });
      return r.ok && r.value.kind === "retry_later" ? [r.value.error.id, r.value.notBefore] : r;
    };
    fake.setNextSend({ kind: "temporary", code: "E_TEMP" });
    expect(await send("t")).toEqual(["E_AINBOX_005", null]);
    fake.setNextSend({ kind: "limit", retryAfter: null });
    expect(await send("l")).toEqual(["E_AINBOX_004", null]);
  });

  it("send sets notBefore from Retry-After", async () => {
    const { provider } = fakeAgenticProvider(fake);
    fake.setNextSend({ kind: "limit", retryAfter: 120 });
    const before = Date.now();
    const r = await provider.send({ message: outbound(), signal: signal() });
    const notBefore = r.ok && r.value.kind === "retry_later" ? r.value.notBefore : null;
    expect(notBefore?.getTime()).toBeGreaterThanOrEqual(before + 120_000);
  });

  it("sentCopy reads the thread and a snippet from the stored body", async () => {
    const { provider } = fakeAgenticProvider(fake);
    fake.seedEmail({ id: "s1", thread_id: null, body: "<div>Thanks &amp; regards</div>" });
    expect(await provider.sentCopy({ providerMessageId: "s1", signal: signal() })).toEqual(
      ok({ threadId: "s1", snippet: "Thanks & regards" }),
    );
  });

  it("getAttachment returns base64url bytes", async () => {
    const { provider } = fakeAgenticProvider(fake);
    fake.setAttachment("m1", "a1", new Uint8Array([0xfb, 0xff]));
    expect(
      await provider.getAttachment({ messageId: "m1", attachmentId: "a1", signal: signal() }),
    ).toEqual(ok({ dataBase64: Buffer.from([0xfb, 0xff]).toString("base64url") }));
  });
});
