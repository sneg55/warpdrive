// @vitest-environment node
// Boundary tests for the record-side enrichment actions. A server action is a public endpoint, so
// what is asserted here is that a bad caller or bad input never reaches the service layer.
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

const service = vi.hoisted(() => ({
  runEnrichment: vi.fn(() =>
    Promise.resolve({ ok: true as const, value: { runId: "r1", fields: [] } }),
  ),
}));
vi.mock("./service", () => service);

const apply = vi.hoisted(() => ({
  applyEnrichment: vi.fn(() =>
    Promise.resolve({ ok: true as const, value: { appliedFields: [] } }),
  ),
}));
vi.mock("./applyService", () => apply);

import { applyEnrichmentAction, enrichRecordAction } from "./actions";

const VALID_TOKEN = "csrf-test-token";
const UUID = "11111111-1111-4111-8111-111111111111";

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
});

describe("enrichRecordAction", () => {
  test("rejects a missing CSRF token before touching the service", async () => {
    const r = await enrichRecordAction({ entityType: "person", entityId: UUID }, null);
    expect(r.ok === false && r.error.id).toBe("E_AUTH_CSRF");
    expect(service.runEnrichment).not.toHaveBeenCalled();
  });

  test("rejects a signed-out caller", async () => {
    setSameOrigin();
    createContext.mockResolvedValue({ actor: null, session: null, db: {} });
    const r = await enrichRecordAction({ entityType: "person", entityId: UUID }, VALID_TOKEN);
    expect(r.ok === false && r.error.id).toBe("E_AUTH_003");
    expect(service.runEnrichment).not.toHaveBeenCalled();
  });

  test("rejects an entity type outside person and organization", async () => {
    setSameOrigin();
    const r = await enrichRecordAction({ entityType: "deal", entityId: UUID }, VALID_TOKEN);
    expect(r.ok === false && r.error.id).toBe("E_ENRICH_007");
    expect(service.runEnrichment).not.toHaveBeenCalled();
  });

  test("rejects a malformed id rather than letting it reach a uuid cast", async () => {
    setSameOrigin();
    const r = await enrichRecordAction({ entityType: "person", entityId: "nope" }, VALID_TOKEN);
    expect(r.ok === false && r.error.id).toBe("E_ENRICH_007");
    expect(service.runEnrichment).not.toHaveBeenCalled();
  });

  test("passes a well-formed request through", async () => {
    setSameOrigin();
    const r = await enrichRecordAction({ entityType: "person", entityId: UUID }, VALID_TOKEN);
    expect(r.ok).toBe(true);
    expect(service.runEnrichment).toHaveBeenCalledOnce();
  });

  // The dialog needs the resume time and the per-provider reasons to explain a degraded run, so
  // the context has to survive the action boundary rather than collapsing to a bare id.
  test("carries the error context back to the caller", async () => {
    setSameOrigin();
    service.runEnrichment.mockResolvedValueOnce({
      ok: false,
      error: { id: "E_ENRICH_003", context: { earliestRetryIso: "2026-08-24T14:20:00.000Z" } },
    } as never);
    const r = await enrichRecordAction({ entityType: "person", entityId: UUID }, VALID_TOKEN);
    expect(r.ok === false && r.error.context?.earliestRetryIso).toBe("2026-08-24T14:20:00.000Z");
  });
});

describe("applyEnrichmentAction", () => {
  test("rejects a selection value that is neither a string nor a number", async () => {
    setSameOrigin();
    const r = await applyEnrichmentAction(
      {
        runId: UUID,
        expectedUpdatedAtIso: "2026-08-24T12:00:00.000Z",
        selections: [{ canonicalKey: "org.industry", value: { nested: true } }],
      },
      VALID_TOKEN,
    );
    expect(r.ok === false && r.error.id).toBe("E_ENRICH_007");
    expect(apply.applyEnrichment).not.toHaveBeenCalled();
  });

  test("refuses an unbounded selection list", async () => {
    setSameOrigin();
    const r = await applyEnrichmentAction(
      {
        runId: UUID,
        expectedUpdatedAtIso: "2026-08-24T12:00:00.000Z",
        selections: Array.from({ length: 101 }, () => ({
          canonicalKey: "org.industry",
          value: "x",
        })),
      },
      VALID_TOKEN,
    );
    expect(r.ok === false && r.error.id).toBe("E_ENRICH_007");
    expect(apply.applyEnrichment).not.toHaveBeenCalled();
  });

  test("requires the expected timestamp, since it is the whole staleness guard", async () => {
    setSameOrigin();
    const r = await applyEnrichmentAction({ runId: UUID, selections: [] }, VALID_TOKEN);
    expect(r.ok === false && r.error.id).toBe("E_ENRICH_007");
    expect(apply.applyEnrichment).not.toHaveBeenCalled();
  });

  // The dialog echoes back the mapping targets it was shown. Without it the server cannot tell
  // that an admin repointed a canonical key while the review was open.
  test("requires the mapping fingerprint the review was built from", async () => {
    setSameOrigin();
    const r = await applyEnrichmentAction(
      {
        runId: UUID,
        expectedUpdatedAtIso: "2026-08-24T12:00:00.000Z",
        selections: [{ canonicalKey: "org.industry", value: "B2B SaaS" }],
      },
      VALID_TOKEN,
    );
    expect(r.ok === false && r.error.id).toBe("E_ENRICH_007");
    expect(apply.applyEnrichment).not.toHaveBeenCalled();
  });

  test("passes a well-formed apply through", async () => {
    setSameOrigin();
    const r = await applyEnrichmentAction(
      {
        runId: UUID,
        expectedUpdatedAtIso: "2026-08-24T12:00:00.000Z",
        mappingsFingerprint: "org.industry=builtin=industry=",
        selections: [{ canonicalKey: "org.industry", value: "B2B SaaS" }],
      },
      VALID_TOKEN,
    );
    expect(r.ok).toBe(true);
    expect(apply.applyEnrichment).toHaveBeenCalledOnce();
  });
});
