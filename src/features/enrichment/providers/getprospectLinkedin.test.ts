import { afterEach, describe, expect, it, vi } from "vitest";
import emailFound from "./__fixtures__/getprospect-email-found.json";
import lookupNotFound from "./__fixtures__/getprospect-email-lookup-not-found.json";
import linkedinContact from "./__fixtures__/getprospect-linkedin-contact.json";
import { getprospectProvider } from "./getprospect";

const API_KEY = "gp-secret-key-value";
const EMAIL = "dana.hoskova@sprinx.com";
const LINKEDIN_URL = "https://www.linkedin.com/in/dana-hoskova";
const CONTACT_URL = "https://api.getprospect.com/public/v1/insights/contact";
const FINDER_URL = "https://api.getprospect.com/v2/email-finder";
const NAMED = { linkedinUrl: LINKEDIN_URL, fullName: "Dana Hoskova", companyDomain: "sprinx.com" };

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

interface Reply {
  body?: unknown;
  status?: number;
  reject?: Error;
}

// Replies are consumed in call order, so a fall-through spends a second, distinguishable response.
function stub(...replies: Reply[]) {
  const mock = vi.fn(() => {
    const next = replies.shift() ?? { body: {} };
    if (next.reject !== undefined) return Promise.reject(next.reject);
    const text = typeof next.body === "string" ? next.body : JSON.stringify(next.body ?? {});
    return Promise.resolve(
      new Response(text, {
        status: next.status ?? 200,
        headers: { "content-type": "application/json" },
      }),
    );
  });
  globalThis.fetch = mock;
  return mock;
}

function urlAt(mock: ReturnType<typeof stub>, index: number): string {
  const call = mock.mock.calls[index] as unknown as [string, RequestInit] | undefined;
  if (call === undefined) throw new Error(`fetch call ${index} was not made`);
  return call[0];
}

function run(input: Parameters<typeof getprospectProvider.matchPerson>[0]) {
  return getprospectProvider.matchPerson(input, API_KEY, new AbortController().signal);
}

describe("getprospect matchPerson by LinkedIn url", () => {
  it("falls through to the email finder when the profile misses", async () => {
    const mock = stub({ body: {} }, { body: emailFound });
    const out = await run(NAMED);
    expect(urlAt(mock, 0)).toContain(CONTACT_URL);
    expect(urlAt(mock, 1)).toContain(FINDER_URL);
    expect(urlAt(mock, 1)).toContain("full_name=Dana+Hoskova");
    expect(mock).toHaveBeenCalledTimes(2);
    expect(out.kind).toBe("ok");
    expect(out.candidate?.fields).toEqual({
      "person.email": EMAIL,
      "person.companyDomain": "sprinx.com",
    });
  });

  it("falls through when the profile 404s", async () => {
    const mock = stub({ body: { message: "Entity not found" }, status: 404 }, { body: emailFound });
    const out = await run(NAMED);
    expect(urlAt(mock, 1)).toContain(FINDER_URL);
    expect(out.kind).toBe("ok");
  });

  it("returns the LinkedIn match without spending a finder call", async () => {
    const mock = stub({ body: linkedinContact }, { body: emailFound });
    const out = await run(NAMED);
    expect(mock).toHaveBeenCalledTimes(1);
    expect(urlAt(mock, 0)).toContain(CONTACT_URL);
    expect(out.kind).toBe("ok");
    expect(out.candidate?.sourceId).toBe("5f2b9c1ad4e10a0017a1b2c3");
    expect(out.candidate?.fields["person.fullName"]).toBe("Dana Hoskova");
  });

  it("surfaces a rejected key from the LinkedIn call instead of falling through", async () => {
    const mock = stub(
      { body: { message: "Unauthorized user" }, status: 401 },
      { body: emailFound },
    );
    const out = await run(NAMED);
    expect(out.kind).toBe("auth");
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it("surfaces an unreachable provider from the LinkedIn call instead of falling through", async () => {
    const mock = stub({ reject: new TypeError("fetch failed") }, { body: emailFound });
    const out = await run(NAMED);
    expect(out.kind).toBe("provider_error");
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it("reports the miss when the profile misses and the finder has nothing to send", async () => {
    const mock = stub({ body: {} });
    const out = await run({ linkedinUrl: LINKEDIN_URL });
    expect(mock).toHaveBeenCalledTimes(1);
    expect(out.kind).toBe("no_match");
    expect(out.message ?? "").toContain("LinkedIn");
  });

  it("keeps the email miss in the message when LinkedIn misses too", async () => {
    const mock = stub({ body: lookupNotFound }, { body: {} });
    const out = await run({ email: EMAIL, linkedinUrl: LINKEDIN_URL });
    expect(mock).toHaveBeenCalledTimes(2);
    expect(out.kind).toBe("no_match");
    expect(out.message).toBe("GetProspect does not hold that address");
  });
});
