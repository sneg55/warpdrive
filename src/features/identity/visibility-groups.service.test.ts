import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { auditEvents, pipelines, users, visibilityGroupMembers } from "@/db/schema";
import type { PermSetUser } from "@/features/permissions/effective";
import { makeTestDb, type TestDb } from "@/test/db";
import {
  addGroupMember,
  createVisibilityGroup,
  listGroupMembers,
  removeGroupMember,
} from "./visibility-groups.service";

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
    sql`TRUNCATE visibility_group_members, visibility_groups, pipelines, sessions, users, permission_sets, audit_events, settings RESTART IDENTITY CASCADE`,
  );
  // Actors must exist as users for FK on audit flows.
  await h.db.insert(users).values([
    { id: admin.id, email: "admin@example.com", name: "Admin", googleSub: "g-a", isAdmin: true },
    { id: manager.id, email: "mgr@example.com", name: "Mgr", googleSub: "g-m" },
  ]);
});

describe("visibility-groups service", () => {
  test("adding a group member is audited", async () => {
    const g = await createVisibilityGroup(h.db, admin, { name: "Pod A" }, SIG());
    if (g.ok === false) throw new Error("setup failed: could not create visibility group");
    const r = await addGroupMember(h.db, admin, { groupId: g.value.id, userId: manager.id }, SIG());
    expect(r.ok).toBe(true);
    const audit = await h.db.select().from(auditEvents);
    expect(audit.some((a) => a.action === "visibility_group.member_added")).toBe(true);
  });

  // F3: a non-admin permissions.manage holder must NOT manage membership of a group that
  // gates a restricted pipeline (permissions spec §5: those are admin-only). The service
  // previously hardcoded groupGatesRestrictedPipeline:false with a stale "Phase 1" comment.
  test("manager cannot add a member to a group gating a restricted pipeline", async () => {
    const g = await createVisibilityGroup(h.db, admin, { name: "Restricted Pod" }, SIG());
    if (g.ok === false) throw new Error("setup: group create failed");
    await h.db.insert(pipelines).values({ name: "Secret Pipe", visibilityGroupId: g.value.id });
    const [target] = await h.db
      .insert(users)
      .values({ email: "tgt@example.com", name: "Tgt", googleSub: "g-tgt" })
      .returning();
    const r = await addGroupMember(
      h.db,
      manager,
      { groupId: g.value.id, userId: target!.id },
      SIG(),
    );
    expect(r.ok).toBe(false);
  });

  test("manager cannot remove a member from a group gating a restricted pipeline", async () => {
    const g = await createVisibilityGroup(h.db, admin, { name: "Restricted Pod" }, SIG());
    if (g.ok === false) throw new Error("setup: group create failed");
    await h.db.insert(pipelines).values({ name: "Secret Pipe", visibilityGroupId: g.value.id });
    const [target] = await h.db
      .insert(users)
      .values({ email: "tgt@example.com", name: "Tgt", googleSub: "g-tgt" })
      .returning();
    await h.db.insert(visibilityGroupMembers).values({ groupId: g.value.id, userId: target!.id });
    const r = await removeGroupMember(
      h.db,
      manager,
      { groupId: g.value.id, userId: target!.id },
      SIG(),
    );
    expect(r.ok).toBe(false);
  });

  test("manager can still add a member to a group gating no pipeline", async () => {
    const g = await createVisibilityGroup(h.db, admin, { name: "Open Pod" }, SIG());
    if (g.ok === false) throw new Error("setup: group create failed");
    const [target] = await h.db
      .insert(users)
      .values({ email: "tgt2@example.com", name: "Tgt2", googleSub: "g-tgt2" })
      .returning();
    const r = await addGroupMember(
      h.db,
      manager,
      { groupId: g.value.id, userId: target!.id },
      SIG(),
    );
    expect(r.ok).toBe(true);
  });

  test("listGroupMembers returns the joined member names", async () => {
    const g = await createVisibilityGroup(h.db, admin, { name: "Pod B" }, SIG());
    if (g.ok === false) throw new Error("setup: group create failed");
    const [ann] = await h.db
      .insert(users)
      .values({ email: "ann@example.com", name: "Ann", googleSub: "g-ann" })
      .returning();
    const added = await addGroupMember(
      h.db,
      admin,
      { groupId: g.value.id, userId: ann!.id },
      SIG(),
    );
    if (added.ok === false) throw new Error("setup: add member failed");
    const r = await listGroupMembers(h.db, admin, g.value.id, SIG());
    if (r.ok === false) throw new Error("expected listGroupMembers to succeed for an admin");
    expect(r.value.map((m) => m.name)).toContain("Ann");
  });

  // A plain regular user (no permissions.manage, not admin) must not see group rosters.
  test("an actor without permissions.manage is denied when listing group members", async () => {
    const g = await createVisibilityGroup(h.db, admin, { name: "Pod C" }, SIG());
    if (g.ok === false) throw new Error("setup: group create failed");
    const plainUser: PermSetUser = {
      id: "00000000-0000-0000-0000-0000000000cc",
      type: "regular",
      isActive: true,
      groupIds: new Set(),
      flags: new Set(),
    };
    await h.db
      .insert(users)
      .values({ id: plainUser.id, email: "plain@example.com", name: "Plain", googleSub: "g-p" });
    const r = await listGroupMembers(h.db, plainUser, g.value.id, SIG());
    expect(r.ok).toBe(false);
  });
});
