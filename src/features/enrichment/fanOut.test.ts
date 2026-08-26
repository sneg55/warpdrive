import { describe, expect, it, vi } from "vitest";
import { fanOut, PROVIDER_DEADLINE_MS, summariseOutcomes } from "./fanOut";
import type { EnrichmentProvider, ProviderId, ProviderOutcome } from "./providers/types";

function stub(
  id: ProviderId,
  result: ProviderOutcome | (() => Promise<ProviderOutcome>),
): EnrichmentProvider {
  const call = typeof result === "function" ? result : () => Promise.resolve(result);
  return { id, matchPerson: call, matchOrganization: call };
}

const KEYS = [
  { provider: "apollo" as const, apiKey: "k1", credential: Buffer.from("c1") },
  { provider: "rocketreach" as const, apiKey: "k2", credential: Buffer.from("c2") },
];

describe("fanOut", () => {
  it("returns one outcome per usable provider", async () => {
    const outcomes = await fanOut({
      usable: KEYS,
      providerFor: (id) => stub(id, { provider: id, kind: "no_match" }),
      call: (p, key, signal) => p.matchPerson({}, key, signal),
      signal: AbortSignal.timeout(1000),
    });
    expect(outcomes.map((o) => o.provider).sort()).toEqual(["apollo", "rocketreach"]);
  });

  it("keeps the other providers when one rejects", async () => {
    const outcomes = await fanOut({
      usable: KEYS,
      providerFor: (id) =>
        id === "apollo"
          ? stub(id, () => Promise.reject(new Error("boom")))
          : stub(id, {
              provider: id,
              kind: "ok",
              candidate: { fields: { "person.title": "CTO" } },
            }),
      call: (p, key, signal) => p.matchPerson({}, key, signal),
      signal: AbortSignal.timeout(1000),
    });
    expect(outcomes.find((o) => o.provider === "apollo")?.kind).toBe("provider_error");
    expect(outcomes.find((o) => o.provider === "rocketreach")?.kind).toBe("ok");
  });

  it("never lets a provider error escape as a rejection", async () => {
    await expect(
      fanOut({
        usable: KEYS,
        providerFor: (id) => stub(id, () => Promise.reject(new Error("boom"))),
        call: (p, key, signal) => p.matchPerson({}, key, signal),
        signal: AbortSignal.timeout(1000),
      }),
    ).resolves.toHaveLength(2);
  });

  it("classifies an abort as a timeout rather than a provider fault", async () => {
    const aborted = new DOMException("aborted", "AbortError");
    const outcomes = await fanOut({
      usable: [KEYS[0] ?? { provider: "apollo", apiKey: "k", credential: Buffer.from("c") }],
      providerFor: (id) => stub(id, () => Promise.reject(aborted)),
      call: (p, key, signal) => p.matchPerson({}, key, signal),
      signal: AbortSignal.timeout(1000),
    });
    expect(outcomes[0]?.kind).toBe("timeout");
  });

  it("stamps the provider id even when the provider forgot to", async () => {
    const outcomes = await fanOut({
      usable: [{ provider: "getprospect", apiKey: "k", credential: Buffer.from("c") }],
      providerFor: (id) => stub(id, { provider: "apollo", kind: "ok", candidate: { fields: {} } }),
      call: (p, key, signal) => p.matchPerson({}, key, signal),
      signal: AbortSignal.timeout(1000),
    });
    expect(outcomes[0]?.provider).toBe("getprospect");
  });

  it("cuts one slow provider off at its own deadline and keeps the fast one's result", async () => {
    const outcomes = await fanOut({
      usable: KEYS,
      providerFor: (id) =>
        id === "apollo"
          ? stub(id, () => new Promise<ProviderOutcome>(() => undefined))
          : stub(id, {
              provider: id,
              kind: "ok",
              candidate: { fields: { "person.title": "CTO" } },
            }),
      call: (p, key, signal) => p.matchPerson({}, key, signal),
      signal: new AbortController().signal,
      deadlineMs: 10,
    });
    expect(outcomes.find((o) => o.provider === "apollo")?.kind).toBe("timeout");
    expect(outcomes.find((o) => o.provider === "rocketreach")?.kind).toBe("ok");
  });

  // A cancelled click is not an outage. Reported as outcomes it persists an all-failed run that the
  // next click replays out of the cache.
  it("propagates the caller's abort instead of reporting provider failures", async () => {
    const controller = new AbortController();
    const seen: AbortSignal[] = [];
    const running = fanOut({
      usable: KEYS,
      providerFor: (id) => stub(id, () => new Promise<ProviderOutcome>(() => undefined)),
      call: (p, key, signal) => {
        seen.push(signal);
        return p.matchPerson({}, key, signal);
      },
      signal: controller.signal,
      deadlineMs: PROVIDER_DEADLINE_MS,
    });
    controller.abort();
    const rejection = await running.then(
      () => null,
      (reason: unknown) => reason,
    );
    expect((rejection as Error).name).toBe("AbortError");
    expect(seen).toHaveLength(2);
    expect(seen.every((s) => s.aborted)).toBe(true);
  });

  it("still propagates the abort when a provider had already answered", async () => {
    const controller = new AbortController();
    const running = fanOut({
      usable: KEYS,
      providerFor: (id) =>
        id === "apollo"
          ? stub(id, { provider: id, kind: "ok", candidate: { fields: { "person.title": "CTO" } } })
          : stub(id, () => new Promise<ProviderOutcome>(() => undefined)),
      call: (p, key, signal) => p.matchPerson({}, key, signal),
      signal: controller.signal,
      deadlineMs: PROVIDER_DEADLINE_MS,
    });
    controller.abort();
    const rejection = await running.then(
      () => null,
      (reason: unknown) => reason,
    );
    expect((rejection as Error).name).toBe("AbortError");
  });

  it("defaults to a per-provider deadline wider than RocketReach's poll budget", () => {
    expect(PROVIDER_DEADLINE_MS).toBeGreaterThan(15_000);
  });

  it("returns an empty list when nothing is usable, without calling out", async () => {
    const providerFor = vi.fn();
    const outcomes = await fanOut({
      usable: [],
      providerFor,
      call: (p, key, signal) => p.matchPerson({}, key, signal),
      signal: AbortSignal.timeout(1000),
    });
    expect(outcomes).toEqual([]);
    expect(providerFor).not.toHaveBeenCalled();
  });
});

describe("summariseOutcomes", () => {
  it("reports success when any provider answered", () => {
    const s = summariseOutcomes([
      { provider: "apollo", kind: "ok" },
      { provider: "rocketreach", kind: "throttled" },
    ]);
    expect(s.anySucceeded).toBe(true);
  });

  it("counts a no_match as an answer, since the provider did its job", () => {
    expect(summariseOutcomes([{ provider: "apollo", kind: "no_match" }]).anySucceeded).toBe(true);
  });

  it("reports failure when every provider failed", () => {
    const s = summariseOutcomes([
      { provider: "apollo", kind: "auth" },
      { provider: "rocketreach", kind: "throttled" },
      { provider: "getprospect", kind: "timeout" },
    ]);
    expect(s.anySucceeded).toBe(false);
    expect(s.reasons).toEqual({
      apollo: "auth",
      rocketreach: "throttled",
      getprospect: "timeout",
    });
  });

  it("names the earliest resume time so the user is told when to come back", () => {
    const s = summariseOutcomes([
      { provider: "apollo", kind: "throttled", retryAfterIso: "2026-08-24T14:20:00.000Z" },
      { provider: "rocketreach", kind: "quota", retryAfterIso: "2026-08-25T12:00:00.000Z" },
    ]);
    expect(s.earliestRetryIso).toBe("2026-08-24T14:20:00.000Z");
  });

  it("has no resume time when nothing was throttled", () => {
    expect(summariseOutcomes([{ provider: "apollo", kind: "ok" }]).earliestRetryIso).toBeNull();
  });

  it("treats an empty outcome list as a failure, not a silent success", () => {
    expect(summariseOutcomes([]).anySucceeded).toBe(false);
  });

  // RocketReach answers with cached fields and can then hit a 429 mid-poll. That outcome keeps the
  // throttled kind so the cooldown is recorded, so judging on kind alone would discard fields we
  // are holding whenever that provider was the only one enabled.
  it("counts a failed provider that still returned data as an answer", () => {
    const s = summariseOutcomes([
      {
        provider: "rocketreach",
        kind: "throttled",
        retryAfterIso: "2026-08-24T14:20:00.000Z",
        candidate: { fields: { "person.email": "jane@acme.com" } },
      },
    ]);
    expect(s.anySucceeded).toBe(true);
    // It is still a failure for the footer's purposes, and its resume time still has to show.
    expect(s.reasons).toEqual({ rocketreach: "throttled" });
    expect(s.earliestRetryIso).toBe("2026-08-24T14:20:00.000Z");
  });

  it("still fails when a throttled provider returned nothing", () => {
    expect(summariseOutcomes([{ provider: "rocketreach", kind: "throttled" }]).anySucceeded).toBe(
      false,
    );
  });
});
