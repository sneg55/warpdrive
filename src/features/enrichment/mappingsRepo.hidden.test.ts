import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CustomFieldTarget } from "@/constants/customFieldTypes";
import { hiddenBuiltinFields } from "@/db/schema";
import { makeTestDb, type TestDb } from "@/test/db";
import type { EnrichEntity } from "./canonical";
import { listMappings, upsertMapping } from "./mappingsRepo";

let h: TestDb;
const signal = new AbortController().signal;

beforeAll(async () => {
  h = await makeTestDb();
});
afterAll(async () => {
  await h.close();
});

async function hide(entity: CustomFieldTarget, key: string): Promise<void> {
  await h.db
    .insert(hiddenBuiltinFields)
    .values({ targetEntity: entity, fieldKey: key })
    .onConflictDoNothing();
}

async function unhide(entity: CustomFieldTarget, key: string): Promise<void> {
  await h.db
    .delete(hiddenBuiltinFields)
    .where(
      and(eq(hiddenBuiltinFields.targetEntity, entity), eq(hiddenBuiltinFields.fieldKey, key)),
    );
}

async function keysOf(entity: EnrichEntity): Promise<string[]> {
  return (await listMappings(h.db, entity, signal)).map((m) => m.canonicalKey);
}

describe("listMappings: a built-in hidden in Settings > Data fields is not an active target", () => {
  it("drops a mapping whose built-in target an admin has hidden", async () => {
    const saved = await upsertMapping(
      h.db,
      "organization",
      "org.industry",
      { kind: "builtin", key: "industry" },
      signal,
    );
    expect(saved.ok).toBe(true);
    expect(await keysOf("organization")).toContain("org.industry");

    await hide("organization", "industry");
    expect(await keysOf("organization")).not.toContain("org.industry");
    await unhide("organization", "industry");
  });

  it("brings the mapping back on unhide, so the stored row was never deleted", async () => {
    await upsertMapping(
      h.db,
      "organization",
      "org.industry",
      { kind: "builtin", key: "industry" },
      signal,
    );
    await hide("organization", "industry");
    expect(await keysOf("organization")).not.toContain("org.industry");

    await unhide("organization", "industry");
    const back = (await listMappings(h.db, "organization", signal)).find(
      (m) => m.canonicalKey === "org.industry",
    );
    expect(back).toMatchObject({ targetKind: "builtin", targetKey: "industry" });
  });

  it("drops an address leaf when the address root is hidden", async () => {
    await upsertMapping(
      h.db,
      "organization",
      "org.city",
      { kind: "builtin", key: "address.city" },
      signal,
    );
    expect(await keysOf("organization")).toContain("org.city");

    await hide("organization", "address");
    expect(await keysOf("organization")).not.toContain("org.city");
    await unhide("organization", "address");
  });

  it("leaves a mapping onto a visible built-in alone", async () => {
    await upsertMapping(
      h.db,
      "organization",
      "org.domain",
      { kind: "builtin", key: "domain" },
      signal,
    );
    await hide("organization", "industry");
    expect(await keysOf("organization")).toContain("org.domain");
    await unhide("organization", "industry");
  });

  it("reads the override of the mapping's own entity, not another entity's", async () => {
    await upsertMapping(h.db, "person", "person.email", { kind: "builtin", key: "emails" }, signal);
    expect(await keysOf("person")).toContain("person.email");

    await hide("organization", "emails");
    expect(await keysOf("person")).toContain("person.email");

    await hide("person", "emails");
    expect(await keysOf("person")).not.toContain("person.email");
    await unhide("person", "emails");
    await unhide("organization", "emails");
  });
});
