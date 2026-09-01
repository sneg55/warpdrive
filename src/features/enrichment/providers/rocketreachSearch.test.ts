import { afterEach, describe, expect, it, vi } from "vitest";
import searchPage from "./__fixtures__/rocketreach-search.json";
import { matchPerson, rocketreachProvider } from "./rocketreach";
import { searchPeople, startForPage, toProspectProfile } from "./rocketreachSearch";
import {
  API_KEY,
  body,
  initOf,
  opts,
  resumesInMs,
  signal,
  stubFetch,
  urlOf,
} from "./rocketreachTestKit";

afterEach(() => {
  vi.unstubAllGlobals();
});

const INPUT = {
  companyDomain: "analyticalengines.com",
  titles: ["VP of Engineering"],
  seniorities: ["owner", "founder", "vp"],
  page: 1,
  perPage: 10,
};

function sentBody(spy: ReturnType<typeof stubFetch>): Record<string, unknown> {
  const raw = initOf(spy).body;
  return JSON.parse(typeof raw === "string" ? raw : "null") as Record<string, unknown>;
}

describe("rocketreach prospect profile", () => {
  it("never carries a teaser email or phone", () => {
    const profile = toProspectProfile(searchPage.profiles[0]);
    expect(profile).toBeDefined();
    expect(JSON.stringify(profile)).not.toContain("@");
    expect(JSON.stringify(profile)).not.toContain("442079460958");
    expect(JSON.stringify(profile)).not.toContain("442079460959");
  });

  it("reports hasEmail and hasPhone from the teaser", () => {
    const profile = toProspectProfile(searchPage.profiles[0]);
    expect(profile?.hasEmail).toBe(true);
    expect(profile?.hasPhone).toBe(true);
  });

  it("reports both false when the teaser holds nothing", () => {
    const profile = toProspectProfile(searchPage.profiles[1]);
    expect(profile?.hasEmail).toBe(false);
    expect(profile?.hasPhone).toBe(false);
  });

  it("keeps the identity fields the review step shows", () => {
    const profile = toProspectProfile(searchPage.profiles[0]);
    expect(profile).toMatchObject({
      providerRef: "8214691",
      fullName: "Ada Lovelace",
      title: "VP of Engineering",
      linkedinUrl: "https://www.linkedin.com/in/adalovelace",
      city: "London",
      country: "United Kingdom",
    });
  });

  it("falls back to the country code when the country name is absent", () => {
    expect(toProspectProfile(searchPage.profiles[1])?.country).toBe("GB");
  });

  it("drops a profile with no id, since it could never be revealed", () => {
    expect(toProspectProfile(searchPage.profiles[2])).toBeUndefined();
  });

  it("drops a profile with no name", () => {
    expect(toProspectProfile({ id: 12 })).toBeUndefined();
  });
});

describe("start based paging", () => {
  it("maps the first page to the first result", () => {
    expect(startForPage(1, 25)).toBe(1);
  });

  it("maps page 3 to a start offset", () => {
    expect(startForPage(3, 25)).toBe(51);
  });
});

describe("rocketreach people search", () => {
  it("is wired onto the provider", () => {
    expect(typeof rocketreachProvider.searchPeople).toBe("function");
  });

  it("posts the domain, titles and mapped management levels with the key in a header", async () => {
    const spy = stubFetch(body(searchPage));
    const caller = new AbortController();
    await searchPeople(INPUT, API_KEY, caller.signal);
    expect(urlOf(spy)).toBe("https://api.rocketreach.co/api/v2/person/search");
    expect(new Headers(initOf(spy).headers).get("Api-Key")).toBe(API_KEY);
    expect(sentBody(spy)).toEqual({
      query: {
        company_domain: ["analyticalengines.com"],
        current_title: ["VP of Engineering"],
        management_levels: ["cxo", "vp"],
      },
      start: 1,
      page_size: 10,
    });
    const sent = initOf(spy).signal;
    expect(sent?.aborted).toBe(false);
    caller.abort();
    expect(sent?.aborted).toBe(true);
  });

  it("omits the filters the caller left empty", async () => {
    const spy = stubFetch(body(searchPage));
    await searchPeople({ ...INPUT, titles: [], seniorities: [] }, API_KEY, signal());
    expect(sentBody(spy).query).toEqual({ company_domain: ["analyticalengines.com"] });
  });

  it("asks for the requested page as a start offset", async () => {
    const spy = stubFetch(body(searchPage));
    await searchPeople({ ...INPUT, page: 3, perPage: 25 }, API_KEY, signal());
    expect(sentBody(spy)).toMatchObject({ start: 51, page_size: 25 });
  });

  it("returns the profiles and reports more pages from the pagination", async () => {
    stubFetch(body(searchPage));
    const out = await searchPeople(INPUT, API_KEY, signal());
    expect(out.kind).toBe("ok");
    expect(out.profiles.map((p) => p.providerRef)).toEqual(["8214691", "8214692"]);
    expect(out.hasMore).toBe(true);
  });

  it("reports no more pages once next passes the total", async () => {
    stubFetch(body({ ...searchPage, pagination: { start: 41, next: 51, total: 42 } }));
    const out = await searchPeople(INPUT, API_KEY, signal());
    expect(out.hasMore).toBe(false);
  });

  it("returns no_match when the search found nobody", async () => {
    stubFetch(body({ pagination: { start: 1, next: 1, total: 0 }, profiles: [] }));
    const out = await searchPeople(INPUT, API_KEY, signal());
    expect(out.kind).toBe("no_match");
    expect(out.profiles).toEqual([]);
    expect(out.hasMore).toBe(false);
  });

  it("maps a rejected key to auth", async () => {
    stubFetch(body({ message: "Invalid API Key" }, 401));
    const out = await searchPeople(INPUT, API_KEY, signal());
    expect(out.kind).toBe("auth");
    expect(out.profiles).toEqual([]);
    expect(out.hasMore).toBe(false);
  });

  it("maps a rate limit to throttled with a resume time", async () => {
    stubFetch(body({ message: "Too Many Requests" }, 429, { "retry-after": "120" }));
    const out = await searchPeople(INPUT, API_KEY, signal());
    expect(out.kind).toBe("throttled");
    expect(resumesInMs(out)).toBeGreaterThan(60_000);
  });

  it("maps a body that is not json to provider_error", async () => {
    stubFetch(body("<html>maintenance</html>"));
    const out = await searchPeople(INPUT, API_KEY, signal());
    expect(out.kind).toBe("provider_error");
    expect(out.profiles).toEqual([]);
  });

  it("maps an envelope with no profiles list to provider_error", async () => {
    stubFetch(body({ pagination: { start: 1, next: 11, total: 42 } }));
    const out = await searchPeople(INPUT, API_KEY, signal());
    expect(out.kind).toBe("provider_error");
  });
});

describe("reveal by provider ref", () => {
  it("looks a searched profile up by its rocketreach id", async () => {
    const spy = stubFetch(body({ id: 8214691, status: "complete", name: "Ada Lovelace" }));
    await matchPerson({ providerRef: "8214691" }, API_KEY, signal(), opts());
    expect(urlOf(spy)).toContain("/person/lookup");
    expect(urlOf(spy)).toContain("id=8214691");
  });
});
