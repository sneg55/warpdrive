// @vitest-environment node
import { describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import type { HydratedActor } from "@/server/hydrateActor";
import { createCaller } from "@/server/trpc/root";

function makeActor(u: { id: string; isAdmin: boolean; isActive: boolean }): HydratedActor {
  return {
    id: u.id,
    type: u.isAdmin ? "admin" : "regular",
    isActive: u.isActive,
    name: "Test User",
    email: "test@example.com",
    avatarUrl: null,
    flags: new Set(),
    groupIds: new Set<string>(),
  };
}

const GOAL = {
  subject: "activity",
  action: "completed",
  metric: "count",
  interval: "monthly",
  target: "200",
  startsOn: "2026-11-08",
} as const;

describe("goals.list", () => {
  it("names whose goal each row is, for the person picked on the dashboard", async () => {
    await withTestDb(async (db) => {
      const admin = await seedUser(db, { isAdmin: true });
      const martin = await seedUser(db, { name: "Martin Contino" });
      const [team] = await db.insert(schema.teams).values({ name: "Affiliates" }).returning();
      if (team === undefined) throw new Error("no team");
      await db.insert(schema.teamMembers).values({ teamId: team.id, userId: martin.id });
      await db.insert(schema.goals).values([
        { ...GOAL, assigneeKind: "company" },
        { ...GOAL, assigneeKind: "user", assigneeId: martin.id },
        { ...GOAL, assigneeKind: "team", assigneeId: team.id },
      ]);

      const caller = createCaller({
        db,
        session: { userId: admin.id, sessionId: "test-session" },
        actor: makeActor(admin),
      });
      const rows = await caller.goals.list({
        on: "2026-11-11",
        ownerScope: { kind: "user", userId: martin.id },
      });

      const names = new Map(rows.map((r) => [r.goal.assigneeKind, r.assigneeName]));
      expect(names).toEqual(
        new Map([
          ["company", null],
          ["user", "Martin Contino"],
          ["team", "Affiliates"],
        ]),
      );
    });
  });

  it("keeps a viewer without access to others on their own goals whoever they pick", async () => {
    await withTestDb(async (db) => {
      const nick = await seedUser(db);
      const martin = await seedUser(db);
      await db
        .insert(schema.goals)
        .values({ ...GOAL, assigneeKind: "user", assigneeId: martin.id });

      const caller = createCaller({
        db,
        session: { userId: nick.id, sessionId: "test-session" },
        actor: makeActor(nick),
      });
      const rows = await caller.goals.list({
        on: "2026-11-11",
        ownerScope: { kind: "user", userId: martin.id },
      });
      expect(rows).toEqual([]);
    });
  });
});

async function seedCompletedCalls(
  db: Parameters<Parameters<typeof withTestDb>[0]>[0],
  typeId: string,
  assigneeId: string,
  n: number,
) {
  for (let i = 0; i < n; i += 1) {
    await db.insert(schema.activities).values({
      typeId,
      subject: `done-${i}`,
      done: true,
      doneAt: new Date("2026-11-09T12:00:00Z"),
      ownerId: assigneeId,
      assigneeId,
    });
  }
}

describe("goals.list numbers", () => {
  it("counts a company goal for the person picked and for everyone", async () => {
    await withTestDb(async (db) => {
      const admin = await seedUser(db, { isAdmin: true });
      const martin = await seedUser(db);
      const nick = await seedUser(db);
      const [type] = await db
        .insert(schema.activityTypes)
        .values({ key: `t-${Math.random()}`, name: "Call" })
        .returning();
      if (type === undefined) throw new Error("no type");
      await seedCompletedCalls(db, type.id, martin.id, 3);
      await seedCompletedCalls(db, type.id, nick.id, 2);
      await db
        .insert(schema.goals)
        .values({ ...GOAL, assigneeKind: "company", activityTypeId: type.id });

      const caller = createCaller({
        db,
        session: { userId: admin.id, sessionId: "test-session" },
        actor: makeActor(admin),
      });
      const picked = await caller.goals.list({
        on: "2026-11-11",
        ownerScope: { kind: "user", userId: martin.id },
      });
      const everyone = await caller.goals.list({ on: "2026-11-11", ownerScope: { kind: "all" } });
      expect(picked.map((r) => r.progress?.actual)).toEqual(["3"]);
      expect(everyone.map((r) => r.progress?.actual)).toEqual(["5"]);
    });
  });

  it("clamps a viewer without access to others to their own numbers", async () => {
    await withTestDb(async (db) => {
      const nick = await seedUser(db);
      const martin = await seedUser(db);
      const [type] = await db
        .insert(schema.activityTypes)
        .values({ key: `t-${Math.random()}`, name: "Call" })
        .returning();
      if (type === undefined) throw new Error("no type");
      await seedCompletedCalls(db, type.id, nick.id, 1);
      await seedCompletedCalls(db, type.id, martin.id, 2);
      await db
        .insert(schema.goals)
        .values({ ...GOAL, assigneeKind: "company", activityTypeId: type.id });

      const caller = createCaller({
        db,
        session: { userId: nick.id, sessionId: "test-session" },
        actor: makeActor(nick),
      });
      const rows = await caller.goals.list({ on: "2026-11-11", ownerScope: { kind: "all" } });
      expect(rows.map((r) => r.progress?.actual)).toEqual(["1"]);
    });
  });
});
