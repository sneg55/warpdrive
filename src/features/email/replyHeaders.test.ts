import { describe, expect, it } from "vitest";
import type { GmailMessage } from "./gmailSchemas";
import { replyThreadHeaders } from "./replyHeaders";

const parent = (headers: { name: string; value: string }[]): GmailMessage => ({
  id: "m1",
  threadId: "t1",
  labelIds: [],
  payload: { headers },
});

describe("replyThreadHeaders", () => {
  it("threads on the parent Message-ID", () => {
    const h = replyThreadHeaders(parent([{ name: "Message-ID", value: "<a@ex.com>" }]));
    expect(h).toEqual({ inReplyTo: "<a@ex.com>", references: "<a@ex.com>" });
  });

  it("matches the Message-Id header case-insensitively", () => {
    const h = replyThreadHeaders(parent([{ name: "message-id", value: "<a@ex.com>" }]));
    expect(h.inReplyTo).toBe("<a@ex.com>");
  });

  it("appends the parent to its existing References chain", () => {
    const h = replyThreadHeaders(
      parent([
        { name: "Message-ID", value: "<c@ex.com>" },
        { name: "References", value: "<a@ex.com> <b@ex.com>" },
      ]),
    );
    expect(h.references).toBe("<a@ex.com> <b@ex.com> <c@ex.com>");
  });

  it("does not repeat the parent when the chain already ends with it", () => {
    const h = replyThreadHeaders(
      parent([
        { name: "Message-ID", value: "<b@ex.com>" },
        { name: "References", value: "<a@ex.com> <b@ex.com>" },
      ]),
    );
    expect(h.references).toBe("<a@ex.com> <b@ex.com>");
  });

  it("starts the chain from the parent In-Reply-To when it carries no References", () => {
    const h = replyThreadHeaders(
      parent([
        { name: "Message-ID", value: "<b@ex.com>" },
        { name: "In-Reply-To", value: "<a@ex.com>" },
      ]),
    );
    expect(h.references).toBe("<a@ex.com> <b@ex.com>");
  });

  it("prefers the References chain over In-Reply-To when both are present", () => {
    const h = replyThreadHeaders(
      parent([
        { name: "Message-ID", value: "<c@ex.com>" },
        { name: "In-Reply-To", value: "<b@ex.com>" },
        { name: "References", value: "<a@ex.com> <b@ex.com>" },
      ]),
    );
    expect(h.references).toBe("<a@ex.com> <b@ex.com> <c@ex.com>");
  });

  it("returns no headers when the parent carries no Message-ID", () => {
    expect(replyThreadHeaders(parent([{ name: "Subject", value: "Hi" }]))).toEqual({});
  });

  it("returns no headers when there is no parent", () => {
    expect(replyThreadHeaders(null)).toEqual({});
  });
});
