import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { deals, importBatches, importRows } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import { createDef } from "@/features/custom-fields/defsRepo";
import { commitRow, type ImportActor } from "./commit";

// Admin bypasses createDeal's deal.create gate, keeping these tests focused on the
// pipeline/stage-name resolution mechanics rather than permission-flag plumbing.
function adminActorFor(id: string): ImportActor {
  return {
    id,
    type: "admin",
    isActive: true,
    groupIds: new Set<string>(),
    primaryVisibilityGroupId: null,
    flags: new Set(),
  };
}

async function seedValidRow(
  db: Parameters<Parameters<typeof withTestDb>[0]>[0],
  userId: string,
  mapped: Record<string, unknown>,
): Promise<{ id: string }> {
  const [batch] = await db
    .insert(importBatches)
    .values({ targetEntity: "deal", filename: "d.csv", createdBy: userId })
    .returning();
  if (batch === undefined) throw new Error("batch seed failed");
  const [row] = await db
    .insert(importRows)
    .values({
      batchId: batch.id,
      rowNumber: 1,
      raw: {},
      mapped: { primary: mapped },
      status: "valid",
    })
    .returning();
  if (row === undefined) throw new Error("row seed failed");
  return row;
}

it("creates a deal, resolving the mapped pipeline/stage names to ids", async () => {
  await withTestDb(async (db) => {
    const signal = new AbortController().signal;
    const user = await seedUser(db);
    const actor = adminActorFor(user.id);
    const p = await seedPipelineWithStages(db, ["Qualified", "Won"]);
    const stage = p.stages[0];
    if (stage === undefined) throw new Error("no stage seeded");

    const row = await seedValidRow(db, user.id, {
      title: "Acme deal",
      value: 1200.5,
      expectedCloseDate: null,
      pipeline: p.pipeline.name,
      stage: stage.name,
    });

    const r = await commitRow(db, actor, row.id, "deal", "skip", signal);
    expect(r.ok).toBe(true);
    if (r.ok === true) expect(r.value.status).toBe("imported");

    const created = await db.select().from(deals).where(eq(deals.title, "Acme deal"));
    expect(created).toHaveLength(1);
    expect(created[0]?.stageId).toBe(stage.id);
    expect(created[0]?.pipelineId).toBe(p.pipeline.id);
    expect(created[0]?.ownerId).toBe(user.id);
  });
});

it("defaults to the pipeline's first stage when the CSV leaves stage unmapped", async () => {
  await withTestDb(async (db) => {
    const signal = new AbortController().signal;
    const user = await seedUser(db);
    const actor = adminActorFor(user.id);
    const p = await seedPipelineWithStages(db, ["First", "Second"]);
    const firstStage = p.stages[0];
    if (firstStage === undefined) throw new Error("no stage seeded");

    const row = await seedValidRow(db, user.id, {
      title: "No stage mapped",
      pipeline: p.pipeline.name,
    });

    const r = await commitRow(db, actor, row.id, "deal", "skip", signal);
    expect(r.ok).toBe(true);
    if (r.ok === true) expect(r.value.status).toBe("imported");

    const created = await db.select().from(deals).where(eq(deals.title, "No stage mapped"));
    expect(created[0]?.stageId).toBe(firstStage.id);
  });
});

it("reports a deal row with an unresolvable pipeline name as invalid (not silently dropped)", async () => {
  await withTestDb(async (db) => {
    const signal = new AbortController().signal;
    const user = await seedUser(db);
    const actor = adminActorFor(user.id);

    const row = await seedValidRow(db, user.id, {
      title: "Ghost pipeline deal",
      pipeline: "Does Not Exist",
    });

    const r = await commitRow(db, actor, row.id, "deal", "skip", signal);
    expect(r.ok).toBe(true);
    if (r.ok === true) expect(r.value.status).toBe("invalid");

    const created = await db.select().from(deals).where(eq(deals.title, "Ghost pipeline deal"));
    expect(created).toHaveLength(0);
  });
});

it("reports a deal row missing the required title as invalid (not silently dropped)", async () => {
  await withTestDb(async (db) => {
    const signal = new AbortController().signal;
    const user = await seedUser(db);
    const actor = adminActorFor(user.id);

    const row = await seedValidRow(db, user.id, { value: 100 });

    const r = await commitRow(db, actor, row.id, "deal", "skip", signal);
    expect(r.ok).toBe(true);
    if (r.ok === true) expect(r.value.status).toBe("invalid");
  });
});

// Deal imports must retain the custom fields validated during mapping. createDeal applies the
// current definition rules again at its trust boundary and persists the parsed values.
it("imports and persists a mapped required deal custom field", async () => {
  await withTestDb(async (db) => {
    const signal = new AbortController().signal;
    const user = await seedUser(db);
    const actor = adminActorFor(user.id);
    const p = await seedPipelineWithStages(db, ["Qualified"]);

    const defResult = await createDef(
      db,
      { targetEntity: "deal", type: "text", name: "Deal source note", isRequired: true },
      signal,
    );
    if (defResult.ok === false) throw new Error(`createDef failed: ${defResult.error.message}`);

    const row = await seedValidRow(db, user.id, {
      title: "CF-mapped deal",
      pipeline: p.pipeline.name,
      customFields: { deal_source_note: "Inbound referral" },
    });

    const r = await commitRow(db, actor, row.id, "deal", "skip", signal);
    expect(r.ok).toBe(true);
    if (r.ok === true) expect(r.value.status).toBe("imported");

    const created = await db.select().from(deals).where(eq(deals.title, "CF-mapped deal"));
    expect(created).toHaveLength(1);
    expect(created[0]?.customFields).toEqual({ deal_source_note: "Inbound referral" });
  });
});
