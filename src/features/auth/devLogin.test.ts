import { readFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import { sessions, userIdentities, users } from "@/db/schema";
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
    sql`TRUNCATE visibility_group_members, visibility_groups, user_identities, sessions, users, permission_sets, settings, audit_events RESTART IDENTITY CASCADE`,
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

    const dbUsers = await h.db.select().from(users);
    expect(dbUsers).toHaveLength(1);
    expect(dbUsers[0]!.email).toBe("admin@example.com");

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

  test("stores a dev provider identity with the synthetic subject", async () => {
    await devLoginCore("admin@example.com", makeDeps());
    const rows = await h.db.select().from(userIdentities);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.provider).toBe("dev");
    expect(rows[0]!.subject).toBe("dev-admin@example.com");
  });

  test("second call for same email is idempotent (upsert)", async () => {
    await devLoginCore("admin@example.com", makeDeps());
    const r2 = await devLoginCore("admin@example.com", makeDeps());
    expect(r2.ok).toBe(true);
    const dbUsers = await h.db.select().from(users);
    expect(dbUsers).toHaveLength(1);
  });
});

describe("devLoginCore: users carried over by the 0088 migration", () => {
  test("an existing dev user is not locked out: dev- subjects backfill as provider dev", async () => {
    await h.db.execute(sql`ALTER TABLE "users" ADD COLUMN "google_sub" text`);
    await h.db.execute(
      sql`INSERT INTO "users" ("email", "name", "google_sub") VALUES ('alice@example.com', 'Alice', 'dev-alice@example.com'), ('bob@example.com', 'Bob', '12345')`,
    );

    const migration = readFileSync(
      new URL("../../../drizzle/0088_provider_neutral_identities.sql", import.meta.url),
      "utf8",
    );
    const backfill = migration
      .split("--> statement-breakpoint")
      .map((statement) => statement.trim())
      .find((statement) => statement.startsWith('INSERT INTO "user_identities"'));
    if (backfill === undefined) throw new Error("0088 backfill statement not found");
    await h.db.execute(sql.raw(backfill));
    await h.db.execute(sql`ALTER TABLE "users" DROP COLUMN "google_sub"`);

    const result = await devLoginCore("alice@example.com", makeDeps());
    expect(result.ok).toBe(true);

    const identities = await h.db.select().from(userIdentities);
    expect(identities).toHaveLength(2);
    expect(identities.find((i) => i.subject === "dev-alice@example.com")?.provider).toBe("dev");
    expect(identities.find((i) => i.subject === "12345")?.provider).toBe("google");
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
