import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CustomFieldTarget, CustomFieldType } from "@/constants/customFieldTypes";
import { ERROR_IDS } from "@/constants/errorIds";
import { customFieldDefs } from "@/db/schema";
import { makeTestDb, type TestDb } from "@/test/db";
import { listMappings, upsertMapping } from "./mappingsRepo";

let h: TestDb;
const signal = new AbortController().signal;

beforeAll(async () => {
  h = await makeTestDb();
});
afterAll(async () => {
  await h.close();
});

let seq = 0;
async function seedDef(
  targetEntity: CustomFieldTarget,
  type: CustomFieldType,
): Promise<{ id: string }> {
  seq += 1;
  const [def] = await h.db
    .insert(customFieldDefs)
    .values({
      targetEntity,
      type,
      name: `Field ${seq}`,
      key: `f_${seq}_${Math.random().toString(36).slice(2, 8)}`,
    })
    .returning({ id: customFieldDefs.id });
  if (def === undefined) throw new Error("no custom field def row");
  return def;
}

describe("upsertMapping: canonical key must belong to the entity", () => {
  it("refuses a person canonical key on an organization mapping", async () => {
    const r = await upsertMapping(
      h.db,
      "organization",
      "person.title",
      { kind: "builtin", key: "industry" },
      signal,
    );
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error.id).toBe(ERROR_IDS.ENRICH_MAPPING_INVALID);
    // The table is not empty (the migration seeds defaults), so assert the refusal itself: the
    // cross-entity key must not have been written.
    const keys = (await listMappings(h.db, "organization", signal)).map((m) => m.canonicalKey);
    expect(keys).not.toContain("person.title");
  });

  it("refuses an organization canonical key on a person mapping", async () => {
    const r = await upsertMapping(
      h.db,
      "person",
      "org.industry",
      { kind: "builtin", key: "name" },
      signal,
    );
    expect(r.ok).toBe(false);
  });

  it("still refuses a key that is in no vocabulary at all", async () => {
    const r = await upsertMapping(
      h.db,
      "organization",
      "org.notAThing",
      { kind: "builtin", key: "industry" },
      signal,
    );
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error.id).toBe(ERROR_IDS.ENRICH_INPUT_INVALID);
  });
});

describe("upsertMapping: built-in target must be writable", () => {
  it("accepts a real organization built-in", async () => {
    const r = await upsertMapping(
      h.db,
      "organization",
      "org.industry",
      { kind: "builtin", key: "industry" },
      signal,
    );
    expect(r.ok).toBe(true);
  });

  it("accepts an address leaf", async () => {
    const r = await upsertMapping(
      h.db,
      "organization",
      "org.city",
      { kind: "builtin", key: "address.city" },
      signal,
    );
    expect(r.ok).toBe(true);
  });

  it("refuses an arbitrary key that would land in the update patch", async () => {
    const r = await upsertMapping(
      h.db,
      "organization",
      "org.description",
      { kind: "builtin", key: "customFields" },
      signal,
    );
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error.id).toBe(ERROR_IDS.ENRICH_MAPPING_INVALID);
  });

  it("refuses owner", async () => {
    const r = await upsertMapping(
      h.db,
      "organization",
      "org.name",
      { kind: "builtin", key: "owner" },
      signal,
    );
    expect(r.ok).toBe(false);
  });

  it("refuses a person built-in on an organization mapping", async () => {
    const r = await upsertMapping(
      h.db,
      "organization",
      "org.name",
      { kind: "builtin", key: "emails" },
      signal,
    );
    expect(r.ok).toBe(false);
  });
});

describe("upsertMapping: custom target must belong to the entity", () => {
  it("refuses a person custom field as an organization target", async () => {
    const def = await seedDef("person", "text");
    const r = await upsertMapping(
      h.db,
      "organization",
      "org.description",
      { kind: "custom", fieldDefId: def.id },
      signal,
    );
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error.id).toBe(ERROR_IDS.ENRICH_MAPPING_INVALID);
  });

  it("refuses a deal custom field as a person target", async () => {
    const def = await seedDef("deal", "text");
    const r = await upsertMapping(
      h.db,
      "person",
      "person.title",
      { kind: "custom", fieldDefId: def.id },
      signal,
    );
    expect(r.ok).toBe(false);
  });

  it("accepts a custom field on the matching entity", async () => {
    const def = await seedDef("organization", "text");
    const r = await upsertMapping(
      h.db,
      "organization",
      "org.description",
      { kind: "custom", fieldDefId: def.id },
      signal,
    );
    expect(r.ok).toBe(true);
  });
});

describe("upsertMapping: custom target type must hold the canonical scalar", () => {
  const STRING_OK: CustomFieldType[] = ["text", "large_text", "autocomplete"];
  const NUMBER_OK: CustomFieldType[] = ["numeric", "monetary"];
  const NEVER_OK: CustomFieldType[] = [
    "single_option",
    "multi_option",
    "address",
    "user",
    "org",
    "person",
    "date",
    "date_range",
    "time",
    "time_range",
    "phone",
  ];

  it.each(STRING_OK)("accepts a string canonical key into %s", async (type) => {
    const def = await seedDef("organization", type);
    const r = await upsertMapping(
      h.db,
      "organization",
      "org.description",
      { kind: "custom", fieldDefId: def.id },
      signal,
    );
    expect(r.ok).toBe(true);
  });

  it.each(NUMBER_OK)("accepts a number canonical key into %s", async (type) => {
    const def = await seedDef("organization", type);
    const r = await upsertMapping(
      h.db,
      "organization",
      "org.employeeCount",
      { kind: "custom", fieldDefId: def.id },
      signal,
    );
    expect(r.ok).toBe(true);
  });

  it.each(NUMBER_OK)("refuses a string canonical key into %s", async (type) => {
    const def = await seedDef("organization", type);
    const r = await upsertMapping(
      h.db,
      "organization",
      "org.description",
      { kind: "custom", fieldDefId: def.id },
      signal,
    );
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error.id).toBe(ERROR_IDS.ENRICH_MAPPING_INVALID);
  });

  it.each(STRING_OK)("refuses a number canonical key into %s", async (type) => {
    const def = await seedDef("organization", type);
    const r = await upsertMapping(
      h.db,
      "organization",
      "org.employeeCount",
      { kind: "custom", fieldDefId: def.id },
      signal,
    );
    expect(r.ok).toBe(false);
  });

  it.each(NEVER_OK)("refuses %s for any canonical key", async (type) => {
    const def = await seedDef("organization", type);
    const asString = await upsertMapping(
      h.db,
      "organization",
      "org.description",
      { kind: "custom", fieldDefId: def.id },
      signal,
    );
    const asNumber = await upsertMapping(
      h.db,
      "organization",
      "org.employeeCount",
      { kind: "custom", fieldDefId: def.id },
      signal,
    );
    expect(asString.ok).toBe(false);
    expect(asNumber.ok).toBe(false);
  });
});
