import { expect, test } from "vitest";
import { sha256Base64Url, verifyPkceS256 } from "./pkce";

test("verifies a correct S256 challenge and rejects a wrong verifier", () => {
  const verifier = "abc123abc123abc123abc123abc123abc123abc123abc";
  const challenge = sha256Base64Url(verifier);

  expect(verifyPkceS256(verifier, challenge)).toBe(true);
  expect(verifyPkceS256("wrong-verifier", challenge)).toBe(false);
});
