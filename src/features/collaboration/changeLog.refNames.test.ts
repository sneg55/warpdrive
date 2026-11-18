import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import {
  CHANGE_FIELD_CONVERTED_DEAL,
  CHANGE_FIELD_CONVERTED_TO_LEAD,
  CHANGE_FIELD_MERGE,
  CHANGE_FIELD_MERGED_DEAL,
  CHANGE_FIELD_OWNER_ID,
  REMOVED_USER_LABEL,
  UNAVAILABLE_RECORD_LABEL,
} from "@/constants/changeLogFields";
import { deals, leads, organizations, persons } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import type { EntityType } from "@/types/entityRef";
import type { DealVisibilitySession } from "@/types/session";
import { listChangeLogForViewer, recordChange } from "./changeLog";

type TestDb = Parameters<Parameters<typeof withTestDb>[0]>[0];
const signal = new AbortController().signal;

function viewer(userId: string, isAdmin: boolean): DealVisibilitySession {
  return { userId, isAdmin, isActive: true, sessionLive: true, visibilityGroupIds: [] };
}

async function seedDeal(
  db: TestDb,
  ownerId: string,
  title: string,
  visibilityLevel: "all" | "owner" = "all",
): Promise<string> {
  const pipe = await seedPipelineWithStages(db, ["Lead"]);
  const stageId = pipe.stages[0]?.id ?? "";
  const [deal] = await db
    .insert(deals)
    .values({ title, pipelineId: pipe.pipeline.id, stageId, ownerId, visibilityLevel })
    .returning({ id: deals.id });
  return deal?.id ?? "";
}

async function logAndRead(
  db: TestDb,
  reader: DealVisibilitySession,
  entityType: EntityType,
  field: string,
  values: { oldValue: unknown; newValue: unknown },
): Promise<{ oldValue: unknown; newValue: unknown } | undefined> {
  const entityId = randomUUID();
  await recordChange(
    db,
    { entityType, entityId, field, ...values, actorId: reader.userId },
    signal,
  );
  const [entry] = await listChangeLogForViewer(db, reader, entityType, entityId, signal);
  return entry;
}

it("resolves owner change ids to the owners' names, and a missing user to a removed label", async () => {
  await withTestDb(async (db) => {
    const alice = await seedUser(db, { name: "Alice Owner" });
    const bob = await seedUser(db, { name: "Bob Owner" });
    const reader = viewer(alice.id, false);
    const changed = await logAndRead(db, reader, "deal", CHANGE_FIELD_OWNER_ID, {
      oldValue: alice.id,
      newValue: bob.id.toUpperCase(),
    });
    expect(changed).toMatchObject({ oldValue: "Alice Owner", newValue: "Bob Owner" });
    const gone = await logAndRead(db, reader, "deal", CHANGE_FIELD_OWNER_ID, {
      oldValue: randomUUID(),
      newValue: bob.id,
    });
    expect(gone).toMatchObject({ oldValue: REMOVED_USER_LABEL, newValue: "Bob Owner" });
  });
});

it("resolves deal references to titles, including a soft-deleted merged deal", async () => {
  await withTestDb(async (db) => {
    const user = await seedUser(db);
    const reader = viewer(user.id, false);
    const dealId = await seedDeal(db, user.id, "Acme renewal");
    await db.update(deals).set({ deletedAt: new Date() }).where(eq(deals.id, dealId));
    const merged = await logAndRead(db, reader, "deal", CHANGE_FIELD_MERGED_DEAL, {
      oldValue: null,
      newValue: dealId.toUpperCase(),
    });
    expect(merged?.newValue).toBe("Acme renewal");
    const converted = await logAndRead(db, reader, "lead", CHANGE_FIELD_CONVERTED_DEAL, {
      oldValue: null,
      newValue: dealId,
    });
    expect(converted?.newValue).toBe("Acme renewal");
  });
});

it("hides the title of a referenced deal the reader cannot see", async () => {
  await withTestDb(async (db) => {
    const owner = await seedUser(db);
    const other = await seedUser(db);
    const dealId = await seedDeal(db, owner.id, "Secret deal", "owner");
    const values = { oldValue: null, newValue: dealId };
    const hidden = await logAndRead(
      db,
      viewer(other.id, false),
      "lead",
      CHANGE_FIELD_CONVERTED_DEAL,
      values,
    );
    expect(hidden?.newValue).toBe(UNAVAILABLE_RECORD_LABEL);
    const admin = await logAndRead(
      db,
      viewer(other.id, true),
      "lead",
      CHANGE_FIELD_CONVERTED_DEAL,
      values,
    );
    expect(admin?.newValue).toBe("Secret deal");
  });
});

it("resolves a converted-to-lead reference only when the reader can see the lead", async () => {
  await withTestDb(async (db) => {
    const owner = await seedUser(db);
    const other = await seedUser(db);
    const [lead] = await db
      .insert(leads)
      .values({ title: "Acme lead", ownerId: owner.id, visibilityLevel: "owner" })
      .returning({ id: leads.id });
    const values = { oldValue: null, newValue: lead?.id };
    const own = await logAndRead(
      db,
      viewer(owner.id, false),
      "deal",
      CHANGE_FIELD_CONVERTED_TO_LEAD,
      values,
    );
    expect(own?.newValue).toBe("Acme lead");
    const hidden = await logAndRead(
      db,
      viewer(other.id, false),
      "deal",
      CHANGE_FIELD_CONVERTED_TO_LEAD,
      values,
    );
    expect(hidden?.newValue).toBe(UNAVAILABLE_RECORD_LABEL);
  });
});

it("resolves a contact merge against the table of the entity it was logged on", async () => {
  await withTestDb(async (db) => {
    const user = await seedUser(db);
    const other = await seedUser(db);
    const reader = viewer(user.id, false);
    const [person] = await db
      .insert(persons)
      .values({ name: "Jane Doe", ownerId: user.id, visibilityLevel: "all", deletedAt: new Date() })
      .returning({ id: persons.id });
    const [org] = await db
      .insert(organizations)
      .values({ name: "Acme Inc", ownerId: other.id, visibilityLevel: "owner" })
      .returning({ id: organizations.id });
    const p = await logAndRead(db, reader, "person", CHANGE_FIELD_MERGE, {
      oldValue: person?.id,
      newValue: randomUUID(),
    });
    expect(p).toMatchObject({ oldValue: "Jane Doe", newValue: UNAVAILABLE_RECORD_LABEL });
    const o = await logAndRead(db, reader, "organization", CHANGE_FIELD_MERGE, {
      oldValue: org?.id,
      newValue: null,
    });
    expect(o).toMatchObject({ oldValue: UNAVAILABLE_RECORD_LABEL, newValue: null });
  });
});

it("leaves non-reference fields untouched even when the value looks like an id", async () => {
  await withTestDb(async (db) => {
    const alice = await seedUser(db, { name: "Alice Owner" });
    const entry = await logAndRead(db, viewer(alice.id, true), "deal", "title", {
      oldValue: alice.id,
      newValue: "Renamed",
    });
    expect(entry?.oldValue).toBe(alice.id);
  });
});
