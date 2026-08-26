// The dominant-parent rule (deal > person > org > parentless) mirrored in SQL. Exercised
// through activitiesByType, which is one of the three queries that apply it.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { makeTestDb, type TestDb } from "@/test/db";
import type { DashboardFilters } from "@/types/stats";
import { activitiesByType } from "./activitiesByType";
import { seedActivityType, seedOrg, seedPerson, seedUser, toActor } from "./statsTestHelpers";

let h: TestDb;
beforeAll(async () => {
  h = await makeTestDb();
});
afterAll(async () => {
  await h.close();
});

const BASE: DashboardFilters = {
  pipelineId: null,
  ownerScope: "all",
  from: "2025-01-01",
  to: "2025-12-31",
};

const DONE_AT = new Date("2025-03-01T00:00:00Z");

async function countFor(
  actorRow: { id: string; isAdmin: boolean; isActive: boolean },
  typeId: string,
) {
  const rows = await activitiesByType(
    h.db,
    toActor(actorRow as never),
    BASE,
    new AbortController().signal,
  );
  return rows.find((r) => r.typeId === typeId)?.completed ?? 0;
}

describe("activity aggregation honours the dominant parent", () => {
  it("excludes an activity whose person parent is invisible to the viewer", async () => {
    const alice = await seedUser(h);
    const bob = await seedUser(h);
    const type = await seedActivityType(h, "Call");
    const person = await seedPerson(h, {
      name: "Bob's private contact",
      ownerId: bob.id,
      visibilityLevel: "owner",
    });
    await h.db.insert(schema.activities).values({
      typeId: type.id,
      subject: "call on a private person",
      done: true,
      doneAt: DONE_AT,
      ownerId: bob.id,
      assigneeId: bob.id,
      personId: person.id,
    });

    expect(await countFor(alice, type.id)).toBe(0);
  });

  it("includes an activity whose person parent is visible to everyone", async () => {
    const alice = await seedUser(h);
    const bob = await seedUser(h);
    const type = await seedActivityType(h, "Call");
    const person = await seedPerson(h, {
      name: "Shared contact",
      ownerId: bob.id,
      visibilityLevel: "all",
    });
    await h.db.insert(schema.activities).values({
      typeId: type.id,
      subject: "call on a shared person",
      done: true,
      doneAt: DONE_AT,
      ownerId: bob.id,
      assigneeId: bob.id,
      personId: person.id,
    });

    expect(await countFor(alice, type.id)).toBe(1);
  });

  it("excludes an activity whose organization parent is invisible to the viewer", async () => {
    const alice = await seedUser(h);
    const bob = await seedUser(h);
    const type = await seedActivityType(h, "Call");
    const org = await seedOrg(h, {
      name: "Bob's private org",
      ownerId: bob.id,
      visibilityLevel: "owner",
    });
    await h.db.insert(schema.activities).values({
      typeId: type.id,
      subject: "call on a private org",
      done: true,
      doneAt: DONE_AT,
      ownerId: bob.id,
      assigneeId: bob.id,
      orgId: org.id,
    });

    expect(await countFor(alice, type.id)).toBe(0);
  });

  it("excludes a parentless activity belonging to someone else", async () => {
    const alice = await seedUser(h);
    const bob = await seedUser(h);
    const type = await seedActivityType(h, "Call");
    await h.db.insert(schema.activities).values({
      typeId: type.id,
      subject: "bob's private todo",
      done: true,
      doneAt: DONE_AT,
      ownerId: bob.id,
      assigneeId: bob.id,
    });

    expect(await countFor(alice, type.id)).toBe(0);
  });

  it("includes a parentless activity assigned to the viewer", async () => {
    const alice = await seedUser(h);
    const type = await seedActivityType(h, "Call");
    await h.db.insert(schema.activities).values({
      typeId: type.id,
      subject: "my own todo",
      done: true,
      doneAt: DONE_AT,
      ownerId: alice.id,
      assigneeId: alice.id,
    });

    expect(await countFor(alice, type.id)).toBe(1);
  });

  it("includes a parentless activity the viewer participates in", async () => {
    const alice = await seedUser(h);
    const bob = await seedUser(h);
    const type = await seedActivityType(h, "Call");
    const [activity] = await h.db
      .insert(schema.activities)
      .values({
        typeId: type.id,
        subject: "joint call",
        done: true,
        doneAt: DONE_AT,
        ownerId: bob.id,
        assigneeId: bob.id,
      })
      .returning();
    if (activity === undefined) throw new Error("no activity");
    await h.db
      .insert(schema.activityParticipants)
      .values({ activityId: activity.id, userId: alice.id });

    expect(await countFor(alice, type.id)).toBe(1);
  });
});
