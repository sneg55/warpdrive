import { eq } from "drizzle-orm";
import { expect, it } from "vitest";
import { activities, activityTypes, importBatches, importRows } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import { createDef } from "@/features/custom-fields/defsRepo";
import { commitRow, type ImportActor } from "./commit";

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

// Regular (non-admin) actor holding only data.import, no activity.create.
function importOnlyActorFor(id: string): ImportActor {
  return {
    id,
    type: "regular",
    isActive: true,
    groupIds: new Set<string>(),
    primaryVisibilityGroupId: null,
    flags: new Set(["data.import"]),
  };
}

function regularActorWithCreateFor(id: string): ImportActor {
  return {
    id,
    type: "regular",
    isActive: true,
    groupIds: new Set<string>(),
    primaryVisibilityGroupId: null,
    flags: new Set(["data.import", "activity.create"]),
  };
}

async function seedValidRow(
  db: Parameters<Parameters<typeof withTestDb>[0]>[0],
  userId: string,
  mapped: Record<string, unknown>,
): Promise<{ id: string }> {
  const [batch] = await db
    .insert(importBatches)
    .values({ targetEntity: "activity", filename: "a.csv", createdBy: userId })
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

it("creates an activity, resolving the mapped typeKey to a real activity_types id", async () => {
  await withTestDb(async (db) => {
    const signal = new AbortController().signal;
    const user = await seedUser(db);
    const actor = adminActorFor(user.id);
    const [callType] = await db.select().from(activityTypes).where(eq(activityTypes.key, "call"));
    if (callType === undefined) throw new Error("seeded 'call' activity type missing");

    const row = await seedValidRow(db, user.id, {
      subject: "Follow-up call",
      typeKey: "call",
      dueAt: "2026-08-01T00:00:00.000Z",
      durationMinutes: 30,
    });

    const r = await commitRow(db, actor, row.id, "activity", "skip", signal);
    expect(r.ok).toBe(true);
    if (r.ok === true) expect(r.value.status).toBe("imported");

    const created = await db
      .select()
      .from(activities)
      .where(eq(activities.subject, "Follow-up call"));
    expect(created).toHaveLength(1);
    expect(created[0]?.typeId).toBe(callType.id);
    expect(created[0]?.ownerId).toBe(user.id);
  });
});

it("defaults an activity with no mapped typeKey to the 'task' system type", async () => {
  await withTestDb(async (db) => {
    const signal = new AbortController().signal;
    const user = await seedUser(db);
    const actor = adminActorFor(user.id);
    const [taskType] = await db.select().from(activityTypes).where(eq(activityTypes.key, "task"));
    if (taskType === undefined) throw new Error("seeded 'task' activity type missing");

    const row = await seedValidRow(db, user.id, { subject: "Unassigned-type activity" });

    const r = await commitRow(db, actor, row.id, "activity", "skip", signal);
    expect(r.ok).toBe(true);
    if (r.ok === true) expect(r.value.status).toBe("imported");

    const created = await db
      .select()
      .from(activities)
      .where(eq(activities.subject, "Unassigned-type activity"));
    expect(created[0]?.typeId).toBe(taskType.id);
  });
});

it("reports an activity row with an unresolvable typeKey as invalid (not silently dropped)", async () => {
  await withTestDb(async (db) => {
    const signal = new AbortController().signal;
    const user = await seedUser(db);
    const actor = adminActorFor(user.id);

    const row = await seedValidRow(db, user.id, {
      subject: "Bad type activity",
      typeKey: "not-a-real-type",
    });

    const r = await commitRow(db, actor, row.id, "activity", "skip", signal);
    expect(r.ok).toBe(true);
    if (r.ok === true) expect(r.value.status).toBe("invalid");

    const created = await db
      .select()
      .from(activities)
      .where(eq(activities.subject, "Bad type activity"));
    expect(created).toHaveLength(0);
  });
});

it("reports an activity row missing the required subject as invalid (not silently dropped)", async () => {
  await withTestDb(async (db) => {
    const signal = new AbortController().signal;
    const user = await seedUser(db);
    const actor = adminActorFor(user.id);

    const row = await seedValidRow(db, user.id, { typeKey: "call" });

    const r = await commitRow(db, actor, row.id, "activity", "skip", signal);
    expect(r.ok).toBe(true);
    if (r.ok === true) expect(r.value.status).toBe("invalid");
  });
});

it("carries a mapped activity custom-field value through to the created activity", async () => {
  await withTestDb(async (db) => {
    const signal = new AbortController().signal;
    const user = await seedUser(db);
    const actor = adminActorFor(user.id);

    const defResult = await createDef(
      db,
      { targetEntity: "activity", type: "text", name: "Escalation note" },
      signal,
    );
    if (defResult.ok === false) throw new Error(`createDef failed: ${defResult.error.message}`);

    const row = await seedValidRow(db, user.id, {
      subject: "CF-mapped activity",
      customFields: { escalation_note: "Handle with care" },
    });

    const r = await commitRow(db, actor, row.id, "activity", "skip", signal);
    expect(r.ok).toBe(true);
    if (r.ok === true) expect(r.value.status).toBe("imported");

    const created = await db
      .select()
      .from(activities)
      .where(eq(activities.subject, "CF-mapped activity"));
    expect(created[0]?.customFields).toEqual({ escalation_note: "Handle with care" });
  });
});

it("imports a row mapping a REQUIRED activity custom field (not CF_VALUE_INVALID)", async () => {
  await withTestDb(async (db) => {
    const signal = new AbortController().signal;
    const user = await seedUser(db);
    const actor = adminActorFor(user.id);

    const defResult = await createDef(
      db,
      { targetEntity: "activity", type: "text", name: "Priority reason", isRequired: true },
      signal,
    );
    if (defResult.ok === false) throw new Error(`createDef failed: ${defResult.error.message}`);

    const row = await seedValidRow(db, user.id, {
      subject: "Required-CF activity",
      customFields: { priority_reason: "VIP client" },
    });

    const r = await commitRow(db, actor, row.id, "activity", "skip", signal);
    expect(r.ok).toBe(true);
    if (r.ok === true) expect(r.value.status).toBe("imported");

    const created = await db
      .select()
      .from(activities)
      .where(eq(activities.subject, "Required-CF activity"));
    expect(created[0]?.customFields).toEqual({ priority_reason: "VIP client" });
  });
});

it("denies activity import for an actor with data.import but not activity.create (per-row, batch not aborted)", async () => {
  await withTestDb(async (db) => {
    const signal = new AbortController().signal;
    const user = await seedUser(db);
    const actor = importOnlyActorFor(user.id);

    const row = await seedValidRow(db, user.id, { subject: "Ungated activity" });

    const r = await commitRow(db, actor, row.id, "activity", "skip", signal);
    expect(r.ok).toBe(true);
    if (r.ok === true) {
      expect(r.value.status).toBe("invalid");
    }

    const created = await db
      .select()
      .from(activities)
      .where(eq(activities.subject, "Ungated activity"));
    expect(created).toHaveLength(0);
  });
});

it("allows activity import for an actor with data.import AND activity.create", async () => {
  await withTestDb(async (db) => {
    const signal = new AbortController().signal;
    const user = await seedUser(db);
    const actor = regularActorWithCreateFor(user.id);

    const row = await seedValidRow(db, user.id, { subject: "Gated-but-allowed activity" });

    const r = await commitRow(db, actor, row.id, "activity", "skip", signal);
    expect(r.ok).toBe(true);
    if (r.ok === true) expect(r.value.status).toBe("imported");
  });
});
