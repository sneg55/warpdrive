import { afterEach, describe, expect, it, vi } from "vitest";
import { isCanonicalKey } from "../canonical";
import company from "./__fixtures__/getprospect-company.json";
import companyEmpty from "./__fixtures__/getprospect-company-empty.json";
import emailEnvelope from "./__fixtures__/getprospect-email-envelope.json";
import emailFound from "./__fixtures__/getprospect-email-found.json";
import emailNotFound from "./__fixtures__/getprospect-email-not-found.json";
import linkedinContact from "./__fixtures__/getprospect-linkedin-contact.json";
import { getprospectProvider } from "./getprospect";

const API_KEY = "gp-secret-key-value";
const SIGNAL = new AbortController().signal;
const PERSON = { fullName: "Dana Hoskova", companyDomain: "sprinx.com" };
const LINKEDIN_URL = "https://www.linkedin.com/in/dana-hoskova";
const BY_LINKEDIN = { linkedinUrl: LINKEDIN_URL };

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

function stub(body: unknown, init?: { status?: number; headers?: Record<string, string> }) {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  const mock = vi.fn(() =>
    Promise.resolve(
      new Response(text, {
        status: init?.status ?? 200,
        headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
      }),
    ),
  );
  globalThis.fetch = mock;
  return mock;
}

function lastCall(mock: ReturnType<typeof stub>): { url: string; init: RequestInit } {
  const call = mock.mock.calls.at(-1) as unknown as [string, RequestInit] | undefined;
  if (call === undefined) throw new Error("fetch was not called");
  return { url: call[0], init: call[1] };
}

function headerOf(init: RequestInit, name: string): string | undefined {
  return (init.headers as Record<string, string> | undefined)?.[name];
}

function bodyOf(init: RequestInit): unknown {
  return JSON.parse(typeof init.body === "string" ? init.body : "null");
}

describe("getprospectProvider", () => {
  it("is registered under the getprospect id", () => {
    expect(getprospectProvider.id).toBe("getprospect");
  });

  describe("matchPerson", () => {
    it("finds an email from a name plus a company domain", async () => {
      const mock = stub(emailFound);
      const out = await getprospectProvider.matchPerson(PERSON, API_KEY, SIGNAL);
      expect(out).toMatchObject({ provider: "getprospect", kind: "ok" });
      expect(out.candidate?.fields).toEqual({
        "person.email": "dana.hoskova@sprinx.com",
        "person.companyDomain": "sprinx.com",
      });
      const { url } = lastCall(mock);
      expect(url).toContain("https://api.getprospect.com/v2/email-finder");
      expect(url).toContain("full_name=Dana+Hoskova");
      expect(url).toContain("domain=sprinx.com");
    });

    it("falls back to first and last name and to the company name", async () => {
      const mock = stub(emailFound);
      const input = { firstName: "Dana", lastName: "Hoskova", companyName: "Sprinx Systems" };
      await getprospectProvider.matchPerson(input, API_KEY, SIGNAL);
      const { url } = lastCall(mock);
      expect(url).toContain("first_name=Dana");
      expect(url).toContain("last_name=Hoskova");
      expect(url).toContain("company=Sprinx+Systems");
    });

    it("reads the wrapped envelope shape as well as the flat one", async () => {
      stub(emailEnvelope);
      const input = { fullName: "Ada Lovelace", companyDomain: "acme.com" };
      const out = await getprospectProvider.matchPerson(input, API_KEY, SIGNAL);
      expect(out.kind).toBe("ok");
      expect(out.candidate?.fields["person.email"]).toBe("ada@acme.com");
    });

    it("reports no match when the finder returns a status but no address", async () => {
      stub(emailNotFound);
      const out = await getprospectProvider.matchPerson(PERSON, API_KEY, SIGNAL);
      expect(out.kind).toBe("no_match");
      expect(out.candidate).toBeUndefined();
    });

    it("short circuits without a call when the name is missing", async () => {
      const mock = stub(emailFound);
      const out = await getprospectProvider.matchPerson(
        { companyDomain: "sprinx.com" },
        API_KEY,
        SIGNAL,
      );
      expect(out.kind).toBe("no_match");
      expect(out.message ?? "").toContain("name");
      expect(mock).not.toHaveBeenCalled();
    });

    it("short circuits without a call when the company is missing", async () => {
      const mock = stub(emailFound);
      const out = await getprospectProvider.matchPerson(
        { fullName: "Dana Hoskova" },
        API_KEY,
        SIGNAL,
      );
      expect(out.kind).toBe("no_match");
      expect(out.message ?? "").toContain("company");
      expect(mock).not.toHaveBeenCalled();
    });

    it("prefers the LinkedIn insights lookup and normalises its richer payload", async () => {
      const mock = stub(linkedinContact);
      const input = { ...PERSON, linkedinUrl: LINKEDIN_URL };
      const out = await getprospectProvider.matchPerson(input, API_KEY, SIGNAL);
      const { url } = lastCall(mock);
      expect(url).toContain("https://api.getprospect.com/public/v1/insights/contact");
      expect(url).toContain("linkedinUrl=https%3A%2F%2Fwww.linkedin.com%2Fin%2Fdana-hoskova");
      expect(out.kind).toBe("ok");
      expect(out.candidate?.sourceId).toBe("5f2b9c1ad4e10a0017a1b2c3");
      expect(out.candidate?.fields).toEqual({
        "person.firstName": "Dana",
        "person.lastName": "Hoskova",
        "person.fullName": "Dana Hoskova",
        "person.email": "dana.hoskova@sprinx.com",
        "person.companyName": "Sprinx Systems",
        "person.companyDomain": "sprinx.com",
        "person.city": "Prague",
        "person.state": "Praha",
        "person.country": "CZ",
      });
    });

    it("drops every phone payload and emits only canonical keys", async () => {
      stub(linkedinContact);
      const out = await getprospectProvider.matchPerson(BY_LINKEDIN, API_KEY, SIGNAL);
      const serialised = JSON.stringify(out.candidate?.fields ?? {});
      expect(serialised).not.toContain("phone");
      expect(serialised).not.toContain("+420");
      for (const key of Object.keys(out.candidate?.fields ?? {}))
        expect(isCanonicalKey(key)).toBe(true);
    });

    it("reads a 404 on the LinkedIn lookup as a miss, not an outage", async () => {
      stub({ message: "Entity not found", statusCode: 404 }, { status: 404 });
      const out = await getprospectProvider.matchPerson(BY_LINKEDIN, API_KEY, SIGNAL);
      expect(out.kind).toBe("no_match");
      expect(out.candidate).toBeUndefined();
    });

    it("sends both api key header names and threads the abort signal into fetch", async () => {
      const mock = stub(emailFound);
      const controller = new AbortController();
      await getprospectProvider.matchPerson(PERSON, API_KEY, controller.signal);
      const { init } = lastCall(mock);
      expect(headerOf(init, "X-API-Key")).toBe(API_KEY);
      expect(headerOf(init, "apiKey")).toBe(API_KEY);
      expect(init.signal).toBe(controller.signal);
    });

    it("classifies a rejected key as auth without echoing the key", async () => {
      stub({ message: "Unauthorized user", statusCode: 401 }, { status: 401 });
      const out = await getprospectProvider.matchPerson(PERSON, API_KEY, SIGNAL);
      expect(out.kind).toBe("auth");
      expect(out.message ?? "").not.toContain(API_KEY);
    });

    it("classifies 429 as throttled and carries retry-after through", async () => {
      stub({ message: "Too many requests" }, { status: 429, headers: { "retry-after": "60" } });
      const out = await getprospectProvider.matchPerson(PERSON, API_KEY, SIGNAL);
      expect(out.kind).toBe("throttled");
      const resumes = Date.parse(out.retryAfterIso ?? "");
      expect(resumes).toBeGreaterThan(Date.now());
      expect(resumes).toBeLessThanOrEqual(Date.now() + 61_000);
    });

    it("still sets a resume time when 429 carries no retry-after", async () => {
      stub({ message: "Too many requests" }, { status: 429 });
      const out = await getprospectProvider.matchPerson(PERSON, API_KEY, SIGNAL);
      expect(out.kind).toBe("throttled");
      expect(Date.parse(out.retryAfterIso ?? "")).toBeGreaterThan(Date.now() + 61_000);
    });

    it("classifies a credit-exhausted 402 as quota", async () => {
      stub({ message: "Insufficiently credits", statusCode: 402 }, { status: 402 });
      const out = await getprospectProvider.matchPerson(PERSON, API_KEY, SIGNAL);
      expect(out.kind).toBe("quota");
    });

    it("classifies any other 4xx as a provider error", async () => {
      stub({ message: "Bad model", statusCode: 400 }, { status: 400 });
      const out = await getprospectProvider.matchPerson(PERSON, API_KEY, SIGNAL);
      expect(out.kind).toBe("provider_error");
    });
  });

  describe("matchOrganization", () => {
    it("searches by domain and normalises the first company", async () => {
      const mock = stub(company);
      const out = await getprospectProvider.matchOrganization(
        { domain: "sprinx.com" },
        API_KEY,
        SIGNAL,
      );
      const { url, init } = lastCall(mock);
      expect(url).toContain("https://api.getprospect.com/public/v1/insights/companies");
      expect(init.method).toBe("POST");
      expect(bodyOf(init)).toEqual({ domain: { included: ["sprinx.com"] } });
      expect(headerOf(init, "X-API-Key")).toBe(API_KEY);
      expect(init.signal).toBe(SIGNAL);
      expect(out.kind).toBe("ok");
      expect(out.candidate?.sourceId).toBe("c-1");
      expect(out.candidate?.fields).toEqual({
        "org.name": "Sprinx Systems",
        "org.domain": "sprinx.com",
        "org.description": "Custom software development for enterprise clients.",
        "org.industry": "Computer Software",
        "org.employeeCount": 120,
        "org.postalCode": "11000",
        "org.city": "Prague",
        "org.state": "Praha",
        "org.country": "CZ",
      });
    });

    it("falls back to a name filter when there is no domain", async () => {
      const mock = stub(company);
      await getprospectProvider.matchOrganization({ name: "Sprinx Systems" }, API_KEY, SIGNAL);
      expect(bodyOf(lastCall(mock).init)).toEqual({ name: { included: ["Sprinx Systems"] } });
    });

    it("drops the phone payload and emits only canonical keys", async () => {
      stub(company);
      const out = await getprospectProvider.matchOrganization(
        { domain: "sprinx.com" },
        API_KEY,
        SIGNAL,
      );
      expect(JSON.stringify(out.candidate?.fields ?? {})).not.toContain("+420");
      for (const key of Object.keys(out.candidate?.fields ?? {}))
        expect(isCanonicalKey(key)).toBe(true);
    });

    it("reports no match on an empty result page", async () => {
      stub(companyEmpty);
      const out = await getprospectProvider.matchOrganization(
        { domain: "nowhere.example" },
        API_KEY,
        SIGNAL,
      );
      expect(out.kind).toBe("no_match");
    });

    it("short circuits without a call when there is neither a domain nor a name", async () => {
      const mock = stub(company);
      const out = await getprospectProvider.matchOrganization(
        { linkedinUrl: "https://www.linkedin.com/company/sprinx-systems" },
        API_KEY,
        SIGNAL,
      );
      expect(out.kind).toBe("no_match");
      expect(out.message ?? "").toContain("domain");
      expect(mock).not.toHaveBeenCalled();
    });
  });
});
