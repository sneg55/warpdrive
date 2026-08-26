// @vitest-environment node
// The enrichment settings actions hold a company-wide credential that every user spends against,
// so the admin gate and the Zod boundary are the whole point of this layer. Context and
// next/headers are mocked so guardCsrf and the gate run as in production, while the repo is spied
// so no DB is touched: what is asserted is that a bad caller or bad input never reaches it.
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

const repo = vi.hoisted(() => ({
  setProviderKey: vi.fn(() => Promise.resolve()),
  clearProviderKey: vi.fn(() => Promise.resolve()),
  setProviderEnabled: vi.fn(() => Promise.resolve({ ok: true as const, value: undefined })),
}));
vi.mock("./providersRepo", () => repo);

const mappings = vi.hoisted(() => ({
  upsertMapping: vi.fn(() => Promise.resolve({ ok: true as const, value: undefined })),
  clearMapping: vi.fn(() => Promise.resolve()),
  setCacheTtlDays: vi.fn(() => Promise.resolve()),
}));
vi.mock("./mappingsRepo", () => mappings);

const probe = vi.hoisted(() => ({ testProvider: vi.fn() }));
vi.mock("./testProvider", () => probe);

import {
  setCacheTtlAction,
  setMappingAction,
  setProviderEnabledAction,
  setProviderKeyAction,
  testProviderAction,
} from "./settingsActions";

const VALID_TOKEN = "csrf-test-token";
const KEY = "sk-live-abcdefgh";

function setSameOrigin(): void {
  headerStore.set("origin", "https://app.example.com");
  headerStore.set("sec-fetch-site", "same-origin");
  cookieStore.set(CSRF_COOKIE, VALID_TOKEN);
}

function asActor(type: "admin" | "regular"): void {
  createContext.mockResolvedValue({
    actor: { id: "u1", type, isActive: true, groupIds: new Set<string>() },
    session: null,
    db: {},
  });
}

beforeEach(() => {
  headerStore.clear();
  cookieStore.clear();
  vi.clearAllMocks();
  asActor("admin");
});

describe("admin gate", () => {
  test("a regular user cannot store a provider key", async () => {
    setSameOrigin();
    asActor("regular");
    const r = await setProviderKeyAction({ provider: "apollo", apiKey: KEY }, VALID_TOKEN);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error.id).toBe("E_PERM_001");
    expect(repo.setProviderKey).not.toHaveBeenCalled();
  });

  test("a regular user cannot change the mapping", async () => {
    setSameOrigin();
    asActor("regular");
    const r = await setMappingAction(
      {
        entity: "person",
        canonicalKey: "person.email",
        target: { kind: "builtin", key: "emails" },
      },
      VALID_TOKEN,
    );
    expect(r.ok).toBe(false);
    expect(mappings.upsertMapping).not.toHaveBeenCalled();
  });

  test("a signed-out caller is rejected before the gate", async () => {
    setSameOrigin();
    createContext.mockResolvedValue({ actor: null, session: null, db: {} });
    const r = await setProviderKeyAction({ provider: "apollo", apiKey: KEY }, VALID_TOKEN);
    expect(r.ok === false && r.error.id).toBe("E_AUTH_003");
    expect(repo.setProviderKey).not.toHaveBeenCalled();
  });
});

describe("CSRF", () => {
  test("a missing token stops an admin too", async () => {
    const r = await setProviderKeyAction({ provider: "apollo", apiKey: KEY }, null);
    expect(r.ok === false && r.error.id).toBe("E_AUTH_CSRF");
    expect(repo.setProviderKey).not.toHaveBeenCalled();
  });
});

describe("input boundary", () => {
  test("rejects a provider the registry does not know", async () => {
    setSameOrigin();
    const r = await setProviderKeyAction({ provider: "clearbit", apiKey: KEY }, VALID_TOKEN);
    expect(r.ok === false && r.error.id).toBe("E_ENRICH_007");
    expect(repo.setProviderKey).not.toHaveBeenCalled();
  });

  test("rejects an implausibly short key rather than storing it", async () => {
    setSameOrigin();
    const r = await setProviderKeyAction({ provider: "apollo", apiKey: "abc" }, VALID_TOKEN);
    expect(r.ok === false && r.error.id).toBe("E_ENRICH_007");
    expect(repo.setProviderKey).not.toHaveBeenCalled();
  });

  test("stores a well-formed key", async () => {
    setSameOrigin();
    const r = await setProviderKeyAction({ provider: "apollo", apiKey: KEY }, VALID_TOKEN);
    expect(r.ok).toBe(true);
    expect(repo.setProviderKey).toHaveBeenCalledOnce();
  });

  test("rejects a negative cache TTL", async () => {
    setSameOrigin();
    const r = await setCacheTtlAction({ days: -1 }, VALID_TOKEN);
    expect(r.ok === false && r.error.id).toBe("E_ENRICH_007");
    expect(mappings.setCacheTtlDays).not.toHaveBeenCalled();
  });

  test("accepts zero, which is how the cache is switched off", async () => {
    setSameOrigin();
    const r = await setCacheTtlAction({ days: 0 }, VALID_TOKEN);
    expect(r.ok).toBe(true);
    expect(mappings.setCacheTtlDays).toHaveBeenCalledWith({}, 0, expect.anything());
  });

  test("rejects a mapping target that is neither builtin nor custom", async () => {
    setSameOrigin();
    const r = await setMappingAction(
      { entity: "person", canonicalKey: "person.email", target: { kind: "guess", key: "emails" } },
      VALID_TOKEN,
    );
    expect(r.ok === false && r.error.id).toBe("E_ENRICH_007");
    expect(mappings.upsertMapping).not.toHaveBeenCalled();
  });

  test("surfaces a repo refusal rather than reporting success", async () => {
    setSameOrigin();
    repo.setProviderEnabled.mockResolvedValueOnce({
      ok: false,
      error: { id: "E_ENRICH_010" },
    } as never);
    const r = await setProviderEnabledAction({ provider: "apollo", enabled: true }, VALID_TOKEN);
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error.id).toBe("E_ENRICH_010");
  });
});

describe("test connection", () => {
  test("passes the remaining quota back to the caller alongside the verdict", async () => {
    setSameOrigin();
    probe.testProvider.mockResolvedValueOnce({
      ok: true,
      value: { kind: "ok", quotaRemaining: { hourly: 0, daily: 1450 } },
    });
    const r = await testProviderAction({ provider: "apollo" }, VALID_TOKEN);
    expect(r).toEqual({ ok: true, kind: "ok", quotaRemaining: { hourly: 0, daily: 1450 } });
  });

  test("reports the verdict alone when the provider published no counts", async () => {
    setSameOrigin();
    probe.testProvider.mockResolvedValueOnce({ ok: true, value: { kind: "no_match" } });
    const r = await testProviderAction({ provider: "apollo" }, VALID_TOKEN);
    expect(r).toEqual({ ok: true, kind: "no_match" });
  });

  test("a regular user cannot spend a credit testing a key", async () => {
    setSameOrigin();
    asActor("regular");
    const r = await testProviderAction({ provider: "apollo" }, VALID_TOKEN);
    expect(r.ok === false && r.error.id).toBe("E_PERM_001");
    expect(probe.testProvider).not.toHaveBeenCalled();
  });
});
