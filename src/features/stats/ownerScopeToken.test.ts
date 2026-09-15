import { describe, expect, it } from "vitest";
import type { OwnerScope } from "@/types/stats";
import { fromToken, toToken } from "./ownerScopeToken";

const UUID = "11111111-2222-3333-4444-555555555555";

describe("owner scope tokens", () => {
  it("round-trips every scope kind", () => {
    const scopes: OwnerScope[] = [
      { kind: "me" },
      { kind: "all" },
      { kind: "user", userId: UUID },
      { kind: "team", teamId: UUID },
    ];
    for (const scope of scopes) {
      expect(fromToken(toToken(scope))).toEqual(scope);
    }
  });

  it("falls back to 'me' for an unknown token", () => {
    expect(fromToken("nonsense")).toEqual({ kind: "me" });
    expect(fromToken("")).toEqual({ kind: "me" });
  });

  it("falls back to 'me' for a prefixed token with no id", () => {
    expect(fromToken("user:")).toEqual({ kind: "me" });
    expect(fromToken("team:")).toEqual({ kind: "me" });
  });
});
