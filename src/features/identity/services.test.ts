import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { auditEvents, sessions, users } from "@/db/schema";
import { sessionFixture } from "@/features/auth/session.test-helpers";
import type { PermSetUser } from "@/features/permissions/effective";
import { makeTestDb, type TestDb } from "@/test/db";
import { createPermissionSet, updatePermissionSetFlags } from "./permission-sets.service";
import { assignPermissionSet, setUserActive, setUserAdmin } from "./users.service";

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
  await h.db.execute(
    sql`TRUNCATE visibility_group_members, visibility_groups, team_members, teams, sessions, users, permission_sets, audit_events, settings RESTART IDENTITY CASCADE`,
  );
  // Actors must exist as users for FK on audit + deactivation flows.
  await h.db.insert(users).values([
    { id: admin.id, email: "admin@example.com", name: "Admin", googleSub: "g-a", isAdmin: true },
    { id: manager.id, email: "mgr@example.com", name: "Mgr", googleSub: "g-m" },
  ]);
});

describe("identity services", () => {
  test("admin creates a permission set and an audit row is written", async () => {
    const r = await createPermissionSet(
      h.db,
      admin,
      { name: "Sales", flags: { "deal.create": true } },
      SIG(),
    );
    expect(r.ok).toBe(true);
    const audit = await h.db.select().from(auditEvents);
    expect(audit.some((a) => a.action === "permission_set.create")).toBe(true);
  });

  test("manager cannot grant a high-risk flag", async () => {
    const made = await createPermissionSet(h.db, admin, { name: "Base", flags: {} }, SIG());
    if (made.ok === false) throw new Error("setup failed: could not create permission set");
    const r = await updatePermissionSetFlags(
      h.db,
      manager,
      { setId: made.value.id, flags: { "data.export": true } },
      SIG(),
    );
    expect(r.ok).toBe(false);
  });

  test("deactivating a user revokes their sessions", async () => {
    const [target] = await h.db
      .insert(users)
      .values({ email: "t@example.com", name: "T", googleSub: "g-t" })
      .returning();
    await h.db
      .insert(sessions)
      .values(sessionFixture({ userId: target!.id, expiresAt: new Date(Date.now() + 3_600_000) }));
    const r = await setUserActive(h.db, admin, { userId: target!.id, isActive: false }, SIG());
    expect(r.ok).toBe(true);
    const live = await h.db.execute(
      sql`SELECT count(*)::int AS n FROM sessions WHERE user_id = ${target!.id} AND revoked_at IS NULL`,
    );
    expect((live.rows[0] as { n: number }).n).toBe(0);
  });

  test("an admin cannot deactivate themselves", async () => {
    const r = await setUserActive(h.db, admin, { userId: admin.id, isActive: false }, SIG());
    expect(r.ok).toBe(false);
  });

  test("cannot deactivate the last remaining active admin (lockout prevention)", async () => {
    // Two admins exist: `admin` (from beforeEach) and `admin2`. `admin2` deactivates
    // `admin`, leaving one admin; allowed. A second deactivation that would leave zero
    // active admins must be denied so the CRM can never lock out all admins.
    const [admin2] = await h.db
      .insert(users)
      .values({ email: "admin2@example.com", name: "Admin2", googleSub: "g-a2", isAdmin: true })
      .returning();
    const actor2: PermSetUser = {
      id: admin2!.id,
      type: "admin",
      isActive: true,
      groupIds: new Set(),
      flags: new Set(),
    };
    // First deactivation succeeds: two active admins -> one remaining.
    const first = await setUserActive(h.db, actor2, { userId: admin.id, isActive: false }, SIG());
    expect(first.ok).toBe(true);
    // admin2 is now the sole active admin; admin (still admin actor) tries to deactivate
    // admin2, which would leave zero active admins. Must be denied.
    const r = await setUserActive(h.db, admin, { userId: admin2!.id, isActive: false }, SIG());
    expect(r.ok).toBe(false);
  });

  test("a non-admin actor cannot toggle the admin role", async () => {
    const r = await setUserAdmin(h.db, manager, { userId: manager.id, isAdmin: true }, SIG());
    expect(r.ok).toBe(false);
  });

  test("an admin can grant the admin role and the change is audited", async () => {
    const r = await setUserAdmin(h.db, admin, { userId: manager.id, isAdmin: true }, SIG());
    expect(r.ok).toBe(true);
    const audit = await h.db.select().from(auditEvents);
    expect(audit.some((a) => a.action === "user.set_admin")).toBe(true);
  });

  test("a manager cannot reassign their own permission set", async () => {
    const made = await createPermissionSet(h.db, admin, { name: "Set", flags: {} }, SIG());
    if (made.ok === false) throw new Error("setup failed: could not create permission set");
    const r = await assignPermissionSet(
      h.db,
      manager,
      { userId: manager.id, setId: made.value.id },
      SIG(),
    );
    expect(r.ok).toBe(false);
  });

  test("an admin can assign a permission set and the change is audited", async () => {
    const made = await createPermissionSet(h.db, admin, { name: "Set", flags: {} }, SIG());
    if (made.ok === false) throw new Error("setup failed: could not create permission set");
    const r = await assignPermissionSet(
      h.db,
      admin,
      { userId: manager.id, setId: made.value.id },
      SIG(),
    );
    expect(r.ok).toBe(true);
    const audit = await h.db.select().from(auditEvents);
    expect(audit.some((a) => a.action === "user.assign_permission_set")).toBe(true);
  });

  test("demoting the sole active admin is denied (last-admin lockout prevention)", async () => {
    // admin is the only active admin in beforeEach; demoting to non-admin must be denied.
    const r = await setUserAdmin(h.db, admin, { userId: admin.id, isAdmin: false }, SIG());
    expect(r.ok).toBe(false);
  });

  test("demoting one admin when two exist is allowed", async () => {
    // Insert a second admin so we have two; demoting admin (not self-promoting) is allowed.
    const [admin2] = await h.db
      .insert(users)
      .values({ email: "admin2@example.com", name: "Admin2", googleSub: "g-a2b", isAdmin: true })
      .returning();
    const actor2: PermSetUser = {
      id: admin2!.id,
      type: "admin",
      isActive: true,
      groupIds: new Set(),
      flags: new Set(),
    };
    // actor2 demotes admin: two admins -> one remaining, should succeed.
    const r = await setUserAdmin(h.db, actor2, { userId: admin.id, isAdmin: false }, SIG());
    expect(r.ok).toBe(true);
  });

  test("promoting a non-admin to admin is still allowed", async () => {
    const r = await setUserAdmin(h.db, admin, { userId: manager.id, isAdmin: true }, SIG());
    expect(r.ok).toBe(true);
  });

  // F6: demoting EVERY active admin concurrently must not zero out admins and lock the
  // instance. The last-admin guard must serialize under a row lock so at least one active
  // admin always survives. Without a lock, all concurrent calls read a stale count > 1 and
  // all proceed, leaving zero admins.
  test("concurrent demotion of all admins cannot lock out the instance", async () => {
    // beforeEach seeds `admin` (an active admin). Add several more so the race window is wide.
    const extra = await h.db
      .insert(users)
      .values(
        Array.from({ length: 6 }, (_, i) => ({
          email: `admin${i}@example.com`,
          name: `A${i}`,
          googleSub: `g-a${i}`,
          isAdmin: true,
        })),
      )
      .returning();
    const allAdminIds = [admin.id, ...extra.map((u) => u.id)];
    // Fire one demotion per active admin, all concurrently, all acted by `admin`.
    await Promise.all(
      allAdminIds.map((id) => setUserAdmin(h.db, admin, { userId: id, isAdmin: false }, SIG())),
    );
    const remaining = await h.db.execute(
      sql`SELECT count(*)::int AS n FROM users WHERE is_admin = true AND is_active = true`,
    );
    expect((remaining.rows[0] as { n: number }).n).toBeGreaterThanOrEqual(1);
  });
});
