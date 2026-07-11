// @vitest-environment node
// Boundary-validation tests for the custom-field create/archive server actions. Uses the same
// next/headers + context mocking pattern as dealActions.csrf.test.ts so guardCsrf/permission run
// as in production, while the repo layer (createDef/archiveDef) is spied so no DB is touched: the
// point is that invalid input is rejected BEFORE any repo call.
import { beforeEach, describe, expect, test, vi } from "vitest";
import { CSRF_COOKIE } from "@/features/auth/csrf";
import { createDefInputSchema } from "./defSchema";

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
vi.mock("@/features/permissions/can", () => ({ can: () => true }));

const { createDef, archiveDef } = vi.hoisted(() => ({
  createDef: vi.fn(() => Promise.resolve({ ok: true as const, value: { id: "d1" } })),
  archiveDef: vi.fn(() => Promise.resolve({ ok: true as const, value: { id: "d1" } })),
}));
vi.mock("./defsRepo", () => ({ createDef, archiveDef }));

import { createDefAction } from "./actions";

const VALID_TOKEN = "csrf-test-token";

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

describe("createDefInputSchema", () => {
  const base = { targetEntity: "deal" as const, type: "text" as const, name: "Budget" };

  test("rejects an empty name", () => {
    expect(createDefInputSchema.safeParse({ ...base, name: "  " }).success).toBe(false);
  });

  test("rejects an unknown type", () => {
    expect(createDefInputSchema.safeParse({ ...base, type: "bogus" }).success).toBe(false);
  });

  test("rejects an over-long name", () => {
    expect(createDefInputSchema.safeParse({ ...base, name: "x".repeat(81) }).success).toBe(false);
  });

  test("accepts valid input", () => {
    expect(createDefInputSchema.safeParse(base).success).toBe(true);
  });
});

describe("createDefAction validation boundary", () => {
  test("rejects an empty name without inserting a row", async () => {
    setSameOrigin();
    const r = await createDefAction(
      { targetEntity: "deal", type: "text", name: "   " },
      VALID_TOKEN,
    );
    expect(r.ok).toBe(false);
    expect(createDef).not.toHaveBeenCalled();
  });

  test("passes valid input through to createDef", async () => {
    setSameOrigin();
    const r = await createDefAction(
      { targetEntity: "deal", type: "text", name: "Budget" },
      VALID_TOKEN,
    );
    expect(r.ok).toBe(true);
    expect(createDef).toHaveBeenCalledTimes(1);
  });
});
