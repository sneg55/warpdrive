// @vitest-environment node
// CSRF enforcement tests for deal mutation server actions.
// Uses jsdom-style next/headers mocking (same pattern as identity/actions.test.ts)
// so guardCsrf runs exactly as it does inside a server action.
import { beforeEach, describe, expect, test, vi } from "vitest";
import { CSRF_COOKIE } from "@/features/auth/csrf";

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

// Mock the DB client and context so no real DB connection is attempted.
vi.mock("@/db/client", () => ({ db: {} }));
vi.mock("@/server/trpc/context", () => ({
  createContext: vi.fn().mockResolvedValue({ actor: null, session: null, db: {} }),
}));

import { bulkStageAction } from "./bulkStageAction";
import { createDealAction } from "./createDealAction";
import { moveDealAction } from "./moveAction";
import { updateDealAction } from "./updateAction";

const VALID_TOKEN = "csrf-test-token";

function setSameOrigin(): void {
  headerStore.set("origin", "https://app.example.com");
  headerStore.set("sec-fetch-site", "same-origin");
}

beforeEach(() => {
  headerStore.clear();
  cookieStore.clear();
});

describe("deal mutation actions: CSRF rejection before any write", () => {
  test("moveDealAction rejects a null CSRF token before any DB work", async () => {
    cookieStore.set(CSRF_COOKIE, VALID_TOKEN);
    setSameOrigin();
    // Pass null csrf: guardCsrf must reject before createContext/moveDeal are reached.
    const r = await moveDealAction(
      {
        dealId: "00000000-0000-0000-0000-000000000001",
        toStageId: "00000000-0000-0000-0000-000000000002",
        beforePosition: null,
        afterPosition: null,
        expectedUpdatedAt: "2026-06-29T00:00:00.000Z",
      },
      null,
    );
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error.id).toBe("E_AUTH_CSRF");
  });

  test("updateDealAction rejects a mismatched CSRF token before any DB work", async () => {
    cookieStore.set(CSRF_COOKIE, VALID_TOKEN);
    setSameOrigin();
    const r = await updateDealAction(
      {
        dealId: "00000000-0000-0000-0000-000000000001",
        expectedUpdatedAt: "2026-06-29T00:00:00.000Z",
        title: "Hacked",
      },
      "wrong-token",
    );
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error.id).toBe("E_AUTH_CSRF");
  });

  test("createDealAction rejects a null CSRF token before any DB work", async () => {
    cookieStore.set(CSRF_COOKIE, VALID_TOKEN);
    setSameOrigin();
    const r = await createDealAction(
      {
        title: "Injected deal",
        value: null,
        pipelineId: "00000000-0000-0000-0000-000000000001",
        stageId: "00000000-0000-0000-0000-000000000002",
        personId: null,
        orgId: null,
        expectedCloseDate: null,
        labels: [],
        sourceChannel: null,
        sourceChannelId: null,
      },
      null,
    );
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error.id).toBe("E_AUTH_CSRF");
  });

  test("bulkStageAction rejects a null CSRF token before any DB work", async () => {
    cookieStore.set(CSRF_COOKIE, VALID_TOKEN);
    setSameOrigin();
    const r = await bulkStageAction(
      {
        dealIds: ["00000000-0000-0000-0000-000000000001"],
        toStageId: "00000000-0000-0000-0000-000000000002",
      },
      null,
    );
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error.id).toBe("E_AUTH_CSRF");
  });

  test("moveDealAction with valid token falls through to actor-not-found (no write)", async () => {
    cookieStore.set(CSRF_COOKIE, VALID_TOKEN);
    setSameOrigin();
    // CSRF passes, but createContext returns actor: null (mocked above).
    // Result must be unauthorized, not a CSRF error.
    const r = await moveDealAction(
      {
        dealId: "00000000-0000-0000-0000-000000000001",
        toStageId: "00000000-0000-0000-0000-000000000002",
        beforePosition: null,
        afterPosition: null,
        expectedUpdatedAt: "2026-06-29T00:00:00.000Z",
      },
      VALID_TOKEN,
    );
    expect(r.ok).toBe(false);
    // CSRF passed; rejected at actor check instead.
    expect(r.ok === false && r.error.id).toBe("E_AUTH_003");
  });
});
