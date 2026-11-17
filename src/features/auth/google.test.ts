import { describe, expect, test } from "vitest";
import { buildAuthUrl, generatePkce } from "./google";

describe("google oauth", () => {
  test("buildAuthUrl carries PKCE + state + nonce + hd hint", () => {
    const url = new URL(buildAuthUrl({ state: "s1", nonce: "n1", codeChallenge: "c1" }));
    expect(url.searchParams.get("code_challenge")).toBe("c1");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("state")).toBe("s1");
    expect(url.searchParams.get("nonce")).toBe("n1");
    expect(url.searchParams.get("hd")).toBe("example.com");
  });

  test("generatePkce produces a verifier and S256 challenge", () => {
    const { verifier, challenge } = generatePkce();
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(challenge).not.toBe(verifier);
  });
});
