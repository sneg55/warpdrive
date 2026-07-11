import { asc, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { DEFAULT_LABELS, DEFAULT_PIPELINE } from "@/constants/defaultCatalog";
import {
  labels,
  pipelines,
  settings,
  stages,
  users,
  visibilityGroupMembers,
  visibilityGroups,
} from "@/db/schema";
import { makeTestDb, type TestDb } from "@/test/db";
import { upsertUserOnLogin } from "./bootstrap";

let h: TestDb;
const SIG = () => AbortSignal.timeout(8000);

beforeAll(async () => {
  h = await makeTestDb();
});
afterAll(async () => {
  await h.close();
});
beforeEach(async () => {
  // Clean slate per test (hard-delete; order respects FKs).
  await h.db.execute(
    sql`TRUNCATE labels, stages, pipelines, visibility_group_members, visibility_groups, sessions, users, permission_sets, settings, audit_events RESTART IDENTITY CASCADE`,
  );
});

function ident(over: Partial<{ email: string; sub: string; name: string }> = {}) {
  return { email: "admin@example.com", sub: "g-admin", name: "Admin", avatarUrl: null, ...over };
}

describe("first-run bootstrap", () => {
  test("the SEED_ADMIN_EMAIL user becomes admin and bootstrap closes", async () => {
    const r = await upsertUserOnLogin(h.db, ident(), SIG());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.isAdmin).toBe(true);
    }
    const [s] = await h.db.select().from(settings);
    expect(s!.bootstrappedAt).not.toBeNull();
  });

  test("a non-seed user logging in first is created regular, bootstrap stays open", async () => {
    const r = await upsertUserOnLogin(
      h.db,
      ident({ email: "someone@example.com", sub: "g-x" }),
      SIG(),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.isAdmin).toBe(false);
    }
    const [s] = await h.db.select().from(settings);
    expect(s!.bootstrappedAt).toBeNull(); // still open: seeded admin has not logged in
  });

  // Codex finding F25: an existing user was selected by EMAIL and had googleSub overwritten
  // with the incoming subject. If a Workspace email is reassigned/recreated, the new Google
  // identity would inherit the old CRM user (admin state, permissions). The stable binding is
  // the Google subject; a same-email/different-subject login must be a conflict, not a rebind.
  test("does not rebind an existing account when the same email logs in with a different subject", async () => {
    const first = await upsertUserOnLogin(h.db, ident(), SIG()); // email admin@, sub g-admin
    expect(first.ok).toBe(true);

    // Same email, DIFFERENT Google subject (address reassigned to a new person).
    const second = await upsertUserOnLogin(h.db, ident({ sub: "g-evil" }), SIG());
    expect(second.ok).toBe(false); // identity conflict: must not silently rebind

    // The original account's stable binding is untouched, and no admin was inherited.
    const [u] = await h.db.select().from(users);
    expect(u!.googleSub).toBe("g-admin");
    const count = await h.db.execute(sql`SELECT count(*)::int AS n FROM users`);
    expect((count.rows[0] as { n: number }).n).toBe(1);
  });

  test("re-login with the same subject and a changed email updates the existing account", async () => {
    const first = await upsertUserOnLogin(h.db, ident(), SIG()); // email admin@, sub g-admin
    expect(first.ok).toBe(true);
    const firstId = first.ok ? first.value.userId : "";

    // Same subject, new email (the user's Workspace address changed).
    const second = await upsertUserOnLogin(
      h.db,
      ident({ email: "admin.new@example.com", sub: "g-admin" }),
      SIG(),
    );
    expect(second.ok).toBe(true);
    if (second.ok) expect(second.value.userId).toBe(firstId); // same account, not a new one
    const [u] = await h.db.select().from(users);
    expect(u!.email).toBe("admin.new@example.com");
  });

  test("after bootstrap, a later seed-email login is NOT re-elected admin (idempotent)", async () => {
    await upsertUserOnLogin(h.db, ident({ email: "first@example.com", sub: "g-f" }), SIG()); // regular
    const seed = await upsertUserOnLogin(h.db, ident(), SIG()); // admin, closes bootstrap
    expect(seed.ok).toBe(true);
    if (seed.ok) {
      expect(seed.value.isAdmin).toBe(true);
    }
    const second = await upsertUserOnLogin(h.db, ident(), SIG()); // same admin again
    expect(second.ok).toBe(true);
    if (second.ok) {
      expect(second.value.isAdmin).toBe(true); // stays admin, no duplicate user
    }
    const count = await h.db.execute(
      sql`SELECT count(*)::int AS n FROM users WHERE email = 'admin@example.com'`,
    );
    expect((count.rows[0] as { n: number }).n).toBe(1);
  });

  test("first-run bootstrap seeds the default pipeline with stages and default labels", async () => {
    const r = await upsertUserOnLogin(h.db, ident(), SIG());
    if (r.ok === false) throw new Error("setup");

    // Exactly one default pipeline, public (no visibility group), with the default stages in order.
    const pl = await h.db.select().from(pipelines);
    expect(pl).toHaveLength(1);
    expect(pl[0]!.name).toBe(DEFAULT_PIPELINE.name);
    expect(pl[0]!.visibilityGroupId).toBeNull();
    const st = await h.db
      .select()
      .from(stages)
      .where(eq(stages.pipelineId, pl[0]!.id))
      .orderBy(asc(stages.order));
    expect(st.map((s) => s.name)).toEqual([...DEFAULT_PIPELINE.stages]);

    // settings.default_pipeline_id points at the seeded pipeline.
    const [s] = await h.db.select().from(settings);
    expect(s!.defaultPipelineId).toBe(pl[0]!.id);

    // Default labels seeded for all four targets, name+color+order matching the catalog.
    for (const target of ["person", "organization", "deal", "lead"] as const) {
      const rows = await h.db
        .select()
        .from(labels)
        .where(eq(labels.target, target))
        .orderBy(asc(labels.order));
      expect(rows.map((l) => [l.name, l.color])).toEqual(
        DEFAULT_LABELS[target].map(([name, color]) => [name, color]),
      );
    }
  });

  test("re-running bootstrap does not duplicate the seeded pipeline or labels", async () => {
    await upsertUserOnLogin(h.db, ident(), SIG()); // seeds
    await upsertUserOnLogin(h.db, ident(), SIG()); // same admin again, must not re-seed
    expect(await h.db.select().from(pipelines)).toHaveLength(1);
    const labelCount = await h.db.execute(sql`SELECT count(*)::int AS n FROM labels`);
    const expected = Object.values(DEFAULT_LABELS).reduce((a, defs) => a + defs.length, 0);
    expect((labelCount.rows[0] as { n: number }).n).toBe(expected);
  });

  test("every user is auto-added to Everyone and primary group set", async () => {
    const r = await upsertUserOnLogin(h.db, ident(), SIG());
    if (r.ok === false) throw new Error("setup");
    const [g] = await h.db.select().from(visibilityGroups);
    expect(g!.name).toBe("Everyone");
    const members = await h.db.select().from(visibilityGroupMembers);
    expect(members).toHaveLength(1);
    const [u] = await h.db.select().from(users);
    expect(u!.primaryVisibilityGroupId).toBe(g!.id);
  });

  test("two concurrent first logins elect exactly one admin (advisory lock)", async () => {
    const [a, b] = await Promise.all([
      upsertUserOnLogin(h.db, ident(), SIG()),
      upsertUserOnLogin(h.db, ident(), SIG()),
    ]);
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    const admins = await h.db.execute(
      sql`SELECT count(*)::int AS n FROM users WHERE is_admin = true`,
    );
    expect((admins.rows[0] as { n: number }).n).toBe(1);
  });

  // Task 11: an invited placeholder (googleSub NULL) must be adopted, not treated as a
  // foreign identity conflict, so the pre-authorized email actually gets the account.
  test("adopts an invited placeholder (googleSub null) on first login by email", async () => {
    // Bootstrap must already be closed (an admin exists) for this to be a realistic invite
    // scenario, and to isolate the adoption path from the seed-admin-election branch.
    await upsertUserOnLogin(h.db, ident(), SIG()); // seed admin logs in first, closes bootstrap

    const [placeholder] = await h.db
      .insert(users)
      .values({
        email: "new@ex.com",
        name: "New",
        googleSub: null,
        invitedAt: new Date(),
      })
      .returning();
    expect(placeholder!.googleSub).toBeNull();

    const r = await upsertUserOnLogin(
      h.db,
      { email: "new@ex.com", sub: "google-123", name: "New Real", avatarUrl: null },
      SIG(),
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.userId).toBe(placeholder!.id); // adopted, not a second row

    const [u] = await h.db.select().from(users).where(eq(users.email, "new@ex.com"));
    expect(u!.googleSub).toBe("google-123"); // real subject now bound
    expect(u!.name).toBe("New Real"); // profile refreshed from the real identity
    expect(u!.invitedAt).toBeNull(); // no longer pending

    const count = await h.db.execute(
      sql`SELECT count(*)::int AS n FROM users WHERE email = 'new@ex.com'`,
    );
    expect((count.rows[0] as { n: number }).n).toBe(1); // no duplicate row
  });

  test("a non-invited (unknown) email still follows the normal create path", async () => {
    await upsertUserOnLogin(h.db, ident(), SIG()); // closes bootstrap

    const r = await upsertUserOnLogin(
      h.db,
      { email: "fresh@ex.com", sub: "google-fresh", name: "Fresh", avatarUrl: null },
      SIG(),
    );
    expect(r.ok).toBe(true);
    const [u] = await h.db.select().from(users).where(eq(users.email, "fresh@ex.com"));
    expect(u!.googleSub).toBe("google-fresh");
    expect(u!.invitedAt).toBeNull();
  });

  test("an already-bound account (googleSub set) is never re-adopted by a new subject", async () => {
    // Reaffirms the existing conflict behavior still holds once a placeholder has been
    // adopted: a second, different Google subject claiming the same email must fail closed.
    await upsertUserOnLogin(h.db, ident(), SIG()); // closes bootstrap

    const first = await upsertUserOnLogin(
      h.db,
      { email: "bound@ex.com", sub: "google-bound", name: "Bound", avatarUrl: null },
      SIG(),
    );
    expect(first.ok).toBe(true);

    const second = await upsertUserOnLogin(
      h.db,
      { email: "bound@ex.com", sub: "google-someone-else", name: "Someone Else", avatarUrl: null },
      SIG(),
    );
    expect(second.ok).toBe(false); // must not re-adopt an already-bound account

    const [u] = await h.db.select().from(users).where(eq(users.email, "bound@ex.com"));
    expect(u!.googleSub).toBe("google-bound"); // untouched
  });
});
