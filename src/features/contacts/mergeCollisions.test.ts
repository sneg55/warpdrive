import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { dealParticipants, deals, labels, personLabels } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import { mergePersons } from "./merge";
import { adminActor } from "./mergeTestActors";
import { createPerson } from "./personsRepo";

it("FIX 3: deal_participants PK collision repoints to exactly one survivor row", async () => {
  await withTestDb(async (db) => {
    const signal = new AbortController().signal;
    const user = await seedUser(db);
    const actor = adminActor(user.id);

    const survivor = await createPerson(
      db,
      actor,
      { name: "S", emails: [], phones: [], orgId: null, customFields: {} },
      signal,
    );
    const dup = await createPerson(
      db,
      actor,
      { name: "D", emails: [], phones: [], orgId: null, customFields: {} },
      signal,
    );
    if (survivor.ok === false || dup.ok === false) throw new Error("setup failed");

    const pipe = await seedPipelineWithStages(db, ["Lead"]);
    const stage = pipe.stages[0];
    if (stage === undefined) throw new Error("stage seed failed");
    const [deal] = await db
      .insert(deals)
      .values({
        title: "D",
        pipelineId: pipe.pipeline.id,
        stageId: stage.id,
        ownerId: user.id,
        visibilityLevel: "all",
      })
      .returning();
    if (deal === undefined) throw new Error("deal seed failed");

    // BOTH survivor and dup participate on the same deal -> PK collision on repoint.
    await db.insert(dealParticipants).values([
      { dealId: deal.id, personId: survivor.value.id },
      { dealId: deal.id, personId: dup.value.id },
    ]);

    const r = await mergePersons(
      db,
      actor,
      { survivorId: survivor.value.id, mergedId: dup.value.id, fieldChoices: {} },
      signal,
    );
    expect(r.ok).toBe(true);

    const parts = await db
      .select()
      .from(dealParticipants)
      .where(eq(dealParticipants.dealId, deal.id));
    expect(parts).toHaveLength(1);
    expect(parts[0]?.personId).toBe(survivor.value.id);
  });
});

it("F1: person_labels PK collision repoints to exactly one survivor row", async () => {
  await withTestDb(async (db) => {
    const signal = new AbortController().signal;
    const user = await seedUser(db);
    const actor = adminActor(user.id);

    const survivor = await createPerson(
      db,
      actor,
      { name: "S", emails: [], phones: [], orgId: null, customFields: {} },
      signal,
    );
    const dup = await createPerson(
      db,
      actor,
      { name: "D", emails: [], phones: [], orgId: null, customFields: {} },
      signal,
    );
    if (survivor.ok === false || dup.ok === false) throw new Error("setup failed");

    const [label] = await db
      .insert(labels)
      .values({ target: "person", name: "VIP", color: "blue" })
      .returning();
    if (label === undefined) throw new Error("label seed failed");

    // BOTH survivor and dup carry the same label -> PK collision on repoint.
    await db.insert(personLabels).values([
      { personId: survivor.value.id, labelId: label.id },
      { personId: dup.value.id, labelId: label.id },
    ]);

    const r = await mergePersons(
      db,
      actor,
      { survivorId: survivor.value.id, mergedId: dup.value.id, fieldChoices: {} },
      signal,
    );
    expect(r.ok).toBe(true);

    const rows = await db.select().from(personLabels).where(eq(personLabels.labelId, label.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.personId).toBe(survivor.value.id);
  });
});
