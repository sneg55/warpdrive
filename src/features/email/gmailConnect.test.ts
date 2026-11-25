import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const cookieSet = vi.hoisted(() => vi.fn());
const createContext = vi.hoisted(() => vi.fn());
const createTeamMailboxIntent = vi.hoisted(() => vi.fn());
const guardCsrf = vi.hoisted(() => vi.fn());

vi.mock("next/headers", () => ({
  cookies: () => Promise.resolve({ set: cookieSet, get: vi.fn(), delete: vi.fn() }),
}));
vi.mock("@/server/trpc/context", () => ({ createContext }));
vi.mock("@/db/client", () => ({ db: {} }));
vi.mock("@/features/identity/actions/shared", () => ({
  guardCsrf,
  runWithActor: vi.fn(),
}));
vi.mock("./teamMailboxIntent", () => ({ createTeamMailboxIntent }));

function stubGoogle(id: string, secret: string, domain: string): void {
  vi.stubEnv("GOOGLE_OAUTH_CLIENT_ID", id);
  vi.stubEnv("GOOGLE_OAUTH_CLIENT_SECRET", secret);
  vi.stubEnv("GOOGLE_WORKSPACE_DOMAIN", domain);
}

beforeEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
  cookieSet.mockReset();
  createTeamMailboxIntent.mockReset();
  createTeamMailboxIntent.mockResolvedValue({ ok: true, value: "state-1" });
  guardCsrf.mockReset();
  guardCsrf.mockResolvedValue({ ok: true, value: true });
  createContext.mockReset();
  createContext.mockResolvedValue({
    session: { userId: "u1", sessionId: "s1" },
    actor: { id: "u1" },
    db: {},
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("Gmail connect without Google configuration", () => {
  test("personal connect refuses instead of building an empty client id URL", async () => {
    stubGoogle("", "", "");
    const { connectGmailStart } = await import("./actions");

    const result = await connectGmailStart();

    expect(result).toEqual({ ok: false, error: { id: "E_GMAIL_030" } });
    expect(cookieSet).not.toHaveBeenCalled();
  });

  test("team connect refuses instead of creating a consent intent", async () => {
    stubGoogle("", "", "");
    const { connectTeamMailboxStart } = await import("./teamMailboxActions");

    const result = await connectTeamMailboxStart({ backfillDays: 30 }, "csrf-token");

    expect(result).toEqual({ ok: false, error: { id: "E_GMAIL_030" } });
    expect(createTeamMailboxIntent).not.toHaveBeenCalled();
    expect(cookieSet).not.toHaveBeenCalled();
  });

  test("personal connect starts when the full Google set is present", async () => {
    stubGoogle("client-id", "secret", "example.com");
    const { connectGmailStart } = await import("./actions");

    const result = await connectGmailStart();

    expect(result.ok).toBe(true);
    if (result.ok) expect(new URL(result.value.url).hostname).toBe("accounts.google.com");
    expect(cookieSet).toHaveBeenCalled();
  });
});
