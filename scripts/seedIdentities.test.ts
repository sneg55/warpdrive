import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { userIdentities, users } from "@/db/schema";
import { makeTestDb, type TestDb } from "@/test/db";
import { seedInvitedUser } from "./seed-demo-graph";
import { setupDemoUsers } from "./seed-demo-users";
import { seedUser } from "./seed-smoke";
import { SMOKE_EMAIL } from "./seed-smoke-config";
import {
  type Db,
  makeDb,
  seedPermissionSets,
  seedVisibilityGroups,
  upsertUser,
} from "./seed-smoke-phase5-infra";

let h: TestDb;
let db: Db;

beforeAll(async () => {
  h = await makeTestDb();
  db = makeDb(h.pool);
});

afterAll(async () => {
  await h.close();
});

beforeEach(async () => {
  await h.db.execute(
    sql`TRUNCATE visibility_group_members, visibility_groups, user_identities, sessions, users, permission_sets, settings, audit_events RESTART IDENTITY CASCADE`,
  );
});

describe("seed scripts write user_identities, not users.google_sub", () => {
  test("upsertUser seeds a dev identity and is idempotent", async () => {
    const { regularSetId } = await seedPermissionSets(db);
    const { everyoneGroupId } = await seedVisibilityGroups(db);

    const userId = await upsertUser(
      db,
      "seed1@example.com",
      "Seed One",
      false,
      regularSetId,
      everyoneGroupId,
    );
    const again = await upsertUser(
      db,
      "seed1@example.com",
      "Seed One",
      false,
      regularSetId,
      everyoneGroupId,
    );
    expect(again).toBe(userId);

    const allUsers = await h.db.select().from(users);
    expect(allUsers).toHaveLength(1);
    expect(allUsers[0]!.email).toBe("seed1@example.com");

    const identities = await h.db.select().from(userIdentities);
    expect(identities).toHaveLength(1);
    expect(identities[0]!.provider).toBe("dev");
    expect(identities[0]!.subject).toBe("dev-seed1@example.com");
    expect(identities[0]!.userId).toBe(userId);
  });

  test("setupDemoUsers seeds dev identities for demo users and the former rep", async () => {
    const { regularSetId, adminSetId } = await seedPermissionSets(db);
    const { everyoneGroupId } = await seedVisibilityGroups(db);

    await setupDemoUsers(
      db,
      [
        { email: "demo1@example.com", name: "Demo One", admin: true },
        { email: "demo2@example.com", name: "Demo Two", admin: false },
      ],
      regularSetId,
      adminSetId,
      everyoneGroupId,
    );

    const identities = await h.db.select().from(userIdentities);
    expect(identities.map((i) => i.subject).sort()).toEqual([
      "dev-demo1@example.com",
      "dev-demo2@example.com",
      "dev-demo6@example.com",
    ]);
    for (const identity of identities) expect(identity.provider).toBe("dev");
  });

  test("seedInvitedUser leaves the invited user without an identity", async () => {
    const { regularSetId } = await seedPermissionSets(db);
    const { everyoneGroupId } = await seedVisibilityGroups(db);

    await seedInvitedUser(db, regularSetId, everyoneGroupId);

    const allUsers = await h.db.select().from(users);
    expect(allUsers).toHaveLength(1);
    expect(allUsers[0]!.email).toBe("demo-invited@example.com");
    expect(allUsers[0]!.invitedAt).not.toBeNull();
    expect(await h.db.select().from(userIdentities)).toHaveLength(0);
  });

  test("seedUser seeds a dev identity for the smoke user", async () => {
    const userId = await seedUser(db);

    const identities = await h.db.select().from(userIdentities);
    expect(identities).toHaveLength(1);
    expect(identities[0]!.provider).toBe("dev");
    expect(identities[0]!.subject).toBe(`dev-${SMOKE_EMAIL}`);
    expect(identities[0]!.userId).toBe(userId);
  });
});
