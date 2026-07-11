import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, expect, test } from "vitest";
import { users } from "@/db/schema";
import type { PermSetUser } from "@/features/permissions/effective";
import { makeTestDb, type TestDb } from "@/test/db";
import { createPermissionSet } from "./permission-sets.service";
import { assignPermissionSet } from "./users.service";

// Codex finding F11: assignPermissionSet only checked permissions.manage + not-self. A
// non-admin manager could ASSIGN an existing set containing high-risk flags
// (permissions.manage, pipeline.manage, data.export, ...) to another account, escalating
// privileges without admin approval. Granting high-risk flags is admin-only, and assigning
// a set that carries them must follow the same policy.

let h: TestDb;
const SIG = () => AbortSignal.timeout(8000);
const admin: PermSetUser = {
  id: "00000000-0000-0000-0000-0000000000aa",
  type: "admin",
  isActive: true,
  groupIds: new Set(),
  flags: new Set(),
};
const manager: PermSetUser = {
  id: "00000000-0000-0000-0000-0000000000bb",
  type: "regular",
  isActive: true,
  groupIds: new Set(),
  flags: new Set(["permissions.manage"]),
};

beforeAll(async () => {
  h = await makeTestDb();
});
afterAll(async () => {
  await h.close();
});
beforeEach(async () => {
  await h.db.execute(sql`TRUNCATE users, permission_sets, audit_events RESTART IDENTITY CASCADE`);
  await h.db.insert(users).values([
    { id: admin.id, email: "admin@example.com", name: "Admin", googleSub: "g-a", isAdmin: true },
    { id: manager.id, email: "mgr@example.com", name: "Mgr", googleSub: "g-m" },
  ]);
});

test("a non-admin manager cannot assign a set carrying high-risk flags", async () => {
  const set = await createPermissionSet(
    h.db,
    admin,
    { name: "Powerful", flags: { "permissions.manage": true } },
    SIG(),
  );
  if (set.ok === false) throw new Error("setup: could not create set");
  const [target] = await h.db
    .insert(users)
    .values({ email: "t@example.com", name: "T", googleSub: "g-t" })
    .returning();
  const r = await assignPermissionSet(
    h.db,
    manager,
    { userId: target!.id, setId: set.value.id },
    SIG(),
  );
  expect(r.ok).toBe(false);
});

test("a non-admin manager can assign a set with only non-high-risk flags", async () => {
  const set = await createPermissionSet(
    h.db,
    admin,
    { name: "Basic", flags: { "deal.create": true } },
    SIG(),
  );
  if (set.ok === false) throw new Error("setup: could not create set");
  const [target] = await h.db
    .insert(users)
    .values({ email: "t2@example.com", name: "T2", googleSub: "g-t2" })
    .returning();
  const r = await assignPermissionSet(
    h.db,
    manager,
    { userId: target!.id, setId: set.value.id },
    SIG(),
  );
  expect(r.ok).toBe(true);
});

test("an admin can assign a set carrying high-risk flags", async () => {
  const set = await createPermissionSet(
    h.db,
    admin,
    { name: "Powerful", flags: { "pipeline.manage": true } },
    SIG(),
  );
  if (set.ok === false) throw new Error("setup: could not create set");
  const [target] = await h.db
    .insert(users)
    .values({ email: "t3@example.com", name: "T3", googleSub: "g-t3" })
    .returning();
  const r = await assignPermissionSet(
    h.db,
    admin,
    { userId: target!.id, setId: set.value.id },
    SIG(),
  );
  expect(r.ok).toBe(true);
});
