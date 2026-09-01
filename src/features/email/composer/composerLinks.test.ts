import { describe, expect, it } from "vitest";
import { mergeRecipientEmail, resolveComposerLinks } from "./composerLinks";

describe("resolveComposerLinks", () => {
  it("takes the deal and person from a deal-workspace context", () => {
    expect(
      resolveComposerLinks({
        context: { kind: "deal", dealId: "d1", personId: "p1" },
      }),
    ).toEqual({ linkDealId: "d1", linkPersonId: "p1" });
  });

  it("lets the inbox link sidebar's pick win over the context deal", () => {
    expect(
      resolveComposerLinks({
        context: { kind: "deal", dealId: "d1", personId: "p1" },
        linkDealId: "picked",
      }),
    ).toEqual({ linkDealId: "picked", linkPersonId: "p1" });
  });

  it("falls back to a resumed draft's stored links when the compose has no context", () => {
    expect(
      resolveComposerLinks({
        draft: { linkDealId: "d9", linkPersonId: "p9" },
      }),
    ).toEqual({ linkDealId: "d9", linkPersonId: "p9" });
  });

  it("prefers live context over the resumed draft, so resuming into a deal repins the draft", () => {
    expect(
      resolveComposerLinks({
        context: { kind: "deal", dealId: "d1" },
        draft: { linkDealId: "d9", linkPersonId: "p9" },
      }),
    ).toEqual({ linkDealId: "d1", linkPersonId: "p9" });
  });

  it("resolves to no links for a plain inbox compose", () => {
    expect(resolveComposerLinks({ context: { kind: "inbox" } })).toEqual({
      linkDealId: undefined,
      linkPersonId: undefined,
    });
  });
});

describe("mergeRecipientEmail", () => {
  it("is the single recipient a merge preview can resolve against", () => {
    expect(mergeRecipientEmail(["buyer@corp.com"], [], [])).toBe("buyer@corp.com");
  });

  it("is empty for several recipients, since one body reaches all of them", () => {
    expect(mergeRecipientEmail(["a@x.com", "b@x.com"], [], [])).toBe("");
    expect(mergeRecipientEmail(["a@x.com"], ["c@x.com"], [])).toBe("");
    expect(mergeRecipientEmail(["a@x.com"], [], ["d@x.com"])).toBe("");
  });

  it("is empty when nobody is addressed yet", () => {
    expect(mergeRecipientEmail([], [], [])).toBe("");
  });
});
