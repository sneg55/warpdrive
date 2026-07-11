import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { activities, activityTypes, deals, leads } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import type { PermSetUser } from "@/features/permissions/effective";
import { createActivity } from "./repo";

function actorOf(id: string): PermSetUser {
  return { id, type: "admin", isActive: true, groupIds: new Set(), flags: new Set() };
}

async function callTypeId(db: Parameters<typeof createActivity>[0]): Promise<string> {
  const [type] = await db.select().from(activityTypes).where(eq(activityTypes.key, "call"));
  if (type === undefined) throw new Error("activity type 'call' not found");
  return type.id;
}

it("sanitizes note HTML, stores location, and sets doneAt when done", async () => {
  await withTestDb(async (db) => {
    const user = await seedUser(db);
    const typeId = await callTypeId(db);
    const r = await createActivity(
      db,
      actorOf(user.id),
      {
        typeId,
        subject: "Call",
        note: "<p>hi</p><script>alert(1)</script>",
        location: "HQ",
        done: true,
      },
      new AbortController().signal,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const [row] = await db.select().from(activities).where(eq(activities.id, r.value.id));
    expect(row?.note).not.toContain("<script>");
    expect(row?.note).toContain("hi");
    expect(row?.location).toBe("HQ");
    expect(row?.done).toBe(true);
    expect(row?.doneAt).not.toBeNull();
  });
});

it("threads leadId into the inserted activity row (dealId stays null)", async () => {
  await withTestDb(async (db) => {
    const user = await seedUser(db);
    const typeId = await callTypeId(db);
    const [lead] = await db
      .insert(leads)
      .values({ title: "Acme lead", ownerId: user.id, visibilityLevel: "all" })
      .returning();
    if (lead === undefined) throw new Error("lead seed failed");
    const r = await createActivity(
      db,
      actorOf(user.id),
      { typeId, subject: "Qualify lead", leadId: lead.id },
      new AbortController().signal,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const [row] = await db.select().from(activities).where(eq(activities.id, r.value.id));
    expect(row?.leadId).toBe(lead.id);
    expect(row?.dealId).toBeNull();
  });
});

it("rejects a direct insert linking both a deal and a lead (single-parent DB check)", async () => {
  await withTestDb(async (db) => {
    const user = await seedUser(db);
    const typeId = await callTypeId(db);
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
    const [lead] = await db
      .insert(leads)
      .values({ title: "L", ownerId: user.id, visibilityLevel: "all" })
      .returning();
    if (deal === undefined || lead === undefined) throw new Error("seed failed");
    await expect(
      db.insert(activities).values({
        typeId,
        subject: "both parents",
        ownerId: user.id,
        assigneeId: user.id,
        dealId: deal.id,
        leadId: lead.id,
      }),
    ).rejects.toThrow();
  });
});

it("defaults note/location to null and done to false", async () => {
  await withTestDb(async (db) => {
    const user = await seedUser(db);
    const typeId = await callTypeId(db);
    const r = await createActivity(
      db,
      actorOf(user.id),
      { typeId, subject: "Call" },
      new AbortController().signal,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const [row] = await db.select().from(activities).where(eq(activities.id, r.value.id));
    expect(row?.note).toBeNull();
    expect(row?.location).toBeNull();
    expect(row?.done).toBe(false);
    expect(row?.doneAt).toBeNull();
  });
});
