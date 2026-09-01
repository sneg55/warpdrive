import { afterEach, describe, expect, it, vi } from "vitest";
import searchPage from "./__fixtures__/apollo-search.json";
import { apolloProvider } from "./apollo";
import { searchPeople, toProspectProfile } from "./apolloSearch";
import { API_KEY, body, callOf, endpointOf, freeze, NOW, signal, stubFetch } from "./apolloTestKit";
import type { PeopleSearchInput } from "./types";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const INPUT: PeopleSearchInput = { companyDomain: "apollo.io", page: 1, perPage: 25 };

function run(overrides: Partial<PeopleSearchInput> = {}): ReturnType<typeof searchPeople> {
  return searchPeople({ ...INPUT, ...overrides }, API_KEY, signal());
}

function sentBody(spy: ReturnType<typeof stubFetch>): unknown {
  return JSON.parse(callOf(spy).init.body as string);
}

const LAST_PAGE = { total_entries: 68, people: [] };

describe("apollo prospect profile", () => {
  it("never carries a contact value, masked or otherwise", () => {
    const profile = toProspectProfile({
      id: "abc",
      first_name: "Ada",
      last_name_obfuscated: "Lovelace",
      title: "CTO",
      has_email: true,
      email: "email_not_unlocked@domain.com",
    });
    expect(profile).toBeDefined();
    expect(JSON.stringify(profile)).not.toContain("email_not_unlocked");
    expect(JSON.stringify(profile)).not.toContain("@");
  });

  it("keeps the obfuscated surname api_search returns instead of a real one", () => {
    expect(
      toProspectProfile({ id: "a", first_name: "Manish", last_name_obfuscated: "Ma***i" })
        ?.fullName,
    ).toBe("Manish Ma***i");
  });

  it("reports hasEmail from the has_email flag", () => {
    expect(toProspectProfile({ id: "a", first_name: "A", has_email: true })?.hasEmail).toBe(true);
  });

  it("reports hasEmail false when the provider has nothing", () => {
    expect(toProspectProfile({ id: "a", first_name: "A", has_email: false })?.hasEmail).toBe(false);
  });

  it("reports hasPhone from the has_direct_phone flag, which arrives as a string", () => {
    const profile = toProspectProfile({
      id: "a",
      first_name: "A",
      has_direct_phone: "Yes",
    });
    expect(profile?.hasPhone).toBe(true);
    expect(toProspectProfile({ id: "a", first_name: "A", has_direct_phone: "No" })?.hasPhone).toBe(
      false,
    );
  });

  it("drops a person with no provider id, since it could never be revealed", () => {
    expect(toProspectProfile({ first_name: "A" })).toBeUndefined();
  });

  it("drops a person with no name at all", () => {
    expect(toProspectProfile({ id: "a" })).toBeUndefined();
  });
});

describe("apollo searchPeople request", () => {
  it("posts the domain, filters and paging to mixed_people/api_search", async () => {
    const spy = stubFetch(body(searchPage));
    const s = signal();
    await searchPeople(
      { ...INPUT, titles: ["cto", "vp engineering"], seniorities: ["c_suite"], page: 2 },
      API_KEY,
      s,
    );
    const { init } = callOf(spy);
    expect(endpointOf(spy)).toBe("https://api.apollo.io/api/v1/mixed_people/api_search");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["x-api-key"]).toBe(API_KEY);
    expect((init.headers as Record<string, string>)["content-type"]).toBe("application/json");
    expect(init.signal).toBe(s);
    expect(sentBody(spy)).toEqual({
      q_organization_domains_list: ["apollo.io"],
      person_titles: ["cto", "vp engineering"],
      person_seniorities: ["c_suite"],
      page: 2,
      per_page: 25,
    });
  });

  it("omits the filters the caller left empty", async () => {
    const spy = stubFetch(body(searchPage));
    await run({ titles: [], seniorities: undefined });
    expect(sentBody(spy)).toEqual({
      q_organization_domains_list: ["apollo.io"],
      page: 1,
      per_page: 25,
    });
  });
});

describe("apollo searchPeople outcomes", () => {
  it("returns the profiles and hasMore from the total the page reports", async () => {
    stubFetch(body(searchPage));
    const out = await run();
    expect(out.kind).toBe("ok");
    expect(out.hasMore).toBe(true);
    expect(out.profiles).toHaveLength(2);
    expect(out.profiles[0]).toEqual({
      providerRef: "62a1b3c4d5e6f70011223344",
      fullName: "Ada Lovelace",
      firstName: "Ada",
      lastName: "Lovelace",
      title: "Chief Technology Officer",
      hasEmail: true,
      hasPhone: true,
    });
    const serialised = JSON.stringify(out);
    expect(serialised).not.toContain("@");
  });

  it("reports hasMore false once the page covers the total", async () => {
    stubFetch(body(searchPage));
    expect(await run({ page: 3 })).toMatchObject({ kind: "ok", hasMore: false });
  });

  it("reports hasMore false on an empty last page", async () => {
    stubFetch(body(LAST_PAGE));
    expect(await run({ page: 3 })).toMatchObject({ kind: "no_match", hasMore: false });
  });

  it("maps the legacy endpoint deprecation notice to provider_error", async () => {
    stubFetch(body({ error: "This endpoint is deprecated for API callers." }, 422));
    const out = await run();
    expect(out.kind).toBe("provider_error");
    expect(out.message).toBe("Provider returned 422");
  });

  it("maps a 403 API_INACCESSIBLE to not_entitled with no profiles", async () => {
    stubFetch(body({ error_code: "API_INACCESSIBLE" }, 403));
    const out = await run();
    expect(out.kind).toBe("not_entitled");
    expect(out.profiles).toEqual([]);
    expect(out.hasMore).toBe(false);
  });

  it("maps a 429 to throttled with a retry deadline", async () => {
    freeze();
    stubFetch(body({}, 429, { "retry-after": "60" }));
    const out = await run();
    expect(out.kind).toBe("throttled");
    expect(out.retryAfterIso).toBe(new Date(NOW.getTime() + 60_000).toISOString());
    expect(out.profiles).toEqual([]);
  });

  it("maps an unreadable body to provider_error", async () => {
    stubFetch(body("<html>not json</html>"));
    const out = await run();
    expect(out.kind).toBe("provider_error");
    expect(out.profiles).toEqual([]);
    expect(out.hasMore).toBe(false);
  });

  it("cools down on a spent daily allowance even though the search itself succeeded", async () => {
    freeze();
    stubFetch(body(searchPage, 200, { "x-24-hour-requests-left": "0" }));
    const out = await run();
    expect(out.kind).toBe("ok");
    expect(out.retryAfterIso).toBe(new Date(NOW.getTime() + 24 * 60 * 60 * 1000).toISOString());
  });

  it("reports the remaining allowance the account has left", async () => {
    stubFetch(
      body(searchPage, 200, { "x-hourly-requests-left": "42", "x-24-hour-requests-left": "180" }),
    );
    const out = await run();
    expect(out.quotaRemaining).toEqual({ hourly: 42, daily: 180 });
  });

  it("is wired onto the apollo provider", async () => {
    stubFetch(body(searchPage));
    const out = await apolloProvider.searchPeople?.(INPUT, API_KEY, signal());
    expect(out?.profiles).toHaveLength(2);
  });
});
