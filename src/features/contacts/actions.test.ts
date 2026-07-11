// @vitest-environment node
// Boundary-validation tests for updatePersonAction/updateOrgAction: Wave 3 added typed
// firmographic fields (annualRevenue regex, employeeCount int/nonnegative, max lengths) to
// orgUpdateInput, but the actions never ran input through the schema, so a malformed value
// reached updateOrg/updatePerson (and from there Postgres) instead of failing cleanly here.
// Mirrors custom-fields/actions.test.ts: next/headers + context mocked so guardCsrf/permission
// run as in production, while the repo layer is spied so no DB is touched, the point is that
// invalid input is rejected BEFORE any repo call.
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

const { updatePerson, updateOrg } = vi.hoisted(() => ({
  updatePerson: vi.fn(() => Promise.resolve({ ok: true as const, value: { id: "p1" } })),
  updateOrg: vi.fn(() => Promise.resolve({ ok: true as const, value: { id: "o1" } })),
}));
vi.mock("./personsRepo", () => ({ updatePerson, createPerson: vi.fn() }));
vi.mock("./orgsRepo", () => ({ updateOrg, createOrg: vi.fn() }));

import { updateOrgAction, updatePersonAction } from "./actions";

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

describe("updateOrgAction validation boundary", () => {
  test("rejects a non-numeric annualRevenue without calling updateOrg", async () => {
    setSameOrigin();
    const r = await updateOrgAction(
      { id: "11111111-1111-4111-8111-111111111111", annualRevenue: "not-a-number" },
      VALID_TOKEN,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.id).toBe("E_CONTACT_008");
    expect(updateOrg).not.toHaveBeenCalled();
  });

  test("rejects a negative employeeCount without calling updateOrg", async () => {
    setSameOrigin();
    const r = await updateOrgAction(
      { id: "11111111-1111-4111-8111-111111111111", employeeCount: -5 },
      VALID_TOKEN,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.id).toBe("E_CONTACT_008");
    expect(updateOrg).not.toHaveBeenCalled();
  });

  test("passes valid firmographic input through to updateOrg", async () => {
    setSameOrigin();
    const r = await updateOrgAction(
      { id: "11111111-1111-4111-8111-111111111111", employeeCount: 42 },
      VALID_TOKEN,
    );
    expect(r.ok).toBe(true);
    expect(updateOrg).toHaveBeenCalledTimes(1);
  });
});

describe("updatePersonAction validation boundary", () => {
  test("rejects a malformed id without calling updatePerson", async () => {
    setSameOrigin();
    const r = await updatePersonAction({ id: "not-a-uuid", name: "Ann" }, VALID_TOKEN);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.id).toBe("E_CONTACT_008");
    expect(updatePerson).not.toHaveBeenCalled();
  });

  test("passes valid input through to updatePerson", async () => {
    setSameOrigin();
    const r = await updatePersonAction(
      { id: "11111111-1111-4111-8111-111111111111", name: "Ann" },
      VALID_TOKEN,
    );
    expect(r.ok).toBe(true);
    expect(updatePerson).toHaveBeenCalledTimes(1);
  });
});
