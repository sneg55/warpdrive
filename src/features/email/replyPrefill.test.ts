import { describe, expect, it } from "vitest";
import { buildReplyPrefill } from "./replyPrefill";

const msg = {
  fromEmail: "ann@acme.com",
  toEmails: ["me@ex.com", "bob@acme.com"],
  ccEmails: ["carol@acme.com"],
  subject: "Proposal",
  bodyHtml: "<p>Hi</p>",
};

describe("buildReplyPrefill", () => {
  it("reply targets only the sender", () => {
    const p = buildReplyPrefill("reply", msg, "me@ex.com");
    expect(p.to).toEqual(["ann@acme.com"]);
    expect(p.cc).toEqual([]);
    expect(p.subject).toBe("Re: Proposal");
    expect(p.bodyHtml).toBe("");
  });

  it("reply keeps the sender as recipient even when the sender is self (own last-sent message)", () => {
    const ownFollowUp = { ...msg, fromEmail: "me@ex.com" };
    const p = buildReplyPrefill("reply", ownFollowUp, "me@ex.com");
    expect(p.to).toEqual(["me@ex.com"]);
  });

  it("reply-all keeps everyone but drops self", () => {
    const p = buildReplyPrefill("replyAll", msg, "me@ex.com");
    expect(p.to).toEqual(["ann@acme.com", "bob@acme.com"]);
    expect(p.cc).toEqual(["carol@acme.com"]);
  });

  it("reply-all drops self even when self also appears in cc (case-insensitive)", () => {
    const withSelfInCc = { ...msg, ccEmails: ["carol@acme.com", "ME@ex.com"] };
    const p = buildReplyPrefill("replyAll", withSelfInCc, "me@ex.com");
    expect(p.to).toEqual(["ann@acme.com", "bob@acme.com"]);
    expect(p.cc).toEqual(["carol@acme.com"]);
  });

  it("reply-all dedupes recipients that appear in both to and cc, case-insensitively", () => {
    const withDupe = {
      ...msg,
      toEmails: ["me@ex.com", "bob@acme.com", "Bob@Acme.com"],
      ccEmails: ["carol@acme.com", "bob@acme.com"],
    };
    const p = buildReplyPrefill("replyAll", withDupe, "me@ex.com");
    expect(p.to).toEqual(["ann@acme.com", "bob@acme.com"]);
    expect(p.cc).toEqual(["carol@acme.com"]);
  });

  it("forward blanks recipients, prefixes Fwd:, and quotes the body", () => {
    const p = buildReplyPrefill("forward", msg, "me@ex.com");
    expect(p.to).toEqual([]);
    expect(p.cc).toEqual([]);
    expect(p.subject).toBe("Fwd: Proposal");
    expect(p.bodyHtml).toContain("<p>Hi</p>");
  });

  it("forward escapes the quoted From line so a hostile fromEmail cannot inject markup", () => {
    const hostile = { ...msg, fromEmail: "<img src=x onerror=alert(1)>@acme.com" };
    const p = buildReplyPrefill("forward", hostile, "me@ex.com");
    expect(p.bodyHtml).not.toContain("<img src=x onerror=alert(1)>");
    expect(p.bodyHtml).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });

  it("subject prefixing is idempotent: replying twice does not double the Re: prefix", () => {
    const alreadyReplied = { ...msg, subject: "Re: Proposal" };
    const p = buildReplyPrefill("reply", alreadyReplied, "me@ex.com");
    expect(p.subject).toBe("Re: Proposal");
  });

  it("subject prefixing is idempotent for forward and is case-insensitive", () => {
    const alreadyForwarded = { ...msg, subject: "fwd: Proposal" };
    const p = buildReplyPrefill("forward", alreadyForwarded, "me@ex.com");
    expect(p.subject).toBe("fwd: Proposal");
  });

  it("a null subject prefixes cleanly with no leading/trailing whitespace", () => {
    const noSubject = { ...msg, subject: null };
    const p = buildReplyPrefill("reply", noSubject, "me@ex.com");
    expect(p.subject).toBe("Re:");
  });
});
