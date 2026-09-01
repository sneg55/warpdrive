import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { seedUser } from "@/db/testing/factories";
import { makeTestDb, type TestDb } from "@/test/db";
import { seedDefaultMappings } from "./mappingsRepo";
import { applyProspects, type ProspectApplyItem } from "./prospectApply";
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

async function run(orgId: string, batchId: string, items: ProspectApplyItem[]) {
  return applyProspects(
    h.db,
    actorOf(admin),
    { orgId, batchId, mappingsFingerprint: await personFingerprint(h.db), items },
    new Date(),
    SIG(),
  );
}

function personsAt(orgId: string) {
  return h.db.select().from(schema.persons).where(eq(schema.persons.orgId, orgId));
}

const item = (providerRef: string, value: string): ProspectApplyItem => ({
  providerRef,
  selections: [{ canonicalKey: "person.email", value }],
  existing: null,
});

describe("applyProspects replay", () => {
  it("returns the person the first apply created rather than creating a second one", async () => {
    const org = await seedOrg(h.db, admin.id);
    const batchId = crypto.randomUUID();
    await seedReveal(h.db, {
      orgId: org.id,
      requestedBy: admin.id,
      batchId,
      providerRef: "ref-replay",
      outcomes: [outcomeFrom("apollo", { "person.email": "replay@lovelace.test" })],
    });

    const first = await run(org.id, batchId, [item("ref-replay", "replay@lovelace.test")]);
    const second = await run(org.id, batchId, [item("ref-replay", "replay@lovelace.test")]);

    const personId = first.ok ? first.value[0]?.result : undefined;
    expect(personId).toEqual({
      ok: true,
      personId: expect.any(String),
      appliedFields: ["person.email"],
    });
    expect(second.ok ? second.value[0]?.result : undefined).toEqual({
      ok: true,
      personId: personId?.ok === true ? personId.personId : "",
      appliedFields: [],
    });
    expect(await personsAt(org.id)).toHaveLength(1);
  });

  it("creates one person when the same submission lands twice at once", async () => {
    const org = await seedOrg(h.db, admin.id);
    const batchId = crypto.randomUUID();
    await seedReveal(h.db, {
      orgId: org.id,
      requestedBy: admin.id,
      batchId,
      providerRef: "ref-double",
      outcomes: [outcomeFrom("apollo", { "person.email": "double@lovelace.test" })],
    });

    const [left, right] = await Promise.all([
      run(org.id, batchId, [item("ref-double", "double@lovelace.test")]),
      run(org.id, batchId, [item("ref-double", "double@lovelace.test")]),
    ]);

    const rows = await personsAt(org.id);
    expect(rows).toHaveLength(1);
    for (const result of [left, right]) {
      expect(result.ok ? result.value[0]?.result : undefined).toMatchObject({
        ok: true,
        personId: rows[0]?.id,
      });
    }
  });
});
