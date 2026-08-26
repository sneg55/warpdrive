import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { toContactActor } from "@/features/contacts/actorAdapters";
import { encryptToken } from "@/features/email/crypto";
import { seedUser, toActor } from "@/features/stats/statsTestHelpers";
import { makeTestDb, type TestDb } from "@/test/db";
import { seedDefaultMappings } from "./mappingsRepo";
import type { EnrichmentProvider, ProviderId, ProviderOutcome } from "./providers/types";
import { runEnrichment } from "./service";

let h: TestDb;
let admin: typeof schema.users.$inferSelect;

const SIG = (): AbortSignal => AbortSignal.timeout(20_000);
const NOW = new Date("2026-08-24T12:00:00.000Z");

beforeAll(async () => {
  h = await makeTestDb();
  admin = await seedUser(h, { isAdmin: true });
  await seedDefaultMappings(h.db, SIG());
});
afterAll(async () => {
  await h.close();
});

beforeEach(async () => {
  await h.db.delete(schema.enrichmentRuns);
  await h.db.delete(schema.enrichmentProviders);
});

async function connect(provider: ProviderId) {
  await h.db
    .insert(schema.enrichmentProviders)
    .values({
      provider,
      enabled: true,
      apiKeyEncrypted: encryptToken(`key-${provider}`),
      apiKeyHint: "abcd",
    })
    .onConflictDoUpdate({ target: schema.enrichmentProviders.provider, set: { enabled: true } });
}

async function seedOrg() {
  const [row] = await h.db
    .insert(schema.organizations)
    .values({
      name: `Acme-${Math.random().toString(36).slice(2)}`,
      domain: "acme.com",
      ownerId: admin.id,
      visibilityLevel: "all",
    })
    .returning();
  if (row === undefined) throw new Error("no org row");
  return row;
}

// Never answers, so only the caller's signal can end the call.
function hanging(onCall: () => void) {
  const answer = (): Promise<ProviderOutcome> => {
    onCall();
    return new Promise<ProviderOutcome>(() => undefined);
  };
  return (id: ProviderId): EnrichmentProvider => ({
    id,
    matchPerson: answer,
    matchOrganization: answer,
  });
}

describe("runEnrichment cancellation", () => {
  // A cancelled click recorded as provider timeouts leaves an all-failed run in the cache, and the
  // next click replays that outage instead of calling out.
  it("persists nothing when the caller cancels mid fan-out", async () => {
    await connect("apollo");
    await connect("rocketreach");
    const org = await seedOrg();

    const controller = new AbortController();
    let started = (): void => undefined;
    const inFlight = new Promise<void>((resolve) => {
      started = resolve;
    });

    const running = runEnrichment(
      h.db,
      toContactActor(toActor(admin)),
      { entityType: "organization", entityId: org.id },
      NOW,
      controller.signal,
      hanging(() => {
        started();
      }),
    );
    await inFlight;
    controller.abort();

    const rejection = await running.then(
      () => null,
      (reason: unknown) => reason,
    );
    expect((rejection as Error).name).toBe("AbortError");
    expect(await h.db.select().from(schema.enrichmentRuns)).toEqual([]);
    const rows = await h.db.select().from(schema.enrichmentProviders);
    expect(rows.map((r) => r.lastOkAt)).toEqual([null, null]);
    expect(rows.map((r) => r.needsAttention)).toEqual([false, false]);
  });
});
