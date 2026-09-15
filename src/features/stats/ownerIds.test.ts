import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { makeTestDb, type TestDb } from "@/test/db";
import { resolveOwnerIds } from "./ownerIds";
import { seedUser, toActor } from "./statsTestHelpers";

let h: TestDb;

beforeAll(async () => {
  h = await makeTestDb();
});

afterAll(async () => {
  await h.close();
});

async function seedTeam(memberIds: string[]) {
  const [team] = await h.db
    .insert(schema.teams)
    .values({ name: `Team-${Math.random().toString(36).slice(2)}` })
    .returning();
  if (team === undefined) throw new Error("seedTeam: no rows");
  if (memberIds.length > 0) {
    await h.db
      .insert(schema.teamMembers)
      .values(memberIds.map((userId) => ({ teamId: team.id, userId })));
  }
  return team;
}

const SIG = () => new AbortController().signal;

describe("resolveOwnerIds", () => {
  it("scopes 'me' to the actor alone", async () => {
    const alice = await seedUser(h);
    expect(await resolveOwnerIds(h.db, toActor(alice), { kind: "me" }, SIG())).toEqual({
      everyone: false,
      ids: [alice.id],
    });
  });

  it("scopes 'all' to everyone", async () => {
    const alice = await seedUser(h);
    expect(await resolveOwnerIds(h.db, toActor(alice), { kind: "all" }, SIG())).toEqual({
      everyone: true,
    });
  });

  it("scopes a named user to that user alone", async () => {
    const alice = await seedUser(h);
    const bob = await seedUser(h);
    expect(
      await resolveOwnerIds(h.db, toActor(alice), { kind: "user", userId: bob.id }, SIG()),
    ).toEqual({ everyone: false, ids: [bob.id] });
  });

  it("scopes a team to its members", async () => {
    const alice = await seedUser(h);
    const bob = await seedUser(h);
    const team = await seedTeam([alice.id, bob.id]);
    const result = await resolveOwnerIds(
      h.db,
      toActor(alice),
      { kind: "team", teamId: team.id },
      SIG(),
    );
    expect(result.everyone).toBe(false);
    expect(result.everyone === false ? [...result.ids].sort() : []).toEqual(
      [alice.id, bob.id].sort(),
    );
  });

  it("scopes an empty team to nobody rather than widening to everyone", async () => {
    const alice = await seedUser(h);
    const team = await seedTeam([]);
    expect(
      await resolveOwnerIds(h.db, toActor(alice), { kind: "team", teamId: team.id }, SIG()),
    ).toEqual({ everyone: false, ids: [] });
  });

  it("scopes a team that does not exist to nobody", async () => {
    const alice = await seedUser(h);
    expect(
      await resolveOwnerIds(
        h.db,
        toActor(alice),
        { kind: "team", teamId: "00000000-0000-0000-0000-000000000000" },
        SIG(),
      ),
    ).toEqual({ everyone: false, ids: [] });
  });
});
