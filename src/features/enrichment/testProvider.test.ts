import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { encryptToken } from "@/features/email/crypto";
import { makeTestDb, type TestDb } from "@/test/db";
import type { EnrichmentProvider, ProviderId, ProviderOutcome } from "./providers/types";
import { testProvider } from "./testProvider";

let h: TestDb;
const SIG = (): AbortSignal => AbortSignal.timeout(20_000);
const NOW = new Date("2026-08-24T12:00:00.000Z");

beforeAll(async () => {
  h = await makeTestDb();
});
afterAll(async () => {
  await h.close();
});
beforeEach(async () => {
  await h.db.delete(schema.enrichmentProviders);
});

function stub(outcome: ProviderOutcome) {
  return (id: ProviderId): EnrichmentProvider => ({
    id,
    matchPerson: () => Promise.resolve(outcome),
    matchOrganization: () => Promise.resolve(outcome),
  });
}

// The two endpoints can disagree, which is the whole reason the probe calls both.
function stubEach(organization: ProviderOutcome, personOutcome: ProviderOutcome) {
  return (id: ProviderId): EnrichmentProvider => ({
    id,
    matchPerson: () => Promise.resolve(personOutcome),
    matchOrganization: () => Promise.resolve(organization),
  });
}

// A person endpoint that answers only when its own signal ends it, as RocketReach's poll does.
function stubHangingPerson(organization: ProviderOutcome) {
  return (id: ProviderId): EnrichmentProvider => ({
    id,
    matchPerson: (_input, _apiKey, sig) =>
      new Promise((_resolve, reject) => {
        sig.addEventListener("abort", () => reject(sig.reason as Error), { once: true });
      }),
    matchOrganization: () => Promise.resolve(organization),
  });
}

const ORG_OK: ProviderOutcome = {
  provider: "apollo",
  kind: "ok",
  candidate: { fields: { "org.name": "Apollo.io" } },
};

async function storeKey(enabled: boolean) {
  await h.db.insert(schema.enrichmentProviders).values({
    provider: "apollo",
    enabled,
    apiKeyEncrypted: encryptToken("sk-test-key"),
    apiKeyHint: "key",
  });
}

async function providerRow() {
  const [row] = await h.db
    .select()
    .from(schema.enrichmentProviders)
    .where(eq(schema.enrichmentProviders.provider, "apollo"));
  return row;
}

describe("testProvider", () => {
  // The whole point is checking a key before switching the provider on, so a disabled provider
  // must still be testable.
  it("tests a provider that is stored but not enabled", async () => {
    await storeKey(false);
    const result = await testProvider(
      h.db,
      "apollo",
      NOW,
      SIG(),
      stub({ provider: "apollo", kind: "ok", candidate: { fields: {} } }),
    );
    expect(result.ok && result.value.kind).toBe("ok");
  });

  // The counts are the reason an admin runs the test on Apollo at all, so they have to survive the
  // trip out of the provider rather than being reduced to a verdict.
  it("carries the remaining quota the probe reported", async () => {
    await storeKey(true);
    const result = await testProvider(
      h.db,
      "apollo",
      NOW,
      SIG(),
      stub({
        provider: "apollo",
        kind: "ok",
        candidate: { fields: {} },
        quotaRemaining: { hourly: 0, daily: 1450 },
      }),
    );
    expect(result.ok && result.value).toEqual({
      kind: "ok",
      quotaRemaining: { hourly: 0, daily: 1450 },
    });
  });

  it("reports no quota when the provider published none", async () => {
    await storeKey(true);
    const result = await testProvider(
      h.db,
      "apollo",
      NOW,
      SIG(),
      stub({ provider: "apollo", kind: "no_match" }),
    );
    expect(result.ok && result.value).toEqual({ kind: "no_match" });
  });

  it("refuses when no key is stored", async () => {
    const result = await testProvider(
      h.db,
      "apollo",
      NOW,
      SIG(),
      stub({ provider: "apollo", kind: "ok" }),
    );
    expect(result.ok === false && result.error.id).toBe("E_ENRICH_010");
  });

  it("badges the row when the key is rejected", async () => {
    await storeKey(true);
    const result = await testProvider(
      h.db,
      "apollo",
      NOW,
      SIG(),
      stub({ provider: "apollo", kind: "auth" }),
    );
    expect(result.ok && result.value.kind).toBe("auth");
    expect((await providerRow())?.needsAttention).toBe(true);
  });

  it("records a cooldown the probe discovers", async () => {
    await storeKey(true);
    await testProvider(
      h.db,
      "apollo",
      NOW,
      SIG(),
      stub({
        provider: "apollo",
        kind: "throttled",
        retryAfterIso: "2026-08-24T13:00:00.000Z",
      }),
    );
    expect((await providerRow())?.throttledUntil?.toISOString()).toBe("2026-08-24T13:00:00.000Z");
  });

  it("clears a stale rejected badge when the probe succeeds", async () => {
    await storeKey(true);
    await h.db
      .update(schema.enrichmentProviders)
      .set({ needsAttention: true })
      .where(eq(schema.enrichmentProviders.provider, "apollo"));

    await testProvider(h.db, "apollo", NOW, SIG(), stub({ provider: "apollo", kind: "no_match" }));
    expect((await providerRow())?.needsAttention).toBe(false);
  });

  it("does not badge the key when a plan refuses one endpoint and the other answers", async () => {
    await storeKey(true);
    const result = await testProvider(
      h.db,
      "apollo",
      NOW,
      SIG(),
      stubEach(
        { ...ORG_OK, quotaRemaining: { hourly: 199, daily: 599 } },
        { provider: "apollo", kind: "not_entitled" },
      ),
    );
    expect(result.ok && result.value).toEqual({
      kind: "ok",
      quotaRemaining: { hourly: 199, daily: 599 },
      notEntitled: ["person"],
    });
    expect((await providerRow())?.needsAttention).toBe(false);
  });

  // A run enriches people as well as organizations, and on Apollo the two endpoints are entitled
  // separately. Probing only one lets a key that cannot enrich a person report green.
  it("fails the test when the person endpoint rejects a key the organization endpoint accepted", async () => {
    await storeKey(true);
    const result = await testProvider(
      h.db,
      "apollo",
      NOW,
      SIG(),
      stubEach(ORG_OK, { provider: "apollo", kind: "auth" }),
    );
    expect(result.ok && result.value.kind).toBe("auth");
    expect((await providerRow())?.needsAttention).toBe(true);
  });

  // The verdict is what the row must end up describing, whichever endpoint produced it: a probe
  // that answered green elsewhere must not clear the badge the failure just earned.
  it("keeps the rejected badge when only the person endpoint accepted the key", async () => {
    await storeKey(true);
    const result = await testProvider(
      h.db,
      "apollo",
      NOW,
      SIG(),
      stubEach({ provider: "apollo", kind: "auth" }, { provider: "apollo", kind: "ok" }),
    );
    expect(result.ok && result.value.kind).toBe("auth");
    expect((await providerRow())?.needsAttention).toBe(true);
  });

  it("carries a cooldown the person probe discovers", async () => {
    await storeKey(true);
    await testProvider(
      h.db,
      "apollo",
      NOW,
      SIG(),
      stubEach(ORG_OK, {
        provider: "apollo",
        kind: "quota",
        retryAfterIso: "2026-08-25T12:00:00.000Z",
      }),
    );
    expect((await providerRow())?.throttledUntil?.toISOString()).toBe("2026-08-25T12:00:00.000Z");
  });

  // RocketReach polls for up to 15s, well past the action budget. That is not a verdict about the
  // key, so it must not turn a working credential red.
  it("keeps the organization verdict when the person probe outruns its own budget", async () => {
    await storeKey(true);
    const result = await testProvider(h.db, "apollo", NOW, SIG(), stubHangingPerson(ORG_OK), 10);
    expect(result.ok && result.value.kind).toBe("ok");
    expect((await providerRow())?.needsAttention).toBe(false);
  });

  it("will not test a provider already sitting out a cooldown", async () => {
    await storeKey(true);
    await h.db
      .update(schema.enrichmentProviders)
      .set({ throttledUntil: new Date("2026-08-24T14:00:00.000Z"), throttleReason: "throttled" })
      .where(eq(schema.enrichmentProviders.provider, "apollo"));

    const result = await testProvider(
      h.db,
      "apollo",
      NOW,
      SIG(),
      stub({ provider: "apollo", kind: "ok" }),
    );
    expect(result.ok === false && result.error.id).toBe("E_ENRICH_010");
  });
});
