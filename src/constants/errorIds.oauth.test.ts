import { describe, expect, test } from "vitest";
import { ERROR_IDS } from "./errorIds";

describe("OAuth error ids", () => {
  test("all E_OAUTH ids are present and unique", () => {
    const ids = [
      ERROR_IDS.OAUTH_INVALID_CLIENT,
      ERROR_IDS.OAUTH_INVALID_GRANT,
      ERROR_IDS.OAUTH_INVALID_PKCE,
      ERROR_IDS.OAUTH_CODE_EXPIRED,
      ERROR_IDS.OAUTH_TOKEN_REVOKED,
      ERROR_IDS.OAUTH_CONSENT_REQUIRED,
    ];
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^E_OAUTH_\d{3}$/);
  });
});
