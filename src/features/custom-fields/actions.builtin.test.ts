// @vitest-environment node
// Gate + boundary tests for setBuiltinFieldHiddenAction. Mirrors actions.test.ts: next/headers +
// context are mocked so guardCsrf/permission run as in production, while the repo is spied so the
// point is the ACTION layer (gate + Zod), not the DB (that round-trip is integration-tested).
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

const { can } = vi.hoisted(() => ({ can: vi.fn(() => true) }));
vi.mock("@/features/permissions/can", () => ({ can }));

const { setBuiltinFieldHidden } = vi.hoisted(() => ({
  setBuiltinFieldHidden: vi.fn(() => Promise.resolve({ ok: true as const, value: undefined })),
}));
vi.mock("./hiddenBuiltinsRepo", () => ({ setBuiltinFieldHidden }));

import { setBuiltinFieldHiddenAction } from "./actions";

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
  can.mockReturnValue(true);
});

describe("setBuiltinFieldHiddenAction", () => {
  test("hides a field for an admin and calls the repo", async () => {
    setSameOrigin();
    const r = await setBuiltinFieldHiddenAction(
      { entity: "organization", key: "industry", hidden: true },
      VALID_TOKEN,
    );
    expect(r.ok).toBe(true);
    expect(setBuiltinFieldHidden).toHaveBeenCalledWith(
      expect.anything(),
      { entity: "organization", key: "industry", hidden: true },
      expect.anything(),
    );
  });

  test("denies a non-manager and never calls the repo", async () => {
    setSameOrigin();
    can.mockReturnValue(false);
    const r = await setBuiltinFieldHiddenAction(
      { entity: "organization", key: "industry", hidden: true },
      VALID_TOKEN,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.id).toBe("E_PERM_001");
    expect(setBuiltinFieldHidden).not.toHaveBeenCalled();
  });

  test("rejects invalid input before touching the repo", async () => {
    setSameOrigin();
    const r = await setBuiltinFieldHiddenAction(
      // @ts-expect-error deliberate invalid entity
      { entity: "nope", key: "industry", hidden: true },
      VALID_TOKEN,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.id).toBe("E_CF_004");
    expect(setBuiltinFieldHidden).not.toHaveBeenCalled();
  });
});
