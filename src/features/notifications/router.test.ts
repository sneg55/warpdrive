// @vitest-environment node
// Integration tests for the notifications tRPC router and CSRF-guarded server actions.
// Real Postgres via withTestDb; no mocks for DB or feed functions.
// CSRF guard tests mock next/headers (same pattern as dealActions.csrf.test.ts).

import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, test, vi } from "vitest";
import type { PermissionFlagKey } from "@/constants/permissionFlags";
import { notifications } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import { CSRF_COOKIE } from "@/features/auth/csrf";
import type { HydratedActor } from "@/server/hydrateActor";
import { createCaller } from "@/server/trpc/root";

// ---- CSRF mock setup (mirrors dealActions.csrf.test.ts) ----

const headerStore = new Map<string, string>();
const cookieStore = new Map<string, string>();

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve({ get: (k: string) => headerStore.get(k.toLowerCase()) ?? null }),
  cookies: () =>
    Promise.resolve({
      get: (k: string) => {
        const value = cookieStore.get(k);
        return value === undefined ? undefined : { value };
      },
    }),
}));

// Mock DB client so CSRF tests do not need a real DB connection.
vi.mock("@/db/client", () => ({ db: {} }));
vi.mock("@/server/trpc/context", () => ({
  createContext: vi.fn().mockResolvedValue({ actor: null, session: null, db: {} }),
}));

// Import actions AFTER mocks are in place.
const { markReadAction, markAllReadAction, setPreferenceAction } = await import("./actions");

const VALID_TOKEN = "csrf-test-token";

function setSameOrigin(): void {
  headerStore.set("origin", "https://app.example.com");
  headerStore.set("sec-fetch-site", "same-origin");
}

beforeEach(() => {
  headerStore.clear();
  cookieStore.clear();
});

// ---- tRPC router tests (real DB) ----

// Build a HydratedActor-compatible actor from a seeded user row (name/avatar are placeholders).
// Empty flags/groupIds sets are fine: read-feed tests do not exercise flag checks.
function makeActor(u: { id: string; isAdmin: boolean; isActive: boolean }): HydratedActor {
  return {
    id: u.id,
    type: u.isAdmin ? ("admin" as const) : ("regular" as const),
    isActive: u.isActive,
    name: "Test User",
    avatarUrl: null,
    flags: new Set<PermissionFlagKey>(),
    groupIds: new Set<string>(),
  };
}

// Insert an "all"-visibility deal owned by the given user.
async function seedAllDeal(
  db: Parameters<Parameters<typeof withTestDb>[0]>[0],
  ownerId: string,
): Promise<string> {
  const { pipeline, stages } = await seedPipelineWithStages(db, ["Open"]);
  const stage = stages[0];
  if (stage === undefined) throw new Error("seedAllDeal: no stage");
  const row = (
    await db.execute(sql`
      INSERT INTO deals (title, pipeline_id, stage_id, owner_id, visibility_level)
      VALUES ('Test Deal', ${pipeline.id}, ${stage.id}, ${ownerId}, 'all')
      RETURNING id
    `)
  ).rows[0] as { id: string } | undefined;
  if (row === undefined) throw new Error("seedAllDeal: insert returned no rows");
  return row.id;
}

describe("notifications tRPC router", () => {
  it("feed returns the user's visible notifications and unreadCount matches", async () => {
    await withTestDb(async (db) => {
      const userRow = await seedUser(db);
      const actor = makeActor(userRow);
      const dealId = await seedAllDeal(db, userRow.id);

      await db.insert(notifications).values([
        {
          userId: userRow.id,
          type: "deal_won",
          entityType: "deal",
          entityId: dealId,
          actorId: null,
          payload: {},
        },
        {
          userId: userRow.id,
          type: "activity_reminder",
          entityType: null,
          entityId: null,
          actorId: null,
          payload: {},
        },
      ]);

      const caller = createCaller({
        db,
        session: { userId: userRow.id, sessionId: "test-session" },
        actor,
      });

      const feed = await caller.notifications.feed({ limit: 50 });
      expect(feed.length).toBe(2);
      const unread = await caller.notifications.unreadCount();
      expect(unread).toBe(2);
    });
  });

  it("preferences returns defaults for all notification types", async () => {
    await withTestDb(async (db) => {
      const userRow = await seedUser(db);
      const actor = makeActor(userRow);

      const caller = createCaller({
        db,
        session: { userId: userRow.id, sessionId: "test-session" },
        actor,
      });

      const prefs = await caller.notifications.preferences();
      // Spot-check: deal_won should default to inApp:true, email:false
      expect(prefs.deal_won).toEqual({ inApp: true, email: false });
      expect(prefs.mention).toEqual({ inApp: true, email: false });
    });
  });
});

// ---- CSRF-before-write tests (mocked DB) ----

describe("notifications mutation actions: CSRF rejection before any write", () => {
  test("markReadAction rejects a null CSRF token before any DB work", async () => {
    cookieStore.set(CSRF_COOKIE, VALID_TOKEN);
    setSameOrigin();
    const r = await markReadAction({ id: "00000000-0000-0000-0000-000000000001" }, null);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error.id).toBe("E_AUTH_CSRF");
  });

  test("markReadAction rejects a mismatched CSRF token before any DB work", async () => {
    cookieStore.set(CSRF_COOKIE, VALID_TOKEN);
    setSameOrigin();
    const r = await markReadAction({ id: "00000000-0000-0000-0000-000000000001" }, "wrong-token");
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error.id).toBe("E_AUTH_CSRF");
  });

  test("markAllReadAction rejects a null CSRF token before any DB work", async () => {
    cookieStore.set(CSRF_COOKIE, VALID_TOKEN);
    setSameOrigin();
    const r = await markAllReadAction(null);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error.id).toBe("E_AUTH_CSRF");
  });

  test("setPreferenceAction rejects a null CSRF token before any DB work", async () => {
    cookieStore.set(CSRF_COOKIE, VALID_TOKEN);
    setSameOrigin();
    const r = await setPreferenceAction({ type: "deal_won", inApp: true, email: false }, null);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error.id).toBe("E_AUTH_CSRF");
  });

  test("markReadAction with valid token falls through to actor-not-found (no write)", async () => {
    cookieStore.set(CSRF_COOKIE, VALID_TOKEN);
    setSameOrigin();
    const r = await markReadAction({ id: "00000000-0000-0000-0000-000000000001" }, VALID_TOKEN);
    expect(r.ok).toBe(false);
    // CSRF passed; rejected at actor check.
    expect(r.ok === false && r.error.id).toBe("E_AUTH_003");
  });
});
