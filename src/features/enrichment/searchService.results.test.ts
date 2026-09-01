import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import { PROSPECT_SEARCH_PER_PAGE } from "@/constants/prospectSearch";
import * as schema from "@/db/schema";
import { seedUser } from "@/db/testing/factories";
import { makeTestDb, type TestDb } from "@/test/db";
import type { PeopleSearchOutcome } from "./providers/types";
import { searchProspects } from "./searchService";
import {
  actorFor,
  CREATOR,
  connect,
  found,
  NOW,
  profileOf,
  type Recorder,
  SIG,
  seedOrg,
  stub,
} from "./searchService.test-helpers";

let h: TestDb;
let owner: typeof schema.users.$inferSelect;

beforeAll(async () => {
  h = await makeTestDb();
  owner = await seedUser(h.db);
});

afterAll(async () => {
  await h.close();
});

beforeEach(async () => {
  await h.db.delete(schema.enrichmentRuns);
  await h.db.delete(schema.enrichmentProviders);
});

describe("searchProspects results", () => {
  it("returns badged profiles and writes no enrichment run", async () => {
    await connect(h.db, "apollo");
    const org = await seedOrg(h.db, owner.id, { domain: "https://www.acme.com/careers" });
    const [known] = await h.db
      .insert(schema.persons)
      .values({ name: "Ada Lovelace", orgId: org.id, ownerId: owner.id, visibilityLevel: "all" })
      .returning();
    if (known === undefined) {
      throw new AppError(ERROR_IDS.DB_INSERT_FAILED, "person insert returned no rows", {});
    }
    const recorder: Recorder = { calls: [] };

    const result = await searchProspects(
      h.db,
      actorFor(owner.id, CREATOR),
      {
        orgId: org.id,
        provider: "apollo",
        titles: ["Head of Engineering"],
        seniorities: ["head"],
        page: 2,
      },
      NOW,
      SIG(),
      {
        resolveProvider: stub(
          () =>
            Promise.resolve(
              found(
                [
                  profileOf({ providerRef: "p1", fullName: "ADA  LOVELACE" }),
                  profileOf({ providerRef: "p2", fullName: "Grace Hopper" }),
                ],
                true,
              ),
            ),
          recorder,
        ),
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.hasMore).toBe(true);
    expect(result.value.outcome).toEqual({ provider: "apollo", kind: "ok" });
    expect(result.value.profiles.map((p) => p.providerRef)).toEqual(["p1", "p2"]);
    expect(result.value.profiles[0]?.match).toEqual({
      kind: "existing",
      personId: known.id,
      personUpdatedAtIso: known.updatedAt.toISOString(),
    });
    expect(result.value.profiles[1]?.match).toEqual({ kind: "new" });
    expect(recorder.calls).toEqual([
      {
        companyDomain: "acme.com",
        companyName: org.name,
        titles: ["Head of Engineering"],
        seniorities: ["head"],
        page: 2,
        perPage: PROSPECT_SEARCH_PER_PAGE,
      },
    ]);
    expect(await h.db.select().from(schema.enrichmentRuns)).toEqual([]);
  });

  it("records a throttled outcome so the provider cools down", async () => {
    await connect(h.db, "apollo");
    const org = await seedOrg(h.db, owner.id);

    const result = await searchProspects(
      h.db,
      actorFor(owner.id, CREATOR),
      { orgId: org.id, provider: "apollo", titles: [], seniorities: [], page: 1 },
      NOW,
      SIG(),
      {
        resolveProvider: stub(() =>
          Promise.resolve({
            provider: "apollo" as const,
            kind: "throttled" as const,
            retryAfterIso: "2026-08-31T13:30:00.000Z",
            profiles: [],
            hasMore: false,
          }),
        ),
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.outcome.kind).toBe("throttled");
    expect(result.value.profiles).toEqual([]);

    const [row] = await h.db
      .select()
      .from(schema.enrichmentProviders)
      .where(eq(schema.enrichmentProviders.provider, "apollo"));
    expect(row?.throttledUntil?.toISOString()).toBe("2026-08-31T13:30:00.000Z");
    expect(await h.db.select().from(schema.enrichmentRuns)).toEqual([]);
  });

  it("gives up on a provider that ignores its deadline", async () => {
    await connect(h.db, "apollo");
    const org = await seedOrg(h.db, owner.id);

    const result = await searchProspects(
      h.db,
      actorFor(owner.id, CREATOR),
      { orgId: org.id, provider: "apollo", titles: [], seniorities: [], page: 1 },
      NOW,
      SIG(),
      {
        resolveProvider: stub(() => new Promise<PeopleSearchOutcome>(() => {})),
        deadlineMs: 40,
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.outcome).toEqual({
      provider: "apollo",
      kind: "timeout",
      message: "Timed out",
    });
    expect(result.value.profiles).toEqual([]);
    expect(result.value.hasMore).toBe(false);
  });
});
