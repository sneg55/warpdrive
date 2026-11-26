import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  new URL("./drizzle/0088_provider_neutral_identities.sql", import.meta.url),
  "utf8",
);

describe("0088 provider neutral identities migration", () => {
  it("backfills google identities into user_identities", () => {
    expect(migration).toContain('INSERT INTO "user_identities"');
  });

  it("does not write avatar urls", () => {
    expect(migration).not.toContain('"avatar_url"');
  });
});
