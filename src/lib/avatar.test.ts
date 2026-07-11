import { describe, expect, it } from "vitest";
import { AVATAR_PALETTE, avatarColorClass, initials } from "./avatar";

describe("initials", () => {
  it("takes the first letter of the first two words", () => {
    expect(initials("Jane Roe")).toBe("JR");
    expect(initials("Acme Inc Corporation")).toBe("AI");
  });

  it("returns a single initial for a one-word name", () => {
    expect(initials("madonna")).toBe("M");
  });

  it("falls back to '?' for empty or whitespace names", () => {
    expect(initials("")).toBe("?");
    expect(initials("   ")).toBe("?");
  });
});

describe("avatarColorClass", () => {
  it("is deterministic for the same seed", () => {
    expect(avatarColorClass("Jane Roe")).toBe(avatarColorClass("Jane Roe"));
  });

  it("always returns a class pair from the palette", () => {
    expect(AVATAR_PALETTE).toContain(avatarColorClass("Jane Roe"));
    expect(AVATAR_PALETTE).toContain(avatarColorClass(""));
  });
});
