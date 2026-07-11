import { beforeEach, describe, expect, test, vi } from "vitest";
import { CSRF_COOKIE } from "@/features/auth/csrf";
import { ok } from "@/types/result";

// Per-test cookie/header stores. next/headers is mocked below to read from them so
// guardCsrf can be exercised exactly as it runs inside a server action.
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

import { createTeamAction, runWithActor } from "./actions";
import { guardCsrf } from "./actions/shared";

const VALID_TOKEN = "double-submit-token-value";

function setSameOriginHeaders(): void {
  headerStore.set("origin", "https://app.example.com");
  headerStore.set("sec-fetch-site", "same-origin");
}

beforeEach(() => {
  headerStore.clear();
  cookieStore.clear();
});

describe("runWithActor", () => {
  test("rejects when there is no actor", async () => {
    const r = await runWithActor(null, () => Promise.resolve(ok(true)));
    expect(r.ok).toBe(false);
  });

  test("runs the body when an actor is present", async () => {
    const actor = {
      id: "a",
      type: "admin" as const,
      isActive: true,
      groupIds: new Set<string>(),
      flags: new Set<never>(),
    };
    const r = await runWithActor(actor, (a) => Promise.resolve(ok(a.id)));
    expect(r.ok === true && r.value).toBe("a");
  });
});

describe("guardCsrf", () => {
  test("rejects a missing header token even with a valid cookie + same-origin headers", async () => {
    cookieStore.set(CSRF_COOKIE, VALID_TOKEN);
    setSameOriginHeaders();
    const r = await guardCsrf(null);
    expect(r.ok).toBe(false);
  });

  test("accepts a matching double-submit token with same-origin headers", async () => {
    cookieStore.set(CSRF_COOKIE, VALID_TOKEN);
    setSameOriginHeaders();
    const r = await guardCsrf(VALID_TOKEN);
    expect(r.ok).toBe(true);
  });
});

describe("mutating action CSRF enforcement", () => {
  // A bad CSRF token is rejected BEFORE any service/db call: the action short-circuits at
  // guardCsrf, so createContext/db are never reached and no row is written.
  test("createTeamAction rejects a missing CSRF token without writing", async () => {
    cookieStore.set(CSRF_COOKIE, VALID_TOKEN);
    setSameOriginHeaders();
    const r = await createTeamAction(null, { name: "Sales", managerId: null });
    expect(r.ok).toBe(false);
  });
});
