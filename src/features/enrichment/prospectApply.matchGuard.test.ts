import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ERROR_IDS } from "@/constants/errorIds";
import * as schema from "@/db/schema";
import { seedUser } from "@/db/testing/factories";
import { makeTestDb, type TestDb } from "@/test/db";
import { seedDefaultMappings } from "./mappingsRepo";
import { applyProspects } from "./prospectApply";
import {
  actorOf,
  outcomeFrom,
  personFingerprint,
  SIG,
  seedOrg,
  seedPerson,
  seedReveal,
  type UserRow,
} from "./prospectApplyTestKit";

let h: TestDb;
let admin: UserRow;

beforeAll(async () => {
  h = await makeTestDb();
  admin = await seedUser(h.db, { isAdmin: true });
  await seedDefaultMappings(h.db, SIG());
});
afterAll(async () => {
  await h.close();
});

describe("applyProspects existing-person authority", () => {
  it("rejects an existing selection naming a person the profile does not match", async () => {
    const org = await seedOrg(h.db, admin.id);
    const otherOrg = await seedOrg(h.db, admin.id);
    const unrelated = await seedPerson(h.db, {
      ownerId: admin.id,
      orgId: otherOrg.id,
      name: "Someone Else",
    });
    const batchId = crypto.randomUUID();
    await seedReveal(h.db, {
      orgId: org.id,
      requestedBy: admin.id,
      batchId,
      providerRef: "ref-mismatch",
      outcomes: [outcomeFrom("apollo", { "person.email": "forged@lovelace.test" })],
      profile: { fullName: "Ada Lovelace" },
    });

    const result = await applyProspects(
      h.db,
      actorOf(admin),
      {
        orgId: org.id,
        batchId,
        mappingsFingerprint: await personFingerprint(h.db),
        items: [
          {
            providerRef: "ref-mismatch",
            selections: [{ canonicalKey: "person.email", value: "forged@lovelace.test" }],
            existing: {
              personId: unrelated.id,
              expectedUpdatedAtIso: unrelated.updatedAt.toISOString(),
            },
          },
        ],
      },
      new Date(),
      SIG(),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0]?.result).toEqual({
      ok: false,
      errorId: ERROR_IDS.ENRICH_PROSPECT_MISMATCH,
    });
    const [after] = await h.db
      .select()
      .from(schema.persons)
      .where(eq(schema.persons.id, unrelated.id));
    expect(after?.emails).toEqual([]);
  });
});
