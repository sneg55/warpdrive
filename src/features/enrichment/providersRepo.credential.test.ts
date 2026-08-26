import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { enrichmentProviders } from "@/db/schema/enrichment";
import { makeTestDb, type TestDb } from "@/test/db";
import {
  clearProviderKey,
  listUsableProviders,
  recordOutcome,
  setProviderEnabled,
  setProviderKey,
} from "./providersRepo";

let h: TestDb;
const SIG = (): AbortSignal => AbortSignal.timeout(20_000);
const NOW = new Date("2026-08-24T12:00:00.000Z");

beforeAll(async () => {
  h = await makeTestDb();
});
afterAll(async () => {
  await h.close();
});

async function credentialFor(provider: "apollo"): Promise<Buffer> {
  const [usable] = (await listUsableProviders(h.db, NOW, SIG(), { ignoreEnabled: true })).filter(
    (u) => u.provider === provider,
  );
  if (usable === undefined) throw new Error("no usable provider");
  return usable.credential;
}

async function readProvider(provider: "apollo") {
  const [row] = await h.db
    .select()
    .from(enrichmentProviders)
    .where(eq(enrichmentProviders.provider, provider));
  return row;
}

describe("recordOutcome credential binding", () => {
  // A lookup in flight when an admin pastes a replacement key produced its answer with the old
  // credential. Writing that answer onto the row badges or cools down a key it never touched.
  it("does not badge a key that replaced the one the call used", async () => {
    await setProviderKey(h.db, "apollo", "key-one", SIG());
    const stale = await credentialFor("apollo");

    await setProviderKey(h.db, "apollo", "key-two", SIG());
    await recordOutcome(h.db, { provider: "apollo", kind: "auth" }, stale, NOW, SIG());

    const row = await readProvider("apollo");
    expect(row?.needsAttention).toBe(false);
    expect(row?.apiKeyHint).toBe("-two");
  });

  it("does not cool down a key that replaced the one the call used", async () => {
    await setProviderKey(h.db, "apollo", "key-three", SIG());
    const stale = await credentialFor("apollo");

    await setProviderKey(h.db, "apollo", "key-four", SIG());
    await recordOutcome(
      h.db,
      {
        provider: "apollo",
        kind: "quota",
        retryAfterIso: new Date(NOW.getTime() + 60_000).toISOString(),
      },
      stale,
      NOW,
      SIG(),
    );

    expect((await readProvider("apollo"))?.throttledUntil).toBeNull();
  });

  it("still records an outcome against the credential that produced it", async () => {
    await setProviderKey(h.db, "apollo", "key-five", SIG());
    const current = await credentialFor("apollo");

    await recordOutcome(h.db, { provider: "apollo", kind: "auth" }, current, NOW, SIG());

    expect((await readProvider("apollo"))?.needsAttention).toBe(true);
  });

  it("clears a rejected badge when the provider names the plan rather than the key", async () => {
    await setProviderKey(h.db, "apollo", "key-six", SIG());
    const current = await credentialFor("apollo");
    await recordOutcome(h.db, { provider: "apollo", kind: "auth" }, current, NOW, SIG());

    await recordOutcome(h.db, { provider: "apollo", kind: "not_entitled" }, current, NOW, SIG());

    const row = await readProvider("apollo");
    expect(row?.needsAttention).toBe(false);
    expect(row?.lastOkAt).toBeNull();
  });
});

describe("setProviderEnabled", () => {
  // The credential check and the write have to be one statement. Between a check that saw a key
  // and an unconditional upsert, a Remove key can land and leave an enabled row with no key: the
  // fan-out then dials a provider that cannot authenticate, and the settings switch reads as on.
  it("refuses to enable a provider whose key was removed", async () => {
    await setProviderKey(h.db, "apollo", "key-six", SIG());
    await clearProviderKey(h.db, "apollo", SIG());

    const result = await setProviderEnabled(h.db, "apollo", true, SIG());

    expect(result.ok).toBe(false);
    expect((await readProvider("apollo"))?.enabled).toBe(false);
  });

  it("enables a provider that still holds its key", async () => {
    await setProviderKey(h.db, "apollo", "key-seven", SIG());

    const result = await setProviderEnabled(h.db, "apollo", true, SIG());

    expect(result.ok).toBe(true);
    expect((await readProvider("apollo"))?.enabled).toBe(true);
  });

  it("disables a provider without needing a key", async () => {
    await clearProviderKey(h.db, "apollo", SIG());

    const result = await setProviderEnabled(h.db, "apollo", false, SIG());

    expect(result.ok).toBe(true);
    expect((await readProvider("apollo"))?.enabled).toBe(false);
  });
});
