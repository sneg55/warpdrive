import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { seedUser } from "@/db/testing/factories";
import { makeTestDb, type TestDb } from "@/test/db";
import { searchProspects } from "./searchService";
import {
  actorFor,
  CREATOR,
  connect,
  found,
  MISSING_ORG_ID,
  NO_FLAGS,
  NOW,
  type Recorder,
  SIG,
  seedOrg,
  stub,
} from "./searchService.test-helpers";

let h: TestDb;
let owner: typeof schema.users.$inferSelect;

const answerNothing = () => Promise.resolve(found([], false));

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

describe("searchProspects authorisation", () => {
  it("returns not found when the organization does not exist", async () => {
    await connect(h.db, "apollo");
    const recorder: Recorder = { calls: [] };

    const result = await searchProspects(
      h.db,
      actorFor(owner.id, CREATOR),
      { orgId: MISSING_ORG_ID, provider: "apollo", titles: [], seniorities: [], page: 1 },
      NOW,
      SIG(),
      { resolveProvider: stub(answerNothing, recorder) },
    );

    expect(result.ok === false && result.error.id).toBe("E_CONTACT_001");
    expect(recorder.calls).toHaveLength(0);
  });

  it("returns not found when the actor cannot see the organization", async () => {
    await connect(h.db, "apollo");
    const stranger = await seedUser(h.db);
    const org = await seedOrg(h.db, owner.id, { visibilityLevel: "owner" });

    const result = await searchProspects(
      h.db,
      actorFor(stranger.id, CREATOR),
      { orgId: org.id, provider: "apollo", titles: [], seniorities: [], page: 1 },
      NOW,
      SIG(),
      { resolveProvider: stub(answerNothing) },
    );

    expect(result.ok === false && result.error.id).toBe("E_CONTACT_001");
  });

  it("returns permission denied when the actor lacks contact.create", async () => {
    await connect(h.db, "apollo");
    const org = await seedOrg(h.db, owner.id);
    const recorder: Recorder = { calls: [] };

    const result = await searchProspects(
      h.db,
      actorFor(owner.id, NO_FLAGS),
      { orgId: org.id, provider: "apollo", titles: [], seniorities: [], page: 1 },
      NOW,
      SIG(),
      { resolveProvider: stub(answerNothing, recorder) },
    );

    expect(result.ok === false && result.error.id).toBe("E_PERM_001");
    expect(recorder.calls).toHaveLength(0);
  });
});

describe("searchProspects preconditions", () => {
  it("refuses an organization whose domain is blank, without calling the provider", async () => {
    await connect(h.db, "apollo");
    const org = await seedOrg(h.db, owner.id, { domain: "   " });
    const recorder: Recorder = { calls: [] };

    const result = await searchProspects(
      h.db,
      actorFor(owner.id, CREATOR),
      { orgId: org.id, provider: "apollo", titles: [], seniorities: [], page: 1 },
      NOW,
      SIG(),
      { resolveProvider: stub(answerNothing, recorder) },
    );

    expect(result.ok === false && result.error.id).toBe("E_ENRICH_016");
    expect(recorder.calls).toHaveLength(0);
  });

  it("refuses an organization whose domain is null", async () => {
    await connect(h.db, "apollo");
    const org = await seedOrg(h.db, owner.id, { domain: null });

    const result = await searchProspects(
      h.db,
      actorFor(owner.id, CREATOR),
      { orgId: org.id, provider: "apollo", titles: [], seniorities: [], page: 1 },
      NOW,
      SIG(),
      { resolveProvider: stub(answerNothing) },
    );

    expect(result.ok === false && result.error.id).toBe("E_ENRICH_016");
  });

  it("refuses a provider that is not connected", async () => {
    await connect(h.db, "getprospect");
    const org = await seedOrg(h.db, owner.id);

    const result = await searchProspects(
      h.db,
      actorFor(owner.id, CREATOR),
      { orgId: org.id, provider: "apollo", titles: [], seniorities: [], page: 1 },
      NOW,
      SIG(),
      { resolveProvider: stub(answerNothing) },
    );

    expect(result.ok === false && result.error.id).toBe("E_ENRICH_015");
  });

  it("refuses a connected provider that cannot search people", async () => {
    await connect(h.db, "apollo");
    const org = await seedOrg(h.db, owner.id);

    const result = await searchProspects(
      h.db,
      actorFor(owner.id, CREATOR),
      { orgId: org.id, provider: "apollo", titles: [], seniorities: [], page: 1 },
      NOW,
      SIG(),
      { resolveProvider: stub(answerNothing, { calls: [] }, false) },
    );

    expect(result.ok === false && result.error.id).toBe("E_ENRICH_015");
  });
});
