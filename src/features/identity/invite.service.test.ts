import { eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { ERROR_IDS } from "@/constants/errorIds";
import { ADMIN_DEFAULT_FLAGS, REGULAR_DEFAULT_FLAGS } from "@/constants/permissionFlags";
import {
  auditEvents,
  permissionSets,
  users,
  visibilityGroupMembers,
  visibilityGroups,
} from "@/db/schema";
import type { PermSetUser } from "@/features/permissions/effective";
import { makeTestDb, type TestDb } from "@/test/db";
import { inviteUser } from "./invite.service";

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
const regular: PermSetUser = {
  id: "00000000-0000-0000-0000-0000000000cc",
  type: "regular",
  isActive: true,
  groupIds: new Set(),
  flags: new Set(),
};

beforeAll(async () => {
  h = await makeTestDb();
});
afterAll(async () => {
  await h.close();
});
beforeEach(async () => {
  await h.db.execute(
    sql`TRUNCATE visibility_group_members, visibility_groups, sessions, users, permission_sets, settings, audit_events RESTART IDENTITY CASCADE`,
  );
  // Bootstrap seed data must already exist: inviteUser reads it via readSeedHandles and never
  // creates it (an admin capable of inviting can only exist once bootstrap has already run).
  await h.db.insert(permissionSets).values([
    { name: "Regular", flags: REGULAR_DEFAULT_FLAGS, isDefault: true },
    { name: "Admin", flags: ADMIN_DEFAULT_FLAGS, isDefault: false },
  ]);
  await h.db.insert(visibilityGroups).values({ name: "Everyone" });
  await h.db.insert(users).values([
    { id: admin.id, email: "admin@example.com", name: "Admin", googleSub: "g-a", isAdmin: true },
    { id: manager.id, email: "mgr@example.com", name: "Mgr", googleSub: "g-m" },
    { id: regular.id, email: "reg@example.com", name: "Reg", googleSub: "g-r" },
  ]);
});

describe("inviteUser", () => {
  test("inserts a pre-authorized placeholder user (googleSub null, invitedAt set)", async () => {
    const r = await inviteUser(
      h.db,
      admin,
      { email: "inv@ex.com", name: "Inv", isAdmin: false },
      SIG(),
    );
    expect(r.ok).toBe(true);

    const [u] = await h.db.select().from(users).where(eq(users.email, "inv@ex.com"));
    expect(u).toBeDefined();
    expect(u!.googleSub).toBeNull();
    expect(u!.invitedAt).not.toBeNull();
    expect(u!.isAdmin).toBe(false);

    // Auto-joined Everyone, same as a real first login (ops spec E6).
    const [everyone] = await h.db.select().from(visibilityGroups);
    const membership = await h.db
      .select()
      .from(visibilityGroupMembers)
      .where(eq(visibilityGroupMembers.userId, u!.id));
    expect(membership).toHaveLength(1);
    expect(u!.primaryVisibilityGroupId).toBe(everyone!.id);
  });

  test("invites an admin placeholder when isAdmin is true", async () => {
    const r = await inviteUser(
      h.db,
      admin,
      { email: "future-admin@ex.com", name: "Future Admin", isAdmin: true },
      SIG(),
    );
    expect(r.ok).toBe(true);
    const [u] = await h.db.select().from(users).where(eq(users.email, "future-admin@ex.com"));
    expect(u!.isAdmin).toBe(true);
  });

  test("a manager holding permissions.manage can invite", async () => {
    const r = await inviteUser(
      h.db,
      manager,
      { email: "mgr-invite@ex.com", name: "Mgr Invite", isAdmin: false },
      SIG(),
    );
    expect(r.ok).toBe(true);
  });

  test("rejects a duplicate email with AUTH_EMAIL_TAKEN and does not create a second row", async () => {
    const first = await inviteUser(
      h.db,
      admin,
      { email: "dupe@ex.com", name: "First", isAdmin: false },
      SIG(),
    );
    expect(first.ok).toBe(true);

    const second = await inviteUser(
      h.db,
      admin,
      { email: "dupe@ex.com", name: "Second", isAdmin: false },
      SIG(),
    );
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.error.id).toBe(ERROR_IDS.AUTH_EMAIL_TAKEN);

    const count = await h.db.execute(
      sql`SELECT count(*)::int AS n FROM users WHERE email = 'dupe@ex.com'`,
    );
    expect((count.rows[0] as { n: number }).n).toBe(1);
  });

  test("rejects invite of an email already bound to an existing (non-placeholder) user", async () => {
    const r = await inviteUser(
      h.db,
      admin,
      { email: "mgr@example.com", name: "Someone", isAdmin: false },
      SIG(),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.id).toBe(ERROR_IDS.AUTH_EMAIL_TAKEN);
  });

  test("a manager holding permissions.manage but not admin cannot invite an admin", async () => {
    const r = await inviteUser(
      h.db,
      manager,
      { email: "escalation@ex.com", name: "Escalation", isAdmin: true },
      SIG(),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.id).toBe(ERROR_IDS.PERM_DENIED);
    const [u] = await h.db.select().from(users).where(eq(users.email, "escalation@ex.com"));
    expect(u).toBeUndefined();
  });

  test("an admin actor can invite another admin", async () => {
    const r = await inviteUser(
      h.db,
      admin,
      { email: "admin-invite@ex.com", name: "Admin Invite", isAdmin: true },
      SIG(),
    );
    expect(r.ok).toBe(true);
    const [u] = await h.db.select().from(users).where(eq(users.email, "admin-invite@ex.com"));
    expect(u).toBeDefined();
    expect(u!.isAdmin).toBe(true);
  });

  test("a regular actor without permissions.manage cannot invite", async () => {
    const r = await inviteUser(
      h.db,
      regular,
      { email: "blocked@ex.com", name: "Blocked", isAdmin: false },
      SIG(),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.id).toBe(ERROR_IDS.PERM_DENIED);
    const [u] = await h.db.select().from(users).where(eq(users.email, "blocked@ex.com"));
    expect(u).toBeUndefined();
  });

  test("writes an audit_events row when a user is invited", async () => {
    const r = await inviteUser(
      h.db,
      admin,
      { email: "audited@ex.com", name: "Audited", isAdmin: true },
      SIG(),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const rows = await h.db.select().from(auditEvents).where(eq(auditEvents.action, "user.invite"));
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row).toBeDefined();
    if (!row) return;
    expect(row.actorId).toBe(admin.id);
    expect(row.targetType).toBe("user");
    expect(row.targetId).toBe(r.value.userId);
    expect(row.after).toEqual({ email: "audited@ex.com", isAdmin: true });
  });
});
