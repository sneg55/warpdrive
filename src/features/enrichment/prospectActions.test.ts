// @vitest-environment node
import { beforeEach, describe, expect, test, vi } from "vitest";
import { AppError } from "@/constants/errorIds";
import { PROSPECT_REVEAL_CHUNK } from "@/constants/prospectSearch";
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

const service = vi.hoisted(() => ({ revealProspects: vi.fn() }));
vi.mock("./revealService", () => service);

import { revealProspectsAction } from "./prospectActions";

const VALID_TOKEN = "csrf-test-token";
const ORG_ID = "11111111-1111-4111-8111-111111111111";
const BATCH_ID = "22222222-2222-4222-8222-222222222222";

function profileOf(providerRef: string): Record<string, unknown> {
  return { providerRef, fullName: "Ada Lovelace", hasEmail: true, hasPhone: false };
}

function payload(profiles: Record<string, unknown>[]): Record<string, unknown> {
  return { orgId: ORG_ID, batchId: BATCH_ID, searchProvider: "apollo", profiles };
}

function setSameOrigin(): void {
  headerStore.set("origin", "https://app.example.com");
  headerStore.set("sec-fetch-site", "same-origin");
  cookieStore.set(CSRF_COOKIE, VALID_TOKEN);
}

beforeEach(() => {
  headerStore.clear();
  cookieStore.clear();
  vi.clearAllMocks();
  createContext.mockResolvedValue({
    actor: { id: "u1", type: "regular", isActive: true, groupIds: new Set<string>() },
    session: null,
    db: {},
  });
  service.revealProspects.mockResolvedValue({
    ok: true,
    value: { items: [], failures: [], mappingsFingerprint: "" },
  });
});

describe("revealProspectsAction", () => {
  test("rejects a missing CSRF token before touching the service", async () => {
    const r = await revealProspectsAction(payload([profileOf("a")]), null);
    expect(r.ok === false && r.error.id).toBe("E_AUTH_CSRF");
    expect(service.revealProspects).not.toHaveBeenCalled();
  });

  test("rejects a signed-out caller", async () => {
    setSameOrigin();
    createContext.mockResolvedValue({ actor: null, session: null, db: {} });
    const r = await revealProspectsAction(payload([profileOf("a")]), VALID_TOKEN);
    expect(r.ok === false && r.error.id).toBe("E_AUTH_003");
    expect(service.revealProspects).not.toHaveBeenCalled();
  });

  test("rejects a selection larger than one reveal chunk", async () => {
    setSameOrigin();
    const profiles = Array.from({ length: PROSPECT_REVEAL_CHUNK + 1 }, (_, i) =>
      profileOf(`p${i}`),
    );
    const r = await revealProspectsAction(payload(profiles), VALID_TOKEN);
    expect(r.ok === false && r.error.id).toBe("E_ENRICH_007");
    expect(service.revealProspects).not.toHaveBeenCalled();
  });

  test("rejects an empty selection", async () => {
    setSameOrigin();
    const r = await revealProspectsAction(payload([]), VALID_TOKEN);
    expect(r.ok === false && r.error.id).toBe("E_ENRICH_007");
    expect(service.revealProspects).not.toHaveBeenCalled();
  });

  test("rejects a malformed organization id rather than letting it reach a uuid cast", async () => {
    setSameOrigin();
    const r = await revealProspectsAction(
      { ...payload([profileOf("a")]), orgId: "nope" },
      VALID_TOKEN,
    );
    expect(r.ok === false && r.error.id).toBe("E_ENRICH_007");
    expect(service.revealProspects).not.toHaveBeenCalled();
  });

  test("rejects a provider outside the registered set", async () => {
    setSameOrigin();
    const r = await revealProspectsAction(
      { ...payload([profileOf("a")]), searchProvider: "clearbit" },
      VALID_TOKEN,
    );
    expect(r.ok === false && r.error.id).toBe("E_ENRICH_007");
  });

  test("drops a key the profile schema does not declare", async () => {
    setSameOrigin();
    await revealProspectsAction(
      payload([{ ...profileOf("a"), email: "ada@acme.com" }]),
      VALID_TOKEN,
    );
    const passed = service.revealProspects.mock.calls[0]?.[2] as {
      profiles: Record<string, unknown>[];
    };
    expect(passed.profiles[0]).not.toHaveProperty("email");
    expect(passed.profiles[0]?.providerRef).toBe("a");
  });

  test("carries a service error id across the client boundary", async () => {
    setSameOrigin();
    service.revealProspects.mockResolvedValue({
      ok: false,
      error: new AppError("E_PERM_001", "contact.create required", { orgId: ORG_ID }),
    });

    const r = await revealProspectsAction(payload([profileOf("a")]), VALID_TOKEN);

    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error.id).toBe("E_PERM_001");
    expect(r.ok === false && "message" in r.error).toBe(false);
  });

  test("returns what the service revealed", async () => {
    setSameOrigin();
    service.revealProspects.mockResolvedValue({
      ok: true,
      value: {
        items: [
          {
            providerRef: "a",
            profile: profileOf("a"),
            outcomes: [],
            fields: [],
            match: { kind: "new" },
          },
        ],
        failures: [],
        mappingsFingerprint: "fp",
      },
    });

    const r = await revealProspectsAction(payload([profileOf("a")]), VALID_TOKEN);

    expect(r.ok && r.value.items).toHaveLength(1);
    expect(r.ok && r.value.mappingsFingerprint).toBe("fp");
  });
});
