import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ERROR_IDS } from "@/constants/errorIds";
import { enrichmentFieldMappings } from "@/db/schema/enrichment";
import { makeTestDb, type TestDb } from "@/test/db";
import { clearMapping, upsertMapping } from "./mappingsRepo";

let h: TestDb;
const signal = new AbortController().signal;

beforeAll(async () => {
  h = await makeTestDb();
});
afterAll(async () => {
  await h.close();
});

// The migration seeds the defaults, so these start from a table that already has mappings.
describe("built-in target compatibility", () => {
  it("refuses prose aimed at a numeric column", async () => {
    const r = await upsertMapping(
      h.db,
      "organization",
      "org.description",
      { kind: "builtin", key: "employeeCount" },
      signal,
    );
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error.id).toBe(ERROR_IDS.ENRICH_MAPPING_INVALID);
  });

  it("refuses a number aimed at a text column", async () => {
    await clearMapping(h.db, "organization", "org.industry", signal);
    const r = await upsertMapping(
      h.db,
      "organization",
      "org.foundedYear",
      { kind: "builtin", key: "industry" },
      signal,
    );
    expect(r.ok).toBe(false);
  });

  // emails is a contact-point array and org is a link, so neither takes an arbitrary scalar.
  it("reserves the shaped person built-ins for their own canonical key", async () => {
    const wrongEmails = await upsertMapping(
      h.db,
      "person",
      "person.title",
      { kind: "builtin", key: "emails" },
      signal,
    );
    expect(wrongEmails.ok).toBe(false);

    const wrongOrg = await upsertMapping(
      h.db,
      "person",
      "person.city",
      { kind: "builtin", key: "org" },
      signal,
    );
    expect(wrongOrg.ok).toBe(false);
  });

  it("still accepts a compatible mapping", async () => {
    const r = await upsertMapping(
      h.db,
      "organization",
      "org.employeeCount",
      { kind: "builtin", key: "employeeCount" },
      signal,
    );
    expect(r.ok).toBe(true);
  });
});

// plan.ts writes one patch key per target, so a shared target means one value silently wins while
// both canonical keys are reported as applied and both reach the change log.
describe("duplicate targets", () => {
  it("refuses a second canonical key aimed at a target already mapped", async () => {
    const r = await upsertMapping(
      h.db,
      "organization",
      "org.website",
      { kind: "builtin", key: "domain" },
      signal,
    );
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error.id).toBe(ERROR_IDS.ENRICH_MAPPING_INVALID);
    expect(!r.ok && r.error.context?.conflictsWith).toBe("org.domain");
  });

  it("lets a key be re-pointed at the target it already holds", async () => {
    const r = await upsertMapping(
      h.db,
      "organization",
      "org.domain",
      { kind: "builtin", key: "domain" },
      signal,
    );
    expect(r.ok).toBe(true);
  });

  // Two admins saving at once both pass the in-application check before either row is visible, and
  // only the partial index on the target sees the second one. A repeatable-read snapshot puts the
  // reader in exactly that position without needing the two saves to interleave by luck.
  it("returns a Result, not a throw, when the target index rejects the insert", async () => {
    await clearMapping(h.db, "organization", "org.industry", signal);
    await clearMapping(h.db, "organization", "org.foundedYear", signal);
    const other = new Pool({ connectionString: h.url, max: 1 });
    try {
      const r = await h.db.transaction(
        async (tx) => {
          await tx.select().from(enrichmentFieldMappings);
          await other.query(
            `insert into enrichment_field_mappings (entity, canonical_key, target_kind, target_key)
             values ('organization', 'org.foundedYear', 'builtin', 'industry')`,
          );
          return await upsertMapping(
            tx,
            "organization",
            "org.industry",
            { kind: "builtin", key: "industry" },
            signal,
          );
        },
        { isolationLevel: "repeatable read" },
      );
      expect(r.ok).toBe(false);
      expect(!r.ok && r.error.id).toBe(ERROR_IDS.ENRICH_MAPPING_INVALID);
    } finally {
      await other.end();
    }
  });

  it("frees the target once the mapping holding it is cleared", async () => {
    await clearMapping(h.db, "organization", "org.linkedinUrl", signal);
    const r = await upsertMapping(
      h.db,
      "organization",
      "org.website",
      { kind: "builtin", key: "linkedinUrl" },
      signal,
    );
    expect(r.ok).toBe(true);
  });
});
