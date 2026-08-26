import { afterEach, describe, expect, it, vi } from "vitest";
import { isCanonicalKey } from "../canonical";
import company from "./__fixtures__/rocketreach-company.json";
import personComplete from "./__fixtures__/rocketreach-person-complete.json";
import personSearching from "./__fixtures__/rocketreach-person-searching.json";
import {
  matchOrganization,
  matchPerson,
  ROCKETREACH_POLL_BUDGET_MS,
  rocketreachProvider,
} from "./rocketreach";
import {
  API_KEY,
  body,
  fields,
  initOf,
  LOOKUP,
  opts,
  resumesInMs,
  signal,
  stubFetch,
  urlOf,
} from "./rocketreachTestKit";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("matchPerson request", () => {
  it("is registered under the rocketreach id with a 15 second default budget", () => {
    expect(rocketreachProvider.id).toBe("rocketreach");
    expect(ROCKETREACH_POLL_BUDGET_MS).toBe(15_000);
  });

  it("calls person/lookup with the key in a header, the signal, and cached emails on", async () => {
    const spy = stubFetch(body(personComplete));
    const caller = new AbortController();
    await matchPerson(LOOKUP, API_KEY, caller.signal, opts());
    expect(urlOf(spy)).toContain("https://api.rocketreach.co/api/v2/person/lookup");
    expect(urlOf(spy)).toContain("return_cached_emails=true");
    expect(new Headers(initOf(spy).headers).get("Api-Key")).toBe(API_KEY);
    // The request carries its own deadline, so what matters is that it still follows the caller.
    const sent = initOf(spy).signal;
    expect(sent?.aborted).toBe(false);
    caller.abort();
    expect(sent?.aborted).toBe(true);
  });

  it("sends name with current_employer and the linkedin url", async () => {
    const spy = stubFetch(body(personComplete));
    const input = { firstName: "Ada", lastName: "Lovelace", companyName: "Analytical Engines" };
    await matchPerson(
      { ...input, linkedinUrl: "https://lnkd.test/in/ada" },
      API_KEY,
      signal(),
      opts(),
    );
    expect(urlOf(spy)).toContain("name=Ada+Lovelace");
    expect(urlOf(spy)).toContain("current_employer=Analytical+Engines");
    expect(urlOf(spy)).toContain("linkedin_url=https%3A%2F%2Flnkd.test%2Fin%2Fada");
  });

  it("reports unsupported without spending a call when there is no usable identifier", async () => {
    const spy = stubFetch();
    const out = await matchPerson({ companyName: "Analytical Engines" }, API_KEY, signal(), opts());
    expect(out.kind).toBe("unsupported");
    expect(spy).not.toHaveBeenCalled();
  });

  // There is no domain parameter here, so a name with only a company domain beside it would go out
  // as a bare name and can come back as a different person entirely.
  it("declines a name it cannot disambiguate, rather than paying for an ambiguous lookup", async () => {
    const spy = stubFetch();
    const out = await matchPerson(
      { fullName: "Ada Lovelace", companyDomain: "analyticalengines.test" },
      API_KEY,
      signal(),
      opts(),
    );
    expect(out.kind).toBe("unsupported");
    expect(spy).not.toHaveBeenCalled();
  });

  it("uses a name once an employer can disambiguate it", async () => {
    const spy = stubFetch();
    await matchPerson(
      { fullName: "Ada Lovelace", companyName: "Analytical Engines" },
      API_KEY,
      signal(),
      opts(),
    );
    expect(urlOf(spy)).toContain("current_employer=Analytical+Engines");
  });
});

describe("matchPerson normalisation", () => {
  it("returns a candidate from an immediately complete response", async () => {
    const spy = stubFetch(body(personComplete));
    const out = await matchPerson(LOOKUP, API_KEY, signal(), opts());
    expect(out.kind).toBe("ok");
    expect(spy).toHaveBeenCalledTimes(1);
    expect(fields(out)).toEqual({
      "person.fullName": "Ada Lovelace",
      "person.title": "VP of Engineering",
      "person.companyName": "Analytical Engines",
      "person.linkedinUrl": "https://www.linkedin.com/in/adalovelace",
      "person.twitterHandle": "ada_l",
      "person.githubUrl": "https://github.com/adalovelace",
      "person.photoUrl": "https://images.rocketreach.co/ada.jpg",
      "person.city": "London",
      "person.state": "England",
      "person.country": "United Kingdom",
      "person.email": "ada@analyticalengines.com",
    });
    expect(out.candidate?.sourceId).toBe("8214691");
    expect(Object.keys(fields(out)).every(isCanonicalKey)).toBe(true);
  });

  it("drops the phone payload entirely", async () => {
    stubFetch(body(personComplete));
    const out = await matchPerson(LOOKUP, API_KEY, signal(), opts());
    const values = Object.values(fields(out)).map(String);
    expect(values.some((v) => v.includes("7946"))).toBe(false);
    expect(Object.keys(fields(out)).some((k) => k.includes("hone"))).toBe(false);
  });

  it("reduces a twitter url or an @handle to the bare handle", async () => {
    const handleFor = async (twitter: string): Promise<string | number | undefined> => {
      vi.unstubAllGlobals();
      stubFetch(body({ ...personComplete, twitter }));
      return fields(await matchPerson(LOOKUP, API_KEY, signal(), opts()))["person.twitterHandle"];
    };
    expect(await handleFor("https://twitter.com/ada_l?lang=en")).toBe("ada_l");
    expect(await handleFor("@ada_l")).toBe("ada_l");
  });

  it("reports no_match when a complete response carries nothing", async () => {
    stubFetch(body({ id: 1, status: "complete" }));
    const out = await matchPerson(LOOKUP, API_KEY, signal(), opts());
    expect(out.kind).toBe("no_match");
    expect(out.candidate).toBeUndefined();
  });
});

describe("matchPerson failures and aborts", () => {
  it("classifies 401 as an auth failure without leaking the key", async () => {
    stubFetch(body({ detail: `Invalid API key ${API_KEY}` }, 401));
    const out = await matchPerson(LOOKUP, API_KEY, signal(), opts());
    expect(out.kind).toBe("auth");
    expect(out.message ?? "").not.toContain(API_KEY);
  });

  it("classifies 429, with Retry-After and with the fallback cooldown", async () => {
    stubFetch(body({}, 429, { "retry-after": "42" }), body({}, 429));
    const withHeader = await matchPerson(LOOKUP, API_KEY, signal(), opts());
    expect(withHeader.kind).toBe("throttled");
    expect(resumesInMs(withHeader)).toBeGreaterThan(30_000);
    expect(resumesInMs(withHeader)).toBeLessThan(60_000);
    const without = await matchPerson(LOOKUP, API_KEY, signal(), opts());
    expect(resumesInMs(without)).toBeGreaterThan(14 * 60_000);
    expect(resumesInMs(without)).toBeLessThan(16 * 60_000);
  });

  it("classifies an unreadable body and a network failure as provider errors", async () => {
    stubFetch(body("<html>gateway</html>"));
    expect((await matchPerson(LOOKUP, API_KEY, signal(), opts())).kind).toBe("provider_error");
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.reject(new TypeError("connect ECONNREFUSED"))),
    );
    expect((await matchPerson(LOOKUP, API_KEY, signal(), opts())).kind).toBe("provider_error");
  });

  it("propagates an abort raised before the first call", async () => {
    stubFetch(body(personComplete));
    const controller = new AbortController();
    controller.abort();
    await expect(matchPerson(LOOKUP, API_KEY, controller.signal, opts())).rejects.toThrow();
  });

  it("propagates an abort raised while waiting between polls", async () => {
    stubFetch(body(personSearching), body(personComplete));
    const controller = new AbortController();
    const running = matchPerson(LOOKUP, API_KEY, controller.signal, {
      sleep: () => {
        controller.abort();
        return Promise.resolve();
      },
      now: () => 0,
    });
    await expect(running).rejects.toThrow();
  });
});

describe("matchOrganization", () => {
  it("calls company/lookup by domain and normalises the payload", async () => {
    const spy = stubFetch(body(company));
    const caller = new AbortController();
    const out = await matchOrganization(
      { domain: "analyticalengines.com" },
      API_KEY,
      caller.signal,
    );
    expect(urlOf(spy)).toBe(
      "https://api.rocketreach.co/api/v2/company/lookup?domain=analyticalengines.com",
    );
    const sent = initOf(spy).signal;
    caller.abort();
    expect(sent?.aborted).toBe(true);
    expect(fields(out)).toEqual({
      "org.name": "Analytical Engines",
      "org.domain": "analyticalengines.com",
      "org.industry": "Computer Software",
      "org.employeeCount": 240,
      "org.annualRevenue": 12000000,
      "org.linkedinUrl": "https://www.linkedin.com/company/analytical-engines",
      "org.description": "Builds difference and analytical engines.",
      "org.foundedYear": 1837,
      "org.city": "London",
      "org.state": "England",
      "org.country": "United Kingdom",
    });
    expect(Object.keys(fields(out)).every(isCanonicalKey)).toBe(true);
  });

  it("falls back to the name, declines with neither, and reports no_match when empty", async () => {
    const spy = stubFetch(body(company), body({}));
    await matchOrganization({ name: "Analytical Engines" }, API_KEY, signal());
    expect(urlOf(spy)).toContain("name=Analytical+Engines");
    const empty = await matchOrganization({ domain: "nowhere.example" }, API_KEY, signal());
    expect(empty.kind).toBe("no_match");
    const declined = await matchOrganization({ linkedinUrl: "https://x.test" }, API_KEY, signal());
    expect(declined.kind).toBe("unsupported");
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("classifies 401 as an auth failure", async () => {
    stubFetch(body("forbidden", 401));
    const out = await matchOrganization({ domain: "nowhere.example" }, API_KEY, signal());
    expect(out.kind).toBe("auth");
  });
});
