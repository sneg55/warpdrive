import { describe, expect, it } from "vitest";
import { ok } from "@/types/result";
import { FakeGmailClient } from "./gmailFake";
import { sendGmail } from "./send";

const account = { id: "acc-1", userId: "u-1", emailAddress: "owner@gunsnation.com" };
const newSignal = (): AbortSignal => new AbortController().signal;

describe("sendGmail (system-send primitive)", () => {
  it("builds MIME, calls sendRaw, and returns the gmail message id", async () => {
    const fake = new FakeGmailClient();
    fake.sendImpl = () => ok({ id: "sys-out-1", threadId: "th-1" });
    const r = await sendGmail(
      account,
      { to: ["you@y.com"], subject: "System alert", bodyHtml: "<p>hi</p>", bodyText: "hi" },
      newSignal(),
      { resolveClient: () => Promise.resolve(ok(fake)) }, // inject fake transport; no DB, no OAuth
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.gmailMessageId).toBe("sys-out-1");

    const send = fake.calls.find((c) => c.method === "sendRaw");
    expect(send).toBeTruthy();
    const raw = (send?.args as { rawBase64: string }).rawBase64;
    const mime = Buffer.from(raw, "base64url").toString("utf8");
    expect(mime).toContain("Subject: System alert");
    expect(mime).toContain("To: you@y.com");
    // Domain comes from env.GOOGLE_WORKSPACE_DOMAIN (example.com in the test env, per
    // vitest.setup.ts); deriveMessageId is <accountId.idempotencyKey@domain>.
    expect(mime).toMatch(/Message-ID: <acc-1\..*@example\.com>/);
  });

  it("threads the reply when threadId is supplied", async () => {
    const fake = new FakeGmailClient();
    fake.sendImpl = () => ok({ id: "sys-out-2", threadId: "th-9" });
    const r = await sendGmail(
      account,
      { to: ["you@y.com"], subject: "Re: x", bodyHtml: "<p>r</p>", threadId: "th-9" },
      newSignal(),
      { resolveClient: () => Promise.resolve(ok(fake)) },
    );
    expect(r.ok).toBe(true);
    const send = fake.calls.find((c) => c.method === "sendRaw");
    expect((send?.args as { threadId?: string }).threadId).toBe("th-9");
  });

  it("propagates a transport error as a Result (never throws)", async () => {
    const fake = new FakeGmailClient();
    fake.sendImpl = () => ({ ok: false, error: { id: "E_GMAIL_001" } }) as never;
    const r = await sendGmail(
      account,
      { to: ["you@y.com"], subject: "x", bodyHtml: "<p>x</p>" },
      newSignal(),
      { resolveClient: () => Promise.resolve(ok(fake)) },
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.id).toBe("E_GMAIL_001");
  });
});
