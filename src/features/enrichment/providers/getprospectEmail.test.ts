import { afterEach, describe, expect, it, vi } from "vitest";
import { isCanonicalKey } from "../canonical";
import lookupFound from "./__fixtures__/getprospect-email-lookup-found.json";
import lookupNotFound from "./__fixtures__/getprospect-email-lookup-not-found.json";
import linkedinContact from "./__fixtures__/getprospect-linkedin-contact.json";
import { getprospectProvider } from "./getprospect";

const API_KEY = "gp-secret-key-value";
const EMAIL = "dana.hoskova@sprinx.com";
const LOOKUP_URL = "https://api.getprospect.com/public/v1/email/lookup";
const LINKEDIN_URL = "https://www.linkedin.com/in/dana-hoskova";

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

interface Reply {
  body: unknown;
  status?: number;
}

// Replies are consumed in call order, so a fall-through spends a second, distinguishable response.
function stub(...replies: Reply[]) {
  const mock = vi.fn(() => {
    const next = replies.shift() ?? { body: {} };
    const text = typeof next.body === "string" ? next.body : JSON.stringify(next.body);
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

function callAt(mock: ReturnType<typeof stub>, index: number): { url: string; init: RequestInit } {
  const call = mock.mock.calls[index] as unknown as [string, RequestInit] | undefined;
  if (call === undefined) throw new Error(`fetch call ${index} was not made`);
  return { url: call[0], init: call[1] };
}

describe("getprospect matchPerson by email", () => {
  it("looks the address up with both key headers and the abort signal", async () => {
    const mock = stub({ body: lookupFound });
    const controller = new AbortController();
    await getprospectProvider.matchPerson({ email: EMAIL }, API_KEY, controller.signal);
    const { url, init } = callAt(mock, 0);
    expect(url).toContain(LOOKUP_URL);
    expect(url).toContain(`email=${encodeURIComponent(EMAIL)}`);
    expect(init.method).toBe("GET");
    const headers = init.headers as Record<string, string>;
    expect(headers.apiKey).toBe(API_KEY);
    expect(headers["X-API-Key"]).toBe(API_KEY);
    expect(init.signal).toBe(controller.signal);
    expect(mock).toHaveBeenCalledTimes(1);
  });

  it("normalises a confirmed address into canonical keys", async () => {
    stub({ body: lookupFound });
    const out = await getprospectProvider.matchPerson(
      { email: EMAIL },
      API_KEY,
      new AbortController().signal,
    );
    expect(out).toMatchObject({ provider: "getprospect", kind: "ok" });
    expect(out.candidate?.fields).toEqual({ "person.email": EMAIL });
    for (const key of Object.keys(out.candidate?.fields ?? {}))
      expect(isCanonicalKey(key)).toBe(true);
  });

  it("reports no match when the address is not known", async () => {
    stub({ body: lookupNotFound });
    const out = await getprospectProvider.matchPerson(
      { email: EMAIL },
      API_KEY,
      new AbortController().signal,
    );
    expect(out.kind).toBe("no_match");
    expect(out.candidate).toBeUndefined();
  });

  it("reads a 404 on the lookup as a miss, not an outage", async () => {
    stub({ body: { message: "Email not found", statusCode: 404 }, status: 404 });
    const out = await getprospectProvider.matchPerson(
      { email: EMAIL },
      API_KEY,
      new AbortController().signal,
    );
    expect(out.kind).toBe("no_match");
  });

  it("takes the email route ahead of LinkedIn, and falls back to it on a miss", async () => {
    const first = stub({ body: lookupFound });
    await getprospectProvider.matchPerson(
      { email: EMAIL, linkedinUrl: LINKEDIN_URL },
      API_KEY,
      new AbortController().signal,
    );
    expect(callAt(first, 0).url).toContain(LOOKUP_URL);
    expect(first).toHaveBeenCalledTimes(1);

    const second = stub({ body: lookupNotFound }, { body: linkedinContact });
    const out = await getprospectProvider.matchPerson(
      { email: EMAIL, linkedinUrl: LINKEDIN_URL },
      API_KEY,
      new AbortController().signal,
    );
    expect(callAt(second, 1).url).toContain("/public/v1/insights/contact");
    expect(out.kind).toBe("ok");
    expect(out.candidate?.fields["person.fullName"]).toBe("Dana Hoskova");
  });

  it("surfaces a rejected key from the lookup instead of trying the next route", async () => {
    const mock = stub({ body: { message: "Unauthorized user" }, status: 401 });
    const out = await getprospectProvider.matchPerson(
      { email: EMAIL, linkedinUrl: LINKEDIN_URL },
      API_KEY,
      new AbortController().signal,
    );
    expect(out.kind).toBe("auth");
    expect(mock).toHaveBeenCalledTimes(1);
  });
});
