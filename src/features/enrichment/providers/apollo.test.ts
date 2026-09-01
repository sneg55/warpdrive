import { afterEach, describe, expect, it, vi } from "vitest";
import { isCanonicalKey } from "../canonical";
import orgMatch from "./__fixtures__/apollo-org-match.json";
import personMatch from "./__fixtures__/apollo-person-match.json";
import personMiss from "./__fixtures__/apollo-person-miss.json";
import { selfThrottleUntil } from "./apolloHeaders";
import {
  API_KEY,
  body,
  freeze,
  MISS,
  NOW,
  org,
  person,
  stubFetch,
  stubReject,
} from "./apolloTestKit";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("matchPerson normalisation", () => {
  it("maps a matched person onto canonical keys", async () => {
    stubFetch(body(personMatch));
    const out = await person();
    expect(out).toMatchObject({ kind: "ok", provider: "apollo" });
    expect(out.candidate?.sourceId).toBe("5f1234567890abcdef123456");
    expect(out.candidate?.fields).toEqual({
      "person.firstName": "Tim",
      "person.lastName": "Zheng",
      "person.fullName": "Tim Zheng",
      "person.email": "tim@apollo.io",
      "person.title": "Founder & CEO",
      "person.seniority": "founder",
      "person.department": "c_suite",
      "person.linkedinUrl": "http://www.linkedin.com/in/tim-zheng",
      "person.twitterHandle": "tim_zheng",
      "person.githubUrl": "https://github.com/timzheng",
      "person.photoUrl": "https://media.apollo.io/photo.jpg",
      "person.city": "San Francisco",
      "person.state": "California",
      "person.country": "United States",
      "person.companyName": "Apollo.io",
      "person.companyDomain": "apollo.io",
    });
    expect(Object.keys(out.candidate?.fields ?? {}).every(isCanonicalKey)).toBe(true);
  });

  it("drops every phone payload Apollo volunteers", async () => {
    stubFetch(body(personMatch));
    const serialised = JSON.stringify(await person());
    expect(serialised).not.toContain("5550100");
    expect(serialised).not.toContain("phone");
  });

  it("extracts a twitter handle from the profile URL and strips a leading @", async () => {
    const cases: [string, string | undefined][] = [
      ["https://twitter.com/@tim_zheng?lang=en", "tim_zheng"],
      ["https://x.com/MeetApollo/", "MeetApollo"],
      ["@bare_handle", "bare_handle"],
      ["https://twitter.com/", undefined],
      ["   ", undefined],
    ];
    for (const [twitterUrl, expected] of cases) {
      stubFetch(body({ person: { name: "Someone", twitter_url: twitterUrl } }));
      const out = await person({ fullName: "Someone" });
      expect(out.candidate?.fields["person.twitterHandle"]).toBe(expected);
      vi.unstubAllGlobals();
    }
  });

  it("falls back to the organization website when there is no primary domain", async () => {
    const organization = { website_url: "https://www.example.co.uk/jobs" };
    stubFetch(body({ person: { name: "Someone", organization } }));
    const out = await person({ fullName: "Someone" });
    expect(out.candidate?.fields["person.companyDomain"]).toBe("example.co.uk");
  });

  it("returns no_match for a null person, a missing key, or one with nothing usable", async () => {
    for (const payload of [personMiss, {}, { person: { first_name: "  ", email: "" } }]) {
      stubFetch(body(payload));
      expect(await person()).toEqual(MISS);
      vi.unstubAllGlobals();
    }
  });
});

describe("matchOrganization", () => {
  it("maps a matched organization onto canonical keys", async () => {
    stubFetch(body(orgMatch));
    const out = await org();
    expect(out.kind).toBe("ok");
    expect(JSON.stringify(out)).not.toContain("5550199");
    expect(out.candidate?.sourceId).toBe("5e66b6381e05b4008c8331b8");
    expect(out.candidate?.fields).toEqual({
      "org.name": "Apollo.io",
      "org.domain": "apollo.io",
      "org.website": "http://www.apollo.io",
      "org.industry": "information technology & services",
      "org.employeeCount": 910,
      "org.annualRevenue": 100000000,
      "org.linkedinUrl": "http://www.linkedin.com/company/apollo-io",
      "org.twitterHandle": "MeetApollo",
      "org.description": "Apollo is a data-first engagement platform for sales teams.",
      "org.foundedYear": 2015,
      "org.street": "535 Mission St",
      "org.city": "San Francisco",
      "org.state": "California",
      "org.postalCode": "94105",
      "org.country": "United States",
    });
  });

  it("returns no_match when no organization comes back", async () => {
    stubFetch(body({ organization: null }));
    expect(await org()).toEqual(MISS);
  });
});

describe("failure classification", () => {
  it("reports a rejected key as auth, leaking neither the key nor the body", async () => {
    stubFetch(body(`{"error":"bad key ${API_KEY}"}`, 401));
    const out = await person();
    expect(out).toMatchObject({ provider: "apollo", kind: "auth" });
    expect(out.candidate).toBeUndefined();
    const serialised = JSON.stringify(out);
    expect(serialised).not.toContain(API_KEY);
    expect(serialised).not.toContain("x-api-key");
    expect(serialised).not.toContain("bad key");
  });

  it("reports 429 as throttled and carries retry-after through", async () => {
    freeze();
    stubFetch(body({ error: "rate limited" }, 429, { "retry-after": "90" }));
    const out = await person();
    expect(out.kind).toBe("throttled");
    expect(out.retryAfterIso).toBe("2026-08-24T12:01:30.000Z");
  });

  it("falls back to a cooldown when 429 carries no retry-after", async () => {
    freeze();
    stubFetch(body({ error: "rate limited" }, 429));
    const out = await org();
    expect(out.kind).toBe("throttled");
    expect(out.retryAfterIso).toBe("2026-08-24T12:15:00.000Z");
  });

  it("reports an unparseable 2xx body as a provider error", async () => {
    stubFetch(body("<html>gateway</html>"));
    expect(await person()).toMatchObject({ kind: "provider_error" });
    vi.unstubAllGlobals();
    stubFetch(body("[1,2,3]"));
    expect((await org()).kind).toBe("provider_error");
  });

  it("reports a network failure as a provider error and a timeout as timeout", async () => {
    stubReject("TypeError");
    expect(await person()).toMatchObject({ provider: "apollo", kind: "provider_error" });
    vi.unstubAllGlobals();
    stubReject("TimeoutError");
    expect((await person()).kind).toBe("timeout");
  });

  it("lets an abort propagate instead of turning it into an outcome", async () => {
    stubReject("AbortError");
    await expect(person()).rejects.toThrow("boom");
  });
});

describe("self-throttling", () => {
  it("cools down for an hour on a spent hourly allowance and a day on a spent daily one", () => {
    const hourly = new Headers({ "x-hourly-requests-left": "0", "x-minute-requests-left": "40" });
    expect(selfThrottleUntil(hourly, NOW)).toBe("2026-08-24T13:00:00.000Z");
    const daily = new Headers({ "x-24-hour-requests-left": "0", "x-hourly-requests-left": "0" });
    expect(selfThrottleUntil(daily, NOW)).toBe("2026-08-25T12:00:00.000Z");
  });

  it("stays quiet on remaining allowance, missing headers, junk, or the minute window", () => {
    expect(selfThrottleUntil(new Headers({ "x-hourly-requests-left": "12" }), NOW)).toBeUndefined();
    expect(selfThrottleUntil(new Headers(), NOW)).toBeUndefined();
    expect(selfThrottleUntil(new Headers({ "x-hourly-requests-left": "?" }), NOW)).toBeUndefined();
    expect(selfThrottleUntil(new Headers({ "x-minute-requests-left": "0" }), NOW)).toBeUndefined();
  });

  it("still returns the match but records a cooldown when the allowance is spent", async () => {
    freeze();
    stubFetch(body(personMatch, 200, { "x-hourly-requests-left": "0" }));
    const out = await person();
    expect(out.kind).toBe("ok");
    expect(out.candidate?.fields["person.email"]).toBe("tim@apollo.io");
    expect(out.retryAfterIso).toBe("2026-08-24T13:00:00.000Z");
  });

  it("sets no cooldown while allowance remains", async () => {
    stubFetch(body(orgMatch, 200, { "x-hourly-requests-left": "97" }));
    expect((await org()).retryAfterIso).toBeUndefined();
  });

  it("records a cooldown on a miss too, since the call still counted", async () => {
    freeze();
    stubFetch(body(personMiss, 200, { "x-24-hour-requests-left": "0" }));
    const out = await person();
    expect(out.kind).toBe("no_match");
    expect(out.retryAfterIso).toBe("2026-08-25T12:00:00.000Z");
  });
});
