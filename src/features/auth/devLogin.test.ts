/**
 * devLogin.test.ts: TDD tests for devLoginCore.
 *
 * Test plan:
 * (a) Guard is OFF (nodeEnv=production OR allowFirstLoginAdmin=false) => returns err("disabled"), no DB write.
 * (b) Guard is ON, valid email => upserts user, returns session.
 * (c) Guard is ON, invalid email => returns err("invalid_email").
 */

import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { sessions, users } from "@/db/schema";
import { makeTestDb, type TestDb } from "@/test/db";
import { type DevLoginDeps, devLoginCore } from "./devLogin";

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
    sql`TRUNCATE visibility_group_members, visibility_groups, sessions, users, permission_sets, settings, audit_events RESTART IDENTITY CASCADE`,
  );
});

function makeDeps(overrides: Partial<DevLoginDeps["appEnv"]> = {}): DevLoginDeps {
  return {
    db: h.db,
    appEnv: {
      nodeEnv: "development",
      allowFirstLoginAdmin: true,
      workspaceDomain: "example.com",
      ...overrides,
    },
    signal: SIG(),
  };
}

describe("devLoginCore: production guard", () => {
  test("returns err('disabled') when nodeEnv=production", async () => {
    const result = await devLoginCore("admin@example.com", makeDeps({ nodeEnv: "production" }));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("disabled");

    // Verify no DB side-effects.
    const rows = await h.db.select().from(users);
    expect(rows).toHaveLength(0);
  });

  test("returns err('disabled') when allowFirstLoginAdmin=false", async () => {
    const result = await devLoginCore(
      "admin@example.com",
      makeDeps({ allowFirstLoginAdmin: false }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("disabled");

    const rows = await h.db.select().from(users);
    expect(rows).toHaveLength(0);
  });

  test("returns err('disabled') when both nodeEnv=production AND flag false", async () => {
    const result = await devLoginCore(
      "admin@example.com",
      makeDeps({ nodeEnv: "production", allowFirstLoginAdmin: false }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("disabled");
  });
});

describe("devLoginCore: valid guard enabled path", () => {
  test("upserts user and returns session when guard is ON", async () => {
    const result = await devLoginCore("admin@example.com", makeDeps());

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected ok");

    expect(result.value.userId).toBeTruthy();
    expect(result.value.sid).toBeTruthy();
    expect(result.value.expiresAt).toBeInstanceOf(Date);

    // User was actually inserted.
    const dbUsers = await h.db.select().from(users);
    expect(dbUsers).toHaveLength(1);
    expect(dbUsers[0]!.email).toBe("admin@example.com");

    // Session was actually inserted.
    const dbSessions = await h.db.select().from(sessions);
    expect(dbSessions).toHaveLength(1);
    expect(dbSessions[0]!.userId).toBe(result.value.userId);
  });

  test("normalises email to lowercase", async () => {
    const result = await devLoginCore("ADMIN@Example.COM", makeDeps());
    expect(result.ok).toBe(true);
    const dbUsers = await h.db.select().from(users);
    expect(dbUsers[0]!.email).toBe("admin@example.com");
  });

  test("builds synthetic sub prefixed dev-", async () => {
    await devLoginCore("admin@example.com", makeDeps());
    const dbUsers = await h.db.select().from(users);
    expect(dbUsers[0]!.googleSub).toBe("dev-admin@example.com");
  });

  test("second call for same email is idempotent (upsert)", async () => {
    await devLoginCore("admin@example.com", makeDeps());
    const r2 = await devLoginCore("admin@example.com", makeDeps());
    expect(r2.ok).toBe(true);
    const dbUsers = await h.db.select().from(users);
    expect(dbUsers).toHaveLength(1);
  });
});

describe("devLoginCore: invalid email", () => {
  test("returns err('invalid_email') for non-email string", async () => {
    const result = await devLoginCore("not-an-email", makeDeps());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("invalid_email");
  });

  test("returns err('invalid_email') for null", async () => {
    const result = await devLoginCore(null, makeDeps());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("invalid_email");
  });

  test("returns err('invalid_email') for empty string", async () => {
    const result = await devLoginCore("", makeDeps());
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toBe("invalid_email");
  });
});
