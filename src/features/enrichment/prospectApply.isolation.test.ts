import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ERROR_IDS } from "@/constants/errorIds";
import * as schema from "@/db/schema";
import { seedUser } from "@/db/testing/factories";
import type { ContactActor } from "@/features/contacts/personsRepo";
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

async function run(
  orgId: string,
  batchId: string,
  items: ProspectApplyItem[],
  opts: { actor?: ContactActor; fingerprint?: string } = {},
) {
  return applyProspects(
    h.db,
    opts.actor ?? actorOf(admin),
    {
      orgId,
      batchId,
      mappingsFingerprint: opts.fingerprint ?? (await personFingerprint(h.db)),
      items,
    },
    new Date(),
    SIG(),
  );
}

function personsAt(orgId: string) {
  return h.db.select().from(schema.persons).where(eq(schema.persons.orgId, orgId));
}

async function seedTwoRowBatch(orgId: string, batchId: string, requestedBy: string = admin.id) {
  await seedReveal(h.db, {
    orgId,
    requestedBy,
    batchId,
    providerRef: "ref-a",
    outcomes: [outcomeFrom("apollo", { "person.email": "a@isolation.test" })],
  });
  await seedReveal(h.db, {
    orgId,
    requestedBy,
    batchId,
    providerRef: "ref-b",
    outcomes: [outcomeFrom("apollo", { "person.email": "b@isolation.test" })],
  });
}

describe("applyProspects per item isolation", () => {
  it("fails a stale existing item alone while the rest of the batch still applies", async () => {
    const org = await seedOrg(h.db, admin.id);
    const person = await seedPerson(h.db, {
      ownerId: admin.id,
      orgId: org.id,
      name: "Ada Lovelace",
    });
    const batchId = crypto.randomUUID();
    await seedTwoRowBatch(org.id, batchId);

    const result = await run(org.id, batchId, [
      {
        providerRef: "ref-a",
        selections: [{ canonicalKey: "person.email", value: "a@isolation.test" }],
        existing: {
          personId: person.id,
          expectedUpdatedAtIso: new Date(person.updatedAt.getTime() - 60_000).toISOString(),
        },
      },
      {
        providerRef: "ref-b",
        selections: [{ canonicalKey: "person.email", value: "b@isolation.test" }],
        existing: null,
      },
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0]?.result).toEqual({ ok: false, errorId: ERROR_IDS.ENRICH_STALE });
    expect(result.value[1]?.result).toMatchObject({ ok: true });
    const rows = await personsAt(org.id);
    expect(rows).toHaveLength(2);
    const stale = rows.find((r) => r.id === person.id);
    expect(stale?.emails).toEqual([]);
  });

  it("fails an item on a person the actor cannot edit with the permission id alone", async () => {
    const org = await seedOrg(h.db, admin.id);
    const person = await seedPerson(h.db, {
      ownerId: admin.id,
      orgId: org.id,
      name: "Ada Lovelace",
    });
    const viewer = await seedUser(h.db);
    const batchId = crypto.randomUUID();
    await seedTwoRowBatch(org.id, batchId, viewer.id);

    const result = await run(
      org.id,
      batchId,
      [
        {
          providerRef: "ref-a",
          selections: [{ canonicalKey: "person.email", value: "a@isolation.test" }],
          existing: { personId: person.id, expectedUpdatedAtIso: person.updatedAt.toISOString() },
        },
      ],
      { actor: actorOf(viewer, ["contact.create"]) },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0]?.result).toEqual({ ok: false, errorId: ERROR_IDS.PERM_DENIED });
    const rows = await personsAt(org.id);
    expect(rows[0]?.emails).toEqual([]);
  });

  it("fails an item whose selection no outcome on that row backs", async () => {
    const org = await seedOrg(h.db, admin.id);
    const batchId = crypto.randomUUID();
    await seedTwoRowBatch(org.id, batchId);

    const result = await run(org.id, batchId, [
      {
        providerRef: "ref-a",
        selections: [{ canonicalKey: "person.email", value: "forged@isolation.test" }],
        existing: null,
      },
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0]?.result).toEqual({ ok: false, errorId: ERROR_IDS.ENRICH_INPUT_INVALID });
    expect(await personsAt(org.id)).toHaveLength(0);
  });
});

describe("applyProspects whole call guards", () => {
  it("fails the whole call and writes nothing when the mappings fingerprint changed", async () => {
    const org = await seedOrg(h.db, admin.id);
    const batchId = crypto.randomUUID();
    await seedTwoRowBatch(org.id, batchId);

    const result = await run(
      org.id,
      batchId,
      [
        {
          providerRef: "ref-a",
          selections: [{ canonicalKey: "person.email", value: "a@isolation.test" }],
          existing: null,
        },
      ],
      { fingerprint: "person.email=builtin=nickname=" },
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.id).toBe(ERROR_IDS.ENRICH_MAPPINGS_CHANGED);
    expect(await personsAt(org.id)).toHaveLength(0);
  });

  it("fails the whole call when the batch belongs to another organization", async () => {
    const owner = await seedOrg(h.db, admin.id);
    const other = await seedOrg(h.db, admin.id);
    const batchId = crypto.randomUUID();
    await seedTwoRowBatch(owner.id, batchId);

    const result = await run(other.id, batchId, [
      {
        providerRef: "ref-a",
        selections: [{ canonicalKey: "person.email", value: "a@isolation.test" }],
        existing: null,
      },
    ]);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.id).toBe(ERROR_IDS.ENRICH_BATCH_NOT_FOUND);
    expect(await personsAt(other.id)).toHaveLength(0);
  });
});
