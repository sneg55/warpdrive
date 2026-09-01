import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { mappingsFingerprint } from "./mappingsFingerprint";
import { listMappings } from "./mappingsRepo";
import { insertReveals } from "./prospectsRepo";
import { loadRevealBatch } from "./revealBatchQuery";
import {
  BATCH,
  makeRevealKit,
  OTHER_BATCH,
  profileOf,
  type RevealKit,
  SIG,
} from "./revealService.test-helpers";

let kit: RevealKit;

beforeAll(async () => {
  kit = await makeRevealKit();
});
afterAll(async () => {
  await kit.h.close();
});
beforeEach(async () => {
  await kit.reset();
});

async function seedRow(
  args: { orgId: string; requestedBy: string; batchId?: string; providerRef: string },
  fields: Record<string, string>,
): Promise<void> {
  await insertReveals(
    kit.h.db,
    [
      {
        batchId: args.batchId ?? BATCH,
        orgId: args.orgId,
        requestedBy: args.requestedBy,
        providerRef: args.providerRef,
        searchProvider: "apollo" as const,
        profile: profileOf(args.providerRef),
        outcomes: [{ provider: "apollo" as const, kind: "ok" as const, candidate: { fields } }],
      },
    ],
    SIG(),
  );
}

describe("loadRevealBatch", () => {
  it("rebuilds the stored rows against the person each profile matches", async () => {
    const orgId = await kit.seedOrg();
    const person = await kit.seedPerson(orgId, {
      name: "Ada Lovelace",
      firstName: "Adah",
      primaryEmail: "ada@acme.com",
    });
    await seedRow(
      { orgId, requestedBy: kit.admin.id, providerRef: "a" },
      { "person.email": "ada@acme.com", "person.firstName": "Ada" },
    );

    const batch = await loadRevealBatch(kit.h.db, kit.admin, { orgId, batchId: BATCH }, SIG());

    expect(batch.mappingsFingerprint).toBe(
      mappingsFingerprint(await listMappings(kit.h.db, "person", SIG())),
    );
    expect(batch.failures).toEqual([]);
    expect(batch.items.map((r) => r.providerRef)).toEqual(["a"]);
    expect(batch.items[0]?.match).toEqual({
      kind: "existing",
      personId: person.id,
      personUpdatedAtIso: person.updatedAtIso,
    });
    expect(batch.items[0]?.fields.find((f) => f.canonicalKey === "person.email")).toBeUndefined();
    const first = batch.items[0]?.fields.find((f) => f.canonicalKey === "person.firstName");
    expect(first?.currentValue).toBe("Adah");
    expect(first?.isOverwrite).toBe(true);
  });

  it("returns nothing for a batch another user paid for", async () => {
    const orgId = await kit.seedOrg();
    await seedRow(
      { orgId, requestedBy: kit.regular.id, providerRef: "a" },
      {
        "person.email": "ada@acme.com",
      },
    );

    const batch = await loadRevealBatch(kit.h.db, kit.admin, { orgId, batchId: BATCH }, SIG());

    expect(batch.items).toEqual([]);
  });

  it("returns nothing for a batch that belongs to another organization", async () => {
    const orgId = await kit.seedOrg();
    const otherOrgId = await kit.seedOrg();
    await seedRow(
      { orgId: otherOrgId, requestedBy: kit.admin.id, batchId: OTHER_BATCH, providerRef: "a" },
      { "person.email": "ada@acme.com" },
    );

    const batch = await loadRevealBatch(
      kit.h.db,
      kit.admin,
      { orgId, batchId: OTHER_BATCH },
      SIG(),
    );

    expect(batch.items).toEqual([]);
  });

  it("excludes a row already applied, offering only the rows still open", async () => {
    const orgId = await kit.seedOrg();
    await seedRow(
      { orgId, requestedBy: kit.admin.id, providerRef: "a" },
      { "person.email": "ada@acme.com" },
    );
    await seedRow(
      { orgId, requestedBy: kit.admin.id, providerRef: "b" },
      { "person.email": "grace@acme.com" },
    );
    await kit.h.db
      .update(schema.prospectReveals)
      .set({ appliedAt: new Date() })
      .where(eq(schema.prospectReveals.providerRef, "a"));

    const batch = await loadRevealBatch(kit.h.db, kit.admin, { orgId, batchId: BATCH }, SIG());

    expect(batch.items.map((r) => r.providerRef)).toEqual(["b"]);
  });
});
