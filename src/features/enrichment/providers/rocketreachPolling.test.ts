import { afterEach, describe, expect, it, vi } from "vitest";
import { mergeCandidates } from "../merge";
import personComplete from "./__fixtures__/rocketreach-person-complete.json";
import personNotQueued from "./__fixtures__/rocketreach-person-not-queued.json";
import personPending from "./__fixtures__/rocketreach-person-pending.json";
import personSearching from "./__fixtures__/rocketreach-person-searching.json";
import { matchPerson } from "./rocketreach";
import {
  API_KEY,
  body,
  fields,
  hangingFetch,
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

describe("matchPerson polling", () => {
  it("polls checkStatus with backoff until the status is complete", async () => {
    const spy = stubFetch(body(personSearching), body(personSearching), body(personComplete));
    const o = opts();
    const out = await matchPerson(LOOKUP, API_KEY, signal(), o);
    expect(out.kind).toBe("ok");
    expect(spy).toHaveBeenCalledTimes(3);
    expect(urlOf(spy, 1)).toBe("https://api.rocketreach.co/api/v2/person/checkStatus?id=8214691");
    expect(o.slept).toEqual([500, 1000]);
    expect(fields(out)["person.title"]).toBe("VP of Engineering");
  });

  it("returns the partial candidate it holds at the budget cutoff", async () => {
    const spy = stubFetch();
    const o = opts(3000);
    const out = await matchPerson(LOOKUP, API_KEY, signal(), o);
    expect(out.kind).toBe("ok");
    expect(fields(out)["person.email"]).toBe("ada@analyticalengines.com");
    expect(fields(out)["person.title"]).toBeUndefined();
    expect(o.slept).toEqual([500, 1000]);
    expect(spy).toHaveBeenCalledTimes(3);
  });

  it("returns timeout at the budget cutoff, and stops early with no id to poll on", async () => {
    const spy = stubFetch(body(personPending), body(personPending));
    expect((await matchPerson(LOOKUP, API_KEY, signal(), opts(1000))).kind).toBe("timeout");
    expect(spy).toHaveBeenCalledTimes(2);
    vi.unstubAllGlobals();
    const noId = stubFetch(body({ status: "searching" }));
    expect((await matchPerson(LOOKUP, API_KEY, signal(), opts())).kind).toBe("timeout");
    expect(noId).toHaveBeenCalledTimes(1);
  });

  it("classifies a terminal status at once instead of polling out the budget", async () => {
    const spy = stubFetch(body({ id: 4410022, status: "not queued" }));
    const o = opts();
    const out = await matchPerson(LOOKUP, API_KEY, signal(), o);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(out.kind).toBe("no_match");
    expect(o.slept).toEqual([]);
  });

  it("returns what a terminal status already carries, without polling on it", async () => {
    const spy = stubFetch(body(personNotQueued));
    const out = await matchPerson(LOOKUP, API_KEY, signal(), opts());
    expect(spy).toHaveBeenCalledTimes(1);
    expect(out.kind).toBe("ok");
    expect(fields(out)["person.email"]).toBe("ada@analyticalengines.com");
  });

  it("bounds one in-flight poll instead of only the loop, so a hung call still ends", async () => {
    const spy = hangingFetch(body(personPending));
    const out = await matchPerson(LOOKUP, API_KEY, signal(), { ...opts(), requestTimeoutMs: 20 });
    expect(out.kind).toBe("timeout");
    expect(spy).toHaveBeenCalledTimes(2);
  });

  // Fails by running out of test time if the last poll gets the full request timeout: it would hold
  // the fan-out open past the budget and throw away the partial candidate already in hand.
  it("bounds a late poll by the budget left, not by the full request timeout", async () => {
    const spy = hangingFetch(body(personSearching));
    const out = await matchPerson(LOOKUP, API_KEY, signal(), {
      ...opts(700),
      requestTimeoutMs: 30_000,
    });
    expect(spy).toHaveBeenCalledTimes(2);
    expect(out.kind).toBe("ok");
    expect(fields(out)["person.email"]).toBe("ada@analyticalengines.com");
  }, 2_000);

  it("reads a checkStatus response returned as a one element list", async () => {
    stubFetch(body(personSearching), body([personComplete]));
    const out = await matchPerson(LOOKUP, API_KEY, signal(), opts());
    expect(fields(out)["person.title"]).toBe("VP of Engineering");
  });

  it("keeps the partial result when a poll call fails", async () => {
    stubFetch(body(personSearching), body({ error: "boom" }, 500));
    const out = await matchPerson(LOOKUP, API_KEY, signal(), opts());
    expect(out.kind).toBe("ok");
    expect(fields(out)["person.email"]).toBe("ada@analyticalengines.com");
  });

  it("surfaces a poll failure when it holds nothing usable", async () => {
    stubFetch(body(personPending), body({ error: "boom" }, 500));
    const out = await matchPerson(LOOKUP, API_KEY, signal(), opts());
    expect(out.kind).toBe("provider_error");
  });

  it("keeps the cooldown, and the partial candidate, when a poll is throttled", async () => {
    stubFetch(body(personSearching), body({}, 429, { "retry-after": "42" }));
    const out = await matchPerson(LOOKUP, API_KEY, signal(), opts());
    expect(out.kind).toBe("throttled");
    expect(resumesInMs(out)).toBeGreaterThan(30_000);
    expect(fields(out)["person.email"]).toBe("ada@analyticalengines.com");
    // The merge reads candidates off every outcome, so a partial one still reaches the dialog.
    const proposed = mergeCandidates([out], {}, [
      {
        canonicalKey: "person.email",
        label: "Email",
        targetKind: "builtin",
        targetKey: "emails",
        targetFieldDefId: null,
      },
    ]);
    expect(proposed[0]?.selectedValue).toBe("ada@analyticalengines.com");
  });

  it("keeps the rejected key, and the exhausted credits, alongside the partial candidate", async () => {
    stubFetch(body({ detail: "invalid key" }, 401));
    const rejected = await matchPerson(LOOKUP, API_KEY, signal(), opts());
    expect(rejected.kind).toBe("auth");
    vi.unstubAllGlobals();
    stubFetch(body(personSearching), body({ detail: "invalid key" }, 401));
    const auth = await matchPerson(LOOKUP, API_KEY, signal(), opts());
    expect(auth.kind).toBe("auth");
    expect(fields(auth)["person.email"]).toBe("ada@analyticalengines.com");
    vi.unstubAllGlobals();
    stubFetch(body(personSearching), body({ detail: "out of credit" }, 403));
    const quota = await matchPerson(LOOKUP, API_KEY, signal(), opts());
    expect(quota.kind).toBe("quota");
    expect(fields(quota)["person.email"]).toBe("ada@analyticalengines.com");
  });

  it("keeps a plan refusal alongside the partial candidate", async () => {
    stubFetch(
      body(personSearching),
      body({ detail: "This endpoint is not included in your current plan" }, 403),
    );
    const out = await matchPerson(LOOKUP, API_KEY, signal(), opts());
    expect(out.kind).toBe("not_entitled");
    expect(fields(out)["person.email"]).toBe("ada@analyticalengines.com");
  });
});
