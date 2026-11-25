import { asc, eq, sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { DEFAULT_LABELS, DEFAULT_PIPELINE } from "@/constants/defaultCatalog";
import { labels, pipelines, settings, stages, users, visibilityGroups } from "@/db/schema";
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
  await h.db.execute(
    sql`TRUNCATE labels, stages, pipelines, visibility_group_members, visibility_groups, user_identities, sessions, users, permission_sets, settings, audit_events RESTART IDENTITY CASCADE`,
  );
});

function login(over: Partial<{ email: string; sub: string; name: string }> = {}) {
  return upsertUserOnLogin(
    h.db,
    {
      provider: "google",
      identity: {
        email: "admin@example.com",
        sub: "g-admin",
        name: "Admin",
        preferredUsername: null,
        avatarUrl: null,
        ...over,
      },
    },
    SIG(),
  );
}

describe("first-run bootstrap", () => {
  test("the SEED_ADMIN_EMAIL user becomes admin and bootstrap closes", async () => {
    const r = await login();
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.isAdmin).toBe(true);
    const [s] = await h.db.select().from(settings);
    expect(s!.bootstrappedAt).not.toBeNull();
  });

  test("a non-seed user logging in first is created regular, bootstrap stays open", async () => {
    const r = await login({ email: "someone@example.com", sub: "g-x" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.isAdmin).toBe(false);
    const [s] = await h.db.select().from(settings);
    expect(s!.bootstrappedAt).toBeNull();
  });

  test("after bootstrap, a later seed-email login is NOT re-elected admin (idempotent)", async () => {
    await login({ email: "first@example.com", sub: "g-f" });
    const seed = await login();
    expect(seed.ok).toBe(true);
    if (seed.ok) expect(seed.value.isAdmin).toBe(true);
    const second = await login();
    expect(second.ok).toBe(true);
    if (second.ok) expect(second.value.isAdmin).toBe(true);
    const count = await h.db.execute(
      sql`SELECT count(*)::int AS n FROM users WHERE email = 'admin@example.com'`,
    );
    expect((count.rows[0] as { n: number }).n).toBe(1);
  });

  test("first-run bootstrap seeds the default pipeline with stages and default labels", async () => {
    const r = await login();
    if (r.ok === false) throw new Error("setup");

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

    const [s] = await h.db.select().from(settings);
    expect(s!.defaultPipelineId).toBe(pl[0]!.id);

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
    await login();
    await login();
    expect(await h.db.select().from(pipelines)).toHaveLength(1);
    const labelCount = await h.db.execute(sql`SELECT count(*)::int AS n FROM labels`);
    const expected = Object.values(DEFAULT_LABELS).reduce((a, defs) => a + defs.length, 0);
    expect((labelCount.rows[0] as { n: number }).n).toBe(expected);
  });

  test("every user is auto-added to Everyone and primary group set", async () => {
    const r = await login();
    if (r.ok === false) throw new Error("setup");
    const [g] = await h.db.select().from(visibilityGroups);
    expect(g!.name).toBe("Everyone");
    const [u] = await h.db.select().from(users);
    expect(u!.primaryVisibilityGroupId).toBe(g!.id);
  });

  test("two concurrent first logins elect exactly one admin (advisory lock)", async () => {
    const [a, b] = await Promise.all([login(), login()]);
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    const admins = await h.db.execute(
      sql`SELECT count(*)::int AS n FROM users WHERE is_admin = true`,
    );
    expect((admins.rows[0] as { n: number }).n).toBe(1);
  });
});
