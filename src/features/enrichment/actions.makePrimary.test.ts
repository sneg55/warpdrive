// @vitest-environment node
// The promotion flag has to survive the action boundary. z.object strips keys it does not declare,
// so a selection schema that omits makePrimary would drop the choice silently and every promotion
// would apply as a plain add.
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

vi.mock("./service", () => ({ runEnrichment: vi.fn() }));

const apply = vi.hoisted(() => ({
  applyEnrichment: vi.fn(() =>
    Promise.resolve({ ok: true as const, value: { appliedFields: [] } }),
  ),
}));
vi.mock("./applyService", () => apply);

import { applyEnrichmentAction } from "./actions";

const VALID_TOKEN = "csrf-test-token";
const UUID = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  headerStore.clear();
  cookieStore.clear();
  vi.clearAllMocks();
  headerStore.set("origin", "https://app.example.com");
  headerStore.set("sec-fetch-site", "same-origin");
  cookieStore.set(CSRF_COOKIE, VALID_TOKEN);
  createContext.mockResolvedValue({
    actor: { id: "u1", type: "regular", isActive: true, groupIds: new Set<string>() },
    session: null,
    db: {},
  });
});

function callWith(selection: Record<string, unknown>): Promise<unknown> {
  return applyEnrichmentAction(
    {
      runId: UUID,
      expectedUpdatedAtIso: "2026-08-24T12:00:00.000Z",
      mappingsFingerprint: "fp",
      selections: [selection],
    },
    VALID_TOKEN,
  );
}

describe("applyEnrichmentAction, promotion flag", () => {
  test("carries makePrimary through to the apply service", async () => {
    await callWith({ canonicalKey: "person.email", value: "nick@company.com", makePrimary: true });
    const input = (apply.applyEnrichment.mock.calls as unknown as unknown[][])[0]?.[2] as
      | { selections: { makePrimary?: boolean }[] }
      | undefined;
    expect(input?.selections[0]?.makePrimary).toBe(true);
  });

  test("leaves the flag off when the caller omits it", async () => {
    await callWith({ canonicalKey: "person.email", value: "nick@company.com" });
    const input = (apply.applyEnrichment.mock.calls as unknown as unknown[][])[0]?.[2] as
      | { selections: { makePrimary?: boolean }[] }
      | undefined;
    expect(input?.selections[0]?.makePrimary).toBeUndefined();
  });

  test("rejects a promotion flag that is not a boolean", async () => {
    const r = (await callWith({
      canonicalKey: "person.email",
      value: "nick@company.com",
      makePrimary: "yes",
    })) as { ok: boolean };
    expect(r.ok).toBe(false);
    expect(apply.applyEnrichment).not.toHaveBeenCalled();
  });
});
