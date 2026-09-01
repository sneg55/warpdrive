// @vitest-environment node
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

vi.mock("@/db/client", () => ({ db: {} }));
vi.mock("@/server/trpc/context", () => ({
  createContext: vi.fn().mockResolvedValue({
    actor: { id: "admin-1", type: "admin", isActive: true, groupIds: new Set<string>() },
    session: null,
    db: {},
  }),
}));

const { bulkUpdateStage } = vi.hoisted(() => ({
  bulkUpdateStage: vi.fn(() => Promise.resolve({ ok: true as const, value: [] })),
}));
vi.mock("./bulkActions", () => ({ bulkUpdateStage }));

import { bulkStageAction } from "./bulkStageAction";
import type { BulkStageInput } from "./schemas";

const VALID_TOKEN = "csrf-test-token";
const VALID_DEAL_ID = "11111111-1111-4111-8111-111111111111";
const VALID_STAGE_ID = "22222222-2222-4222-8222-222222222222";

function setSameOrigin(): void {
  headerStore.set("origin", "https://app.example.com");
  headerStore.set("sec-fetch-site", "same-origin");
  cookieStore.set(CSRF_COOKIE, VALID_TOKEN);
}

beforeEach(() => {
  headerStore.clear();
  cookieStore.clear();
  vi.clearAllMocks();
});

describe("bulkStageAction validation boundary", () => {
  test("rejects a non-uuid deal id without calling bulkUpdateStage", async () => {
    setSameOrigin();
    const r = await bulkStageAction(
      { dealIds: ["not-a-uuid"], toStageId: VALID_STAGE_ID },
      VALID_TOKEN,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.id).toBe("E_DEAL_015");
    expect(bulkUpdateStage).not.toHaveBeenCalled();
  });

  test("rejects a non-array dealIds without calling bulkUpdateStage", async () => {
    setSameOrigin();
    const r = await bulkStageAction(
      { dealIds: VALID_DEAL_ID, toStageId: VALID_STAGE_ID } as unknown as BulkStageInput,
      VALID_TOKEN,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.id).toBe("E_DEAL_015");
    expect(bulkUpdateStage).not.toHaveBeenCalled();
  });

  test("rejects an empty dealIds array without calling bulkUpdateStage", async () => {
    setSameOrigin();
    const r = await bulkStageAction({ dealIds: [], toStageId: VALID_STAGE_ID }, VALID_TOKEN);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.id).toBe("E_DEAL_015");
    expect(bulkUpdateStage).not.toHaveBeenCalled();
  });

  test("rejects 501 deal ids without calling bulkUpdateStage", async () => {
    setSameOrigin();
    const r = await bulkStageAction(
      { dealIds: Array.from({ length: 501 }, () => VALID_DEAL_ID), toStageId: VALID_STAGE_ID },
      VALID_TOKEN,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.id).toBe("E_DEAL_015");
    expect(bulkUpdateStage).not.toHaveBeenCalled();
  });

  test("passes valid input through to bulkUpdateStage", async () => {
    setSameOrigin();
    const r = await bulkStageAction(
      { dealIds: [VALID_DEAL_ID], toStageId: VALID_STAGE_ID },
      VALID_TOKEN,
    );
    expect(r.ok).toBe(true);
    expect(bulkUpdateStage).toHaveBeenCalledTimes(1);
  });
});
