import { afterAll, beforeAll, expect, it } from "vitest";
import { permissionSets, teamMembers, teams, users } from "@/db/schema";
import { makeTestDb, type TestDb } from "@/test/db";
import { hydrateActor } from "./hydrateActor";

let h: TestDb;
const SIG = () => AbortSignal.timeout(5000);

beforeAll(async () => {
  h = await makeTestDb();
});
afterAll(async () => {
  await h.close();
});

async function seedManagerOverTeam(withViewFlag: boolean): Promise<{
  managerId: string;
  memberId: string;
}> {
  const [set] = await h.db
    .insert(permissionSets)
    .values({
      name: `set-${withViewFlag}-${Math.random()}`,
      flags: { "team.viewMembers": withViewFlag },
    })
    .returning();
  const [manager] = await h.db
    .insert(users)
    .values({ email: `mgr-${Math.random()}@x.com`, name: "Mgr", permissionSetId: set?.id })
    .returning();
  const [member] = await h.db
    .insert(users)
    .values({ email: `mem-${Math.random()}@x.com`, name: "Mem" })
    .returning();
  const [team] = await h.db
    .insert(teams)
    .values({ name: `T-${Math.random()}`, managerId: manager?.id })
    .returning();
  await h.db.insert(teamMembers).values({ teamId: team?.id ?? "", userId: member?.id ?? "" });
  return { managerId: manager?.id ?? "", memberId: member?.id ?? "" };
}

it("populates managedUserIds with the team's members when the manager holds team.viewMembers", async () => {
  const { managerId, memberId } = await seedManagerOverTeam(true);
  const actor = await hydrateActor(h.db, managerId, SIG());
  expect(actor).not.toBeNull();
  expect(actor?.managedUserIds?.has(memberId)).toBe(true);
});

it("leaves managedUserIds EMPTY when the manager lacks team.viewMembers (grant is the gate)", async () => {
  const { managerId, memberId } = await seedManagerOverTeam(false);
  const actor = await hydrateActor(h.db, managerId, SIG());
  expect(actor).not.toBeNull();
  expect(actor?.managedUserIds?.has(memberId)).toBe(false);
  expect(actor?.managedUserIds?.size).toBe(0);
});

it("carries the user's display name and avatar so the app shell need not re-read the row", async () => {
  const [u] = await h.db
    .insert(users)
    .values({
      email: `disp-${Math.random()}@x.com`,
      name: "Display Name",
      avatarUrl: "https://example.test/a.png",
    })
    .returning();
  const actor = await hydrateActor(h.db, u?.id ?? "", SIG());
  expect(actor?.name).toBe("Display Name");
  expect(actor?.avatarUrl).toBe("https://example.test/a.png");
});
