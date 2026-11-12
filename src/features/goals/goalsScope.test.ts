import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { seedUser, toActor } from "@/features/stats/statsTestHelpers";
import { makeTestDb, type TestDb } from "@/test/db";
import type { OwnerScope } from "@/types/stats";
import { listVisibleGoals } from "./goalsRepo";

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
      subject: "activity",
      action: "completed",
      metric: "count",
      assigneeKind: "company",
      interval: "monthly",
      target: "200",
      startsOn: "2026-01-01",
      ...values,
    })
    .returning();
  if (g === undefined) throw new Error("no goal row");
  return g;
}

async function seedTeam(memberIds: string[]) {
  const [team] = await h.db
    .insert(schema.teams)
    .values({ name: `T-${Date.now()}-${Math.random()}` })
    .returning();
  if (team === undefined) throw new Error("no team");
  for (const userId of memberIds)
    await h.db.insert(schema.teamMembers).values({ teamId: team.id, userId });
  return team;
}

async function world() {
  const admin = await seedUser(h, { isAdmin: true });
  const martin = await seedUser(h);
  const nick = await seedUser(h);
  const martinsTeam = await seedTeam([martin.id]);
  const otherTeam = await seedTeam([nick.id]);
  return {
    admin,
    martin,
    nick,
    martinsTeam,
    company: await seedGoal({ assigneeKind: "company" }),
    martinsGoal: await seedGoal({ assigneeKind: "user", assigneeId: martin.id }),
    nicksGoal: await seedGoal({ assigneeKind: "user", assigneeId: nick.id }),
    martinsTeamGoal: await seedGoal({ assigneeKind: "team", assigneeId: martinsTeam.id }),
    otherTeamGoal: await seedGoal({ assigneeKind: "team", assigneeId: otherTeam.id }),
  };
}

async function idsFor(actor: typeof schema.users.$inferSelect, scope: OwnerScope) {
  const rows = await listVisibleGoals(h.db, toActor(actor), scope, new AbortController().signal);
  return new Set(rows.map((r) => r.id));
}

function seededIn(w: Awaited<ReturnType<typeof world>>, ids: Set<string>): Set<string> {
  const seeded = [w.company, w.martinsGoal, w.nicksGoal, w.martinsTeamGoal, w.otherTeamGoal];
  return new Set(seeded.map((g) => g.id).filter((id) => ids.has(id)));
}

describe("listVisibleGoals under the dashboard's owner picker", () => {
  it("shows only the goals that apply to the selected person", async () => {
    const w = await world();
    const ids = seededIn(w, await idsFor(w.admin, { kind: "user", userId: w.martin.id }));
    expect(ids).toEqual(new Set([w.company.id, w.martinsGoal.id, w.martinsTeamGoal.id]));
  });

  it("shows only the selected team's goals and company-wide ones", async () => {
    const w = await world();
    const ids = seededIn(w, await idsFor(w.admin, { kind: "team", teamId: w.martinsTeam.id }));
    expect(ids).toEqual(new Set([w.company.id, w.martinsTeamGoal.id]));
  });

  it("keeps a viewer with access to others on their own goals at the default scope", async () => {
    const w = await world();
    const ids = await idsFor(w.admin, { kind: "me" });
    expect(ids.has(w.company.id)).toBe(true);
    expect(ids.has(w.martinsGoal.id)).toBe(false);
    expect(ids.has(w.nicksGoal.id)).toBe(false);
    expect(ids.has(w.martinsTeamGoal.id)).toBe(false);
    expect(ids.has(w.otherTeamGoal.id)).toBe(false);
  });

  it("shows every goal when everyone is selected", async () => {
    const w = await world();
    const ids = await idsFor(w.admin, { kind: "all" });
    for (const g of [w.company, w.martinsGoal, w.nicksGoal, w.martinsTeamGoal, w.otherTeamGoal]) {
      expect(ids.has(g.id)).toBe(true);
    }
  });

  it("never widens past the viewer's own goals without access to others", async () => {
    const w = await world();
    const ids = await idsFor(w.nick, { kind: "user", userId: w.martin.id });
    expect(ids.has(w.martinsGoal.id)).toBe(false);
    expect(ids.has(w.martinsTeamGoal.id)).toBe(false);
    expect(ids.has(w.nicksGoal.id)).toBe(true);
  });
});
