import { describe, expect, it } from "vitest";
import { resolveComposerLinks } from "./composerLinks";

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
