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

const { createContext } = vi.hoisted(() => ({ createContext: vi.fn() }));
vi.mock("@/server/trpc/context", () => ({ createContext }));

const adapters = vi.hoisted(() => ({
  loadContactActor: vi.fn(() => Promise.resolve({ id: "u1" })),
}));
vi.mock("@/features/contacts/actorAdapters", () => adapters);

const service = vi.hoisted(() => ({
  applyProspects: vi.fn<(...args: unknown[]) => Promise<{ ok: true; value: [] }>>(() =>
    Promise.resolve({ ok: true as const, value: [] }),
  ),
}));
vi.mock("./prospectApply", () => service);

import { applyProspectsAction } from "./prospectApplyActions";

const VALID_TOKEN = "csrf-test-token";
const ORG = "11111111-1111-4111-8111-111111111111";
const BATCH = "22222222-2222-4222-8222-222222222222";
const PERSON = "33333333-3333-4333-8333-333333333333";

function setSameOrigin(): void {
  headerStore.set("origin", "https://app.example.com");
  headerStore.set("sec-fetch-site", "same-origin");
  cookieStore.set(CSRF_COOKIE, VALID_TOKEN);
}

function request(items: unknown[]) {
  return { orgId: ORG, batchId: BATCH, mappingsFingerprint: "fp", items };
}

const NEW_ITEM = {
  providerRef: "ref-a",
  selections: [{ canonicalKey: "person.email", value: "a@example.com" }],
  existing: null,
};

beforeEach(() => {
  headerStore.clear();
  cookieStore.clear();
  vi.clearAllMocks();
  createContext.mockResolvedValue({
    actor: { id: "u1", type: "regular", isActive: true, groupIds: new Set<string>() },
    session: null,
    db: {},
  });
});

describe("applyProspectsAction", () => {
  test("rejects a missing CSRF token before touching the service", async () => {
    const r = await applyProspectsAction(request([NEW_ITEM]), null);
    expect(r.ok === false && r.error.id).toBe("E_AUTH_CSRF");
    expect(service.applyProspects).not.toHaveBeenCalled();
  });

  test("rejects a signed-out caller", async () => {
    setSameOrigin();
    createContext.mockResolvedValue({ actor: null, session: null, db: {} });
    const r = await applyProspectsAction(request([NEW_ITEM]), VALID_TOKEN);
    expect(r.ok === false && r.error.id).toBe("E_AUTH_003");
    expect(service.applyProspects).not.toHaveBeenCalled();
  });

  test("rejects a malformed batch id rather than letting it reach a uuid cast", async () => {
    setSameOrigin();
    const r = await applyProspectsAction(
      { orgId: ORG, batchId: "nope", mappingsFingerprint: "fp", items: [NEW_ITEM] },
      VALID_TOKEN,
    );
    expect(r.ok === false && r.error.id).toBe("E_ENRICH_007");
    expect(service.applyProspects).not.toHaveBeenCalled();
  });

  test("refuses more items than one reveal batch allows", async () => {
    setSameOrigin();
    const r = await applyProspectsAction(
      request(Array.from({ length: 101 }, () => NEW_ITEM)),
      VALID_TOKEN,
    );
    expect(r.ok === false && r.error.id).toBe("E_ENRICH_007");
    expect(service.applyProspects).not.toHaveBeenCalled();
  });

  test("keeps makePrimary on a selection rather than stripping it", async () => {
    setSameOrigin();
    await applyProspectsAction(
      request([
        {
          providerRef: "ref-a",
          selections: [{ canonicalKey: "person.email", value: "a@example.com", makePrimary: true }],
          existing: { personId: PERSON, expectedUpdatedAtIso: "2026-08-31T12:00:00.000Z" },
        },
      ]),
      VALID_TOKEN,
    );
    const passed = service.applyProspects.mock.calls[0]?.[2] as {
      items: { selections: { makePrimary?: boolean }[] }[];
    };
    expect(passed.items[0]?.selections[0]?.makePrimary).toBe(true);
  });

  test("collapses a failed apply to its error id for the client", async () => {
    setSameOrigin();
    service.applyProspects.mockResolvedValueOnce({
      ok: false,
      error: { id: "E_ENRICH_017", context: { batchId: BATCH } },
    } as never);
    const r = await applyProspectsAction(request([NEW_ITEM]), VALID_TOKEN);
    expect(r.ok === false && r.error.id).toBe("E_ENRICH_017");
  });
});
