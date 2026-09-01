import { and, eq } from "drizzle-orm";
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

describe("applyProspects create branch", () => {
  it("creates a person carrying the profile name parts, this organization and the revealed field", async () => {
    const org = await seedOrg(h.db, admin.id);
    const batchId = crypto.randomUUID();
    await seedReveal(h.db, {
      orgId: org.id,
      requestedBy: admin.id,
      batchId,
      providerRef: "ref-new",
      outcomes: [outcomeFrom("apollo", { "person.email": "ada@lovelace.test" })],
    });

    const result = await run(org.id, batchId, [
      {
        providerRef: "ref-new",
        selections: [{ canonicalKey: "person.email", value: "ada@lovelace.test" }],
        existing: null,
      },
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0]?.result).toEqual({
      ok: true,
      personId: expect.any(String),
      appliedFields: ["person.email"],
    });
    const rows = await personsAt(org.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.name).toBe("Ada Lovelace");
    expect(rows[0]?.firstName).toBe("Ada");
    expect(rows[0]?.lastName).toBe("Lovelace");
    expect(rows[0]?.ownerId).toBe(admin.id);
    expect(rows[0]?.emails.map((e) => e.value)).toContain("ada@lovelace.test");
  });

  it("stamps person_id and applied_at on the reveal row it applied", async () => {
    const org = await seedOrg(h.db, admin.id);
    const batchId = crypto.randomUUID();
    const reveal = await seedReveal(h.db, {
      orgId: org.id,
      requestedBy: admin.id,
      batchId,
      providerRef: "ref-stamp",
      outcomes: [outcomeFrom("apollo", { "person.email": "stamp@lovelace.test" })],
    });

    const result = await run(org.id, batchId, [
      {
        providerRef: "ref-stamp",
        selections: [{ canonicalKey: "person.email", value: "stamp@lovelace.test" }],
        existing: null,
      },
    ]);
    expect(result.ok).toBe(true);

    const [after] = await h.db
      .select()
      .from(schema.prospectReveals)
      .where(eq(schema.prospectReveals.id, reveal.id));
    const rows = await personsAt(org.id);
    expect(after?.personId).toBe(rows[0]?.id);
    expect(after?.appliedAt).toBeInstanceOf(Date);
  });
});

describe("applyProspects update branch", () => {
  it("writes onto the existing person and creates no second person", async () => {
    const org = await seedOrg(h.db, admin.id);
    const person = await seedPerson(h.db, {
      ownerId: admin.id,
      orgId: org.id,
      name: "Ada Lovelace",
    });
    const batchId = crypto.randomUUID();
    const reveal = await seedReveal(h.db, {
      orgId: org.id,
      requestedBy: admin.id,
      batchId,
      providerRef: "ref-existing",
      outcomes: [outcomeFrom("apollo", { "person.email": "grace@hopper.test" })],
    });

    const result = await run(org.id, batchId, [
      {
        providerRef: "ref-existing",
        selections: [{ canonicalKey: "person.email", value: "grace@hopper.test" }],
        existing: { personId: person.id, expectedUpdatedAtIso: person.updatedAt.toISOString() },
      },
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0]?.result).toEqual({
      ok: true,
      personId: person.id,
      appliedFields: ["person.email"],
    });
    const rows = await personsAt(org.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.emails.map((e) => e.value)).toContain("grace@hopper.test");

    const [after] = await h.db
      .select()
      .from(schema.prospectReveals)
      .where(eq(schema.prospectReveals.id, reveal.id));
    expect(after?.personId).toBe(person.id);
    expect(after?.appliedAt).toBeInstanceOf(Date);
  });

  it("records one change log per applied field naming the providers behind the value", async () => {
    const org = await seedOrg(h.db, admin.id);
    const person = await seedPerson(h.db, {
      ownerId: admin.id,
      orgId: org.id,
      name: "Ada Lovelace",
    });
    const batchId = crypto.randomUUID();
    await seedReveal(h.db, {
      orgId: org.id,
      requestedBy: admin.id,
      batchId,
      providerRef: "ref-log",
      outcomes: [
        outcomeFrom("apollo", { "person.email": "logged@hopper.test" }),
        outcomeFrom("rocketreach", { "person.email": "logged@hopper.test" }),
      ],
    });

    await run(org.id, batchId, [
      {
        providerRef: "ref-log",
        selections: [{ canonicalKey: "person.email", value: "logged@hopper.test" }],
        existing: { personId: person.id, expectedUpdatedAtIso: person.updatedAt.toISOString() },
      },
    ]);

    const logs = await h.db
      .select()
      .from(schema.changeLogs)
      .where(
        and(eq(schema.changeLogs.entityId, person.id), eq(schema.changeLogs.field, "person.email")),
      );
    expect(logs).toHaveLength(1);
    expect(logs[0]?.newValue).toMatchObject({ providers: ["apollo", "rocketreach"] });
  });
});
