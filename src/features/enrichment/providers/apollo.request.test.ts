// Apollo's wire contract. Both endpoints read their inputs from the query string, so a lookup
// sent anywhere else reaches Apollo as a call with nothing to match on and comes back empty.
import { afterEach, describe, expect, it, vi } from "vitest";
import orgMatch from "./__fixtures__/apollo-org-match.json";
import personMatch from "./__fixtures__/apollo-person-match.json";
import { apolloProvider } from "./apollo";
import {
  API_KEY,
  body,
  callOf,
  endpointOf,
  person,
  sentQuery,
  signal,
  stubFetch,
} from "./apolloTestKit";

afterEach(() => {
  vi.unstubAllGlobals();
});

const FULL_LOOKUP = {
  email: "tim@apollo.io",
  linkedinUrl: "https://linkedin.com/in/tim-zheng",
  fullName: "Tim Zheng",
  firstName: "Tim",
  lastName: "Zheng",
  companyName: "Apollo.io",
  companyDomain: "apollo.io",
};

describe("matchPerson request", () => {
  it("posts to people/match with the lookup in the query string, not the body", async () => {
    const spy = stubFetch(body(personMatch));
    const s = signal();
    await apolloProvider.matchPerson(FULL_LOOKUP, API_KEY, s);
    const { init } = callOf(spy);
    expect(endpointOf(spy)).toBe("https://api.apollo.io/api/v1/people/match");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["x-api-key"]).toBe(API_KEY);
    expect(init.signal).toBe(s);
    expect(sentQuery(spy)).toEqual({
      reveal_personal_emails: "true",
      email: "tim@apollo.io",
      linkedin_url: "https://linkedin.com/in/tim-zheng",
      name: "Tim Zheng",
      first_name: "Tim",
      last_name: "Zheng",
      organization_name: "Apollo.io",
      domain: "apollo.io",
    });
  });

  it("sends the profile id Apollo's own search returned, which outranks the name", async () => {
    const spy = stubFetch(body(personMatch));
    await apolloProvider.matchPerson(
      { ...FULL_LOOKUP, providerRef: "67a1d66a7a510b000111acdb" },
      API_KEY,
      signal(),
    );
    expect(sentQuery(spy)).toMatchObject({ id: "67a1d66a7a510b000111acdb" });
  });

  // api_search obfuscates surnames, so a name-only match returns a different person with the
  // masked string baked into their name. The id is the only thing that identifies the row picked.
  it("still sends the id when the surname it carries is obfuscated", async () => {
    const spy = stubFetch(body(personMatch));
    await apolloProvider.matchPerson(
      {
        firstName: "Manish",
        lastName: "Ma***i",
        fullName: "Manish Ma***i",
        companyDomain: "stripe.com",
        providerRef: "67a1d66a7a510b000111acdb",
      },
      API_KEY,
      signal(),
    );
    expect(sentQuery(spy)).toMatchObject({
      id: "67a1d66a7a510b000111acdb",
      last_name: "Ma***i",
    });
  });

  // A body would be ignored, and carrying one hides which half of the request Apollo actually read.
  it("sends no request body at all", async () => {
    const spy = stubFetch(body(personMatch));
    await apolloProvider.matchPerson(FULL_LOOKUP, API_KEY, signal());
    expect(callOf(spy).init.body).toBeUndefined();
  });

  it("never asks Apollo to reveal a phone number, and omits blank lookup values", async () => {
    const spy = stubFetch(body(personMatch));
    await person({ email: "tim@apollo.io", fullName: "   " });
    expect(sentQuery(spy)).toEqual({ reveal_personal_emails: "true", email: "tim@apollo.io" });
  });
});

describe("matchOrganization request", () => {
  it("gets organizations/enrich with the lookup as query parameters", async () => {
    const spy = stubFetch(body(orgMatch));
    const s = signal();
    const linkedinUrl = "https://linkedin.com/company/apollo-io";
    await apolloProvider.matchOrganization(
      { domain: "apollo.io", linkedinUrl, name: "Apollo" },
      API_KEY,
      s,
    );
    const { init } = callOf(spy);
    expect(endpointOf(spy)).toBe("https://api.apollo.io/api/v1/organizations/enrich");
    expect(sentQuery(spy)).toEqual({
      domain: "apollo.io",
      linkedin_url: linkedinUrl,
      name: "Apollo",
    });
    expect(init.method).toBe("GET");
    expect((init.headers as Record<string, string>)["x-api-key"]).toBe(API_KEY);
    expect(init.signal).toBe(s);
  });
});
