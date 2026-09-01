import { afterEach, describe, expect, it, vi } from "vitest";
import searchPage from "./__fixtures__/getprospect-search.json";
import { getprospectProvider } from "./getprospect";
import { searchPeople, toProspectProfile } from "./getprospectSearch";
import type { PeopleSearchInput } from "./types";

const API_KEY = "gp-secret-key-value";
const SIGNAL = new AbortController().signal;
const INPUT: PeopleSearchInput = { companyDomain: "acme.com", page: 1, perPage: 25 };

const realFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = realFetch;
  vi.restoreAllMocks();
});

function stub(body: unknown, status = 200): ReturnType<typeof vi.fn> {
  const text = typeof body === "string" ? body : JSON.stringify(body);
  const mock = vi.fn(() =>
    Promise.resolve(
      new Response(text, { status, headers: { "content-type": "application/json" } }),
    ),
  );
  globalThis.fetch = mock;
  return mock;
}

function lastCall(mock: ReturnType<typeof vi.fn>): { url: string; init: RequestInit } {
  const call = mock.mock.calls.at(-1) as unknown as [string, RequestInit] | undefined;
  if (call === undefined) throw new Error("fetch was not called");
  return { url: call[0], init: call[1] };
}

function sentBody(mock: ReturnType<typeof vi.fn>): unknown {
  return JSON.parse(lastCall(mock).init.body as string);
}

function run(over: Partial<PeopleSearchInput> = {}): ReturnType<typeof searchPeople> {
  return searchPeople({ ...INPUT, ...over }, API_KEY, SIGNAL);
}

describe("getprospect prospect profile", () => {
  it("never carries the address the search response volunteers", () => {
    const row = searchPage.data[0];
    expect(JSON.stringify(row)).toContain("ada@acme.com");
    const profile = toProspectProfile(row, "acme.com");
    expect(profile).toBeDefined();
    expect(JSON.stringify(profile)).not.toContain("ada@acme.com");
    expect(JSON.stringify(profile)).not.toContain("@");
  });

  it("never carries contactInfo, which is free text the provider fills how it likes", () => {
    const profile = toProspectProfile(searchPage.data[0], "acme.com");
    expect(JSON.stringify(profile)).not.toContain("analytical-engine");
  });

  it("takes the title from the employer that matches the searched domain", () => {
    const profile = toProspectProfile(searchPage.data[1], "acme.com");
    expect(profile?.title).toBe("VP Engineering");
  });

  it("falls back to the first employer when none matches the searched domain", () => {
    const profile = toProspectProfile(searchPage.data[1], "nowhere.example");
    expect(profile?.title).toBe("Consulting Engineer");
  });

  it("builds a profile URL from the common LinkedIn handle, ignoring the sales one", () => {
    expect(toProspectProfile(searchPage.data[0], "acme.com")?.linkedinUrl).toBe(
      "https://www.linkedin.com/in/ada-lovelace",
    );
  });

  it("leaves the LinkedIn URL unset when the row carries no handle", () => {
    expect(toProspectProfile(searchPage.data[2], "acme.com")?.linkedinUrl).toBeUndefined();
  });

  it("reads a city and a country out of a three-part geolocation string", () => {
    const profile = toProspectProfile(searchPage.data[0], "acme.com");
    expect(profile?.city).toBe("London");
    expect(profile?.country).toBe("United Kingdom");
  });

  it("takes only a city from two parts, where the tail may be a region", () => {
    const profile = toProspectProfile(searchPage.data[1], "acme.com");
    expect(profile?.city).toBe("Palo Alto");
    expect(profile?.country).toBeUndefined();
  });

  it("reads a lone geolocation as the country", () => {
    const profile = toProspectProfile(searchPage.data[2], "acme.com");
    expect(profile?.country).toBe("United States");
    expect(profile?.city).toBeUndefined();
  });

  it("promises an email for every row, since the endpoint only holds contacts with one", () => {
    for (const row of searchPage.data.slice(0, 3)) {
      expect(toProspectProfile(row, "acme.com")?.hasEmail).toBe(true);
    }
  });

  it("promises no phone, which this endpoint never returns", () => {
    expect(toProspectProfile(searchPage.data[0], "acme.com")?.hasPhone).toBe(false);
  });

  it("drops a row with no provider id, since it could never be revealed", () => {
    expect(toProspectProfile(searchPage.data[3], "acme.com")).toBeUndefined();
  });

  it("drops a row with no name", () => {
    expect(toProspectProfile({ getProspectId: "a" }, "acme.com")).toBeUndefined();
  });
});

describe("getprospect searchPeople request", () => {
  it("posts the domain filter and paging to the insights contacts endpoint", async () => {
    const mock = stub(searchPage);
    await run({ page: 2 });
    const { url, init } = lastCall(mock);
    expect(url).toBe(
      "https://api.getprospect.com/public/v1/insights/contacts?pageSize=25&pageNumber=2",
    );
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).apiKey).toBe(API_KEY);
    expect((init.headers as Record<string, string>)["X-API-Key"]).toBe(API_KEY);
    expect(init.signal).toBe(SIGNAL);
    expect(sentBody(mock)).toEqual({ domain: { included: ["acme.com"] } });
  });

  it("sends job titles as an included list", async () => {
    const mock = stub(searchPage);
    await run({ titles: ["head of partnerships", "cto"] });
    expect(sentBody(mock)).toEqual({
      domain: { included: ["acme.com"] },
      jobTitle: { included: ["head of partnerships", "cto"] },
    });
  });

  it("translates our seniority vocabulary into the provider's exact casing", async () => {
    const mock = stub(searchPage);
    await run({ seniorities: ["c_suite", "head", "director"] });
    expect(sentBody(mock)).toEqual({
      domain: { included: ["acme.com"] },
      seniority: { included: ["Chief Officer", "Director"] },
    });
  });

  it("omits the seniority filter rather than sending a value the provider would reject", async () => {
    const mock = stub(searchPage);
    await run({ seniorities: ["entry"] });
    expect(sentBody(mock)).toEqual({ domain: { included: ["acme.com"] } });
  });

  it("omits filters the caller left empty", async () => {
    const mock = stub(searchPage);
    await run({ titles: [], seniorities: [] });
    expect(sentBody(mock)).toEqual({ domain: { included: ["acme.com"] } });
  });
});

describe("getprospect searchPeople outcomes", () => {
  it("returns the profiles and hasMore from the page meta", async () => {
    stub(searchPage);
    const out = await run();
    expect(out.kind).toBe("ok");
    expect(out.hasMore).toBe(true);
    expect(out.profiles).toHaveLength(3);
    expect(out.profiles[0]).toEqual({
      providerRef: "5f76c7817c58001e1a115ba6",
      fullName: "Ada Lovelace",
      firstName: "Ada",
      lastName: "Lovelace",
      title: "Chief Technology Officer",
      linkedinUrl: "https://www.linkedin.com/in/ada-lovelace",
      city: "London",
      country: "United Kingdom",
      hasEmail: true,
      hasPhone: false,
    });
    expect(JSON.stringify(out)).not.toContain("@");
  });

  it("reports hasMore false on the last page", async () => {
    stub({ ...searchPage, meta: { ...searchPage.meta, page: 3, totalPages: 3 } });
    expect(await run({ page: 3 })).toMatchObject({ kind: "ok", hasMore: false });
  });

  it("reports no_match on an empty page rather than an outage", async () => {
    stub({ meta: { totalItems: 0, totalPages: 0, pageSize: 25, page: 1 }, data: [] });
    expect(await run()).toMatchObject({ kind: "no_match", profiles: [], hasMore: false });
  });

  it("maps a rejected filter value to provider_error naming the status only", async () => {
    stub({ statusCode: 400, message: "Something went wrong", error: "Bad Request" }, 400);
    const out = await run();
    expect(out.kind).toBe("provider_error");
    expect(out.message).toBe("Provider returned 400");
    expect(out.profiles).toEqual([]);
  });

  it("maps a rejected key to auth", async () => {
    stub({ statusCode: 401, message: "Authentication required" }, 401);
    expect(await run()).toMatchObject({ kind: "auth", profiles: [] });
  });

  it("maps an unreadable body to provider_error", async () => {
    stub("<html>not json</html>");
    expect(await run()).toMatchObject({ kind: "provider_error", profiles: [], hasMore: false });
  });

  it("maps a body with no data array to provider_error", async () => {
    stub({ meta: { page: 1, totalPages: 1 } });
    expect(await run()).toMatchObject({ kind: "provider_error", profiles: [] });
  });

  it("is wired onto the getprospect provider", async () => {
    stub(searchPage);
    const out = await getprospectProvider.searchPeople?.(INPUT, API_KEY, SIGNAL);
    expect(out?.profiles).toHaveLength(3);
  });
});
