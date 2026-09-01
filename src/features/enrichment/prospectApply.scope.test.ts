import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ERROR_IDS } from "@/constants/errorIds";
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

describe("applyProspects request scoping", () => {
  it("refuses a batch requested by a different user as not found", async () => {
    const org = await seedOrg(h.db, admin.id);
    const owner = await seedUser(h.db);
    const batchId = crypto.randomUUID();
    await seedReveal(h.db, {
      orgId: org.id,
      requestedBy: owner.id,
      batchId,
      providerRef: "ref-foreign",
      outcomes: [outcomeFrom("apollo", { "person.email": "ada@lovelace.test" })],
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
            providerRef: "ref-foreign",
            selections: [{ canonicalKey: "person.email", value: "ada@lovelace.test" }],
            existing: null,
          },
        ],
      },
      new Date(),
      SIG(),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.id).toBe(ERROR_IDS.ENRICH_BATCH_NOT_FOUND);
  });
});
