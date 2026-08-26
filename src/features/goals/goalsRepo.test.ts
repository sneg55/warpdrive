import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { seedUser, toActor } from "@/features/stats/statsTestHelpers";
import { makeTestDb, type TestDb } from "@/test/db";
import { assigneeExists, deleteGoal, listVisibleGoals } from "./goalsRepo";

let h: TestDb;
beforeAll(async () => {
  h = await makeTestDb();
});
afterAll(async () => {
  await h.close();
});

async function seedGoal(values: Partial<typeof schema.goals.$inferInsert>) {
  const [g] = await h.db
    .insert(schema.goals)
    .values({
      subject: "deal",
      action: "won",
      metric: "value",
      assigneeKind: "company",
      interval: "monthly",
      target: "1000.00",
      startsOn: "2026-01-01",
      ...values,
    })
    .returning();
  if (g === undefined) throw new Error("no goal row");
  return g;
}

describe("listVisibleGoals", () => {
  it("shows a regular user their own goal, their team's, and company-wide ones", async () => {
    const alice = await seedUser(h);
    const bob = await seedUser(h);
    const [team] = await h.db
      .insert(schema.teams)
      .values({ name: `T-${Date.now()}-${Math.random()}` })
      .returning();
    if (team === undefined) throw new Error("no team");
    await h.db.insert(schema.teamMembers).values({ teamId: team.id, userId: alice.id });

    const own = await seedGoal({ assigneeKind: "user", assigneeId: alice.id });
    const teamGoal = await seedGoal({ assigneeKind: "team", assigneeId: team.id });
    const companyGoal = await seedGoal({ assigneeKind: "company" });
    const bobsGoal = await seedGoal({ assigneeKind: "user", assigneeId: bob.id });

    const rows = await listVisibleGoals(h.db, toActor(alice), new AbortController().signal);
    const ids = new Set(rows.map((r) => r.id));
    expect(ids.has(own.id)).toBe(true);
    expect(ids.has(teamGoal.id)).toBe(true);
    expect(ids.has(companyGoal.id)).toBe(true);
    // Another rep's quota is not Alice's business without stats.viewOthers.
    expect(ids.has(bobsGoal.id)).toBe(false);
  });

  it("hides a team goal from someone who is not on that team", async () => {
    const alice = await seedUser(h);
    const [team] = await h.db
      .insert(schema.teams)
      .values({ name: `T-${Date.now()}-${Math.random()}` })
      .returning();
    if (team === undefined) throw new Error("no team");
    const teamGoal = await seedGoal({ assigneeKind: "team", assigneeId: team.id });

    const rows = await listVisibleGoals(h.db, toActor(alice), new AbortController().signal);
    expect(rows.some((r) => r.id === teamGoal.id)).toBe(false);
  });

  it("shows an admin every goal", async () => {
    const admin = await seedUser(h, { isAdmin: true });
    const someone = await seedUser(h);
    const theirs = await seedGoal({ assigneeKind: "user", assigneeId: someone.id });

    const rows = await listVisibleGoals(h.db, toActor(admin), new AbortController().signal);
    expect(rows.some((r) => r.id === theirs.id)).toBe(true);
  });

  it("drops a deleted goal from the list", async () => {
    const admin = await seedUser(h, { isAdmin: true });
    const g = await seedGoal({ assigneeKind: "company" });
    expect(await deleteGoal(h.db, g.id, new AbortController().signal)).toBe(true);

    const rows = await listVisibleGoals(h.db, toActor(admin), new AbortController().signal);
    expect(rows.some((r) => r.id === g.id)).toBe(false);
  });

  it("reports a second delete as a no-op rather than succeeding twice", async () => {
    const g = await seedGoal({ assigneeKind: "company" });
    expect(await deleteGoal(h.db, g.id, new AbortController().signal)).toBe(true);
    expect(await deleteGoal(h.db, g.id, new AbortController().signal)).toBe(false);
  });
});

describe("assigneeExists", () => {
  it("accepts a real user for a user goal", async () => {
    const u = await seedUser(h);
    expect(await assigneeExists(h.db, "user", u.id, new AbortController().signal)).toBe(true);
  });

  // No foreign key can express "users OR teams depending on another column", so a goal against
  // a made-up id would otherwise be stored and never resolve to anyone.
  it("rejects an id that belongs to no user", async () => {
    const missing = "11111111-1111-4111-8111-111111111111";
    expect(await assigneeExists(h.db, "user", missing, new AbortController().signal)).toBe(false);
  });

  it("rejects a user id passed as a team", async () => {
    const u = await seedUser(h);
    expect(await assigneeExists(h.db, "team", u.id, new AbortController().signal)).toBe(false);
  });

  it("needs no assignee for a company goal", async () => {
    expect(await assigneeExists(h.db, "company", null, new AbortController().signal)).toBe(true);
  });
});
