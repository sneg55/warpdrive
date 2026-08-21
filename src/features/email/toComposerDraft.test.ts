import { describe, expect, it } from "vitest";
import { toComposerDraft } from "./toComposerDraft";

const row = {
  id: "draft-1",
  subject: "Resumed",
  bodyHtml: "<p>body</p>",
  toEmails: ["a@y.com"],
  ccEmails: [],
  threadId: null,
  accountId: "acct-1",
  visibility: "shared" as const,
  linkDealId: "deal-9",
  linkPersonId: "person-9",
  updatedAt: "2026-07-01T00:00:00.000Z",
};

describe("toComposerDraft", () => {
  it("carries the saved CRM links into the composer seed", () => {
    expect(toComposerDraft(row)).toMatchObject({
      id: "draft-1",
      linkDealId: "deal-9",
      linkPersonId: "person-9",
    });
  });

  it("maps null subject and body to empty strings so the composer mounts with real values", () => {
    expect(toComposerDraft({ ...row, subject: null, bodyHtml: null })).toMatchObject({
      subject: "",
      bodyHtml: "",
    });
  });
});
