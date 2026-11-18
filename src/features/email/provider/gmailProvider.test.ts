import { describe, expect, it } from "vitest";
import { GMAIL_DRAFT_LABEL } from "@/constants/email";
import { AppError } from "@/constants/errorIds";
import { err, ok } from "@/types/result";
import { FakeGmailClient } from "../gmailFake";
import { gmailProvider } from "./gmailProvider";
import type { OutboundMessage } from "./types";

const signal = new AbortController().signal;

function outbound(overrides: Partial<OutboundMessage> = {}): OutboundMessage {
  return {
    from: "me@acme.com",
    fromName: null,
    to: ["you@example.com"],
    cc: [],
    bcc: [],
    subject: "Hello",
    html: "<p>hi</p>",
    text: null,
    messageIdHeader: "<attempt-1@warpdrive>",
    providerThreadId: null,
    attachments: [],
    attemptId: "attempt-1",
    ...overrides,
  };
}

describe("gmailProvider", () => {
  it("fetchParsed skips drafts", async () => {
    const fake = new FakeGmailClient();
    fake.messages.set("d1", { id: "d1", threadId: "t1", labelIds: [GMAIL_DRAFT_LABEL] });
    fake.messages.set("m1", { id: "m1", threadId: "t2", labelIds: ["INBOX"], snippet: "s" });
    const provider = gmailProvider(fake);

    const draft = await provider.fetchParsed({ id: "d1", signal });
    const real = await provider.fetchParsed({ id: "m1", signal });

    expect(draft).toEqual(ok(null));
    expect(real.ok && real.value?.gmailMessageId).toBe("m1");
    expect(real.ok && real.value?.threadId).toBe("t2");
  });

  it("fetchParsed returns null for a gone message", async () => {
    const fake = new FakeGmailClient();
    fake.getMessage = () =>
      Promise.resolve(err(new AppError("E_GMAIL_001", "gmail call failed", { status: 404 })));

    const r = await gmailProvider(fake).fetchParsed({ id: "gone", signal });

    expect(r).toEqual(ok(null));
  });

  it("send maps a 400 to rejected and a 500 to unknown", async () => {
    const fake = new FakeGmailClient();
    const provider = gmailProvider(fake);

    fake.sendImpl = () => err(new AppError("E_GMAIL_001", "bad request", { status: 400 }));
    const rejected = await provider.send({ message: outbound(), signal });
    fake.sendImpl = () => err(new AppError("E_GMAIL_001", "server error", { status: 500 }));
    const unknown = await provider.send({ message: outbound(), signal });
    fake.sendImpl = () => ok({ id: "sent-9", threadId: "t9" });
    const sent = await provider.send({ message: outbound(), signal });

    expect(rejected.ok && rejected.value.kind).toBe("rejected");
    expect(unknown.ok && unknown.value.kind).toBe("unknown");
    expect(sent).toEqual(ok({ kind: "sent", providerMessageId: "sent-9", providerThreadId: "t9" }));
  });

  it("send passes the attempt Message-ID header into the MIME", async () => {
    const fake = new FakeGmailClient();

    await gmailProvider(fake).send({
      message: outbound({ providerThreadId: "thread-7", inReplyTo: "<parent@x>" }),
      signal,
    });

    const call = fake.calls.find((c) => c.method === "sendRaw");
    const args = call?.args as { rawBase64: string; threadId?: string };
    const mime = Buffer.from(args.rawBase64, "base64url").toString("utf8");
    expect(mime).toContain("Message-ID: <attempt-1@warpdrive>");
    expect(mime).toContain("In-Reply-To: <parent@x>");
    expect(args.threadId).toBe("thread-7");
  });

  it("sentCopy returns threadId and snippet", async () => {
    const fake = new FakeGmailClient();
    fake.messages.set("m1", { id: "m1", threadId: "t5", labelIds: ["SENT"], snippet: "hello" });

    const r = await gmailProvider(fake).sentCopy({ providerMessageId: "m1", signal });

    expect(r).toEqual(ok({ threadId: "t5", snippet: "hello" }));
  });
});
