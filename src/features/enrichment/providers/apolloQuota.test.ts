// Split out of apollo.test.ts, which is at the file-size limit.
import { afterEach, describe, expect, it, vi } from "vitest";
import orgMatch from "./__fixtures__/apollo-org-match.json";
import personMatch from "./__fixtures__/apollo-person-match.json";
import personMiss from "./__fixtures__/apollo-person-miss.json";
import { apolloProvider } from "./apollo";
import type { ProviderOutcome } from "./types";

const API_KEY = "sk-apollo-secret-value";
const signal = (): AbortSignal => new AbortController().signal;

function stubFetch(payload: unknown, headers: Record<string, string>): void {
  const response = new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json", ...headers },
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(() => Promise.resolve(response)),
  );
}

const person = (): Promise<ProviderOutcome> =>
  apolloProvider.matchPerson({ email: "a@b.co" }, API_KEY, signal());
const org = (): Promise<ProviderOutcome> =>
  apolloProvider.matchOrganization({ domain: "apollo.io" }, API_KEY, signal());

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("remaining quota", () => {
  it("carries what is left of both windows off a successful call", async () => {
    stubFetch(orgMatch, {
      "x-hourly-requests-left": "97",
      "x-24-hour-requests-left": "1450",
    });
    const out = await org();
    expect(out.kind).toBe("ok");
    expect(out.quotaRemaining).toEqual({ hourly: 97, daily: 1450 });
  });

  it("carries the one window a response reports", async () => {
    stubFetch(personMatch, { "x-24-hour-requests-left": "8" });
    expect((await person()).quotaRemaining).toEqual({ daily: 8 });
  });

  // Zero is the number an admin most needs to see, and it is the one a truthiness check loses.
  it("reports a spent window as zero rather than dropping it", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-24T12:00:00.000Z"));
    stubFetch(orgMatch, { "x-hourly-requests-left": "0", "x-24-hour-requests-left": "5" });
    const out = await org();
    expect(out.quotaRemaining).toEqual({ hourly: 0, daily: 5 });
    expect(out.retryAfterIso).toBe("2026-08-24T13:00:00.000Z");
  });

  it("reports the counts on a miss too, since the call still counted", async () => {
    stubFetch(personMiss, { "x-hourly-requests-left": "12" });
    const out = await person();
    expect(out.kind).toBe("no_match");
    expect(out.quotaRemaining).toEqual({ hourly: 12 });
  });

  it("says nothing when the response carries no usable counts", async () => {
    stubFetch(orgMatch, { "x-hourly-requests-left": "?" });
    expect((await org()).quotaRemaining).toBeUndefined();
  });
});
