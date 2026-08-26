import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ERROR_IDS } from "@/constants/errorIds";
import * as schema from "@/db/schema";
import { toContactActor } from "@/features/contacts/actorAdapters";
import { seedUser, toActor } from "@/features/stats/statsTestHelpers";
import { makeTestDb, type TestDb } from "@/test/db";
import { applyEnrichment } from "./applyService";
import { mappingsFingerprint } from "./mappingsFingerprint";
import { listMappings, seedDefaultMappings, upsertMapping } from "./mappingsRepo";
import type { ProviderOutcome } from "./providers/types";
import type { Selection } from "./types";

let h: TestDb;
let admin: typeof schema.users.$inferSelect;
let stranger: typeof schema.users.$inferSelect;

const SIG = (): AbortSignal => AbortSignal.timeout(20_000);

beforeAll(async () => {
  h = await makeTestDb();
  admin = await seedUser(h, { isAdmin: true });
  stranger = await seedUser(h);
  await seedDefaultMappings(h.db, SIG());
});
afterAll(async () => {
  await h.close();
});

async function seedPerson(values: Partial<typeof schema.persons.$inferInsert> = {}) {
  const [row] = await h.db
    .insert(schema.persons)
    .values({
      name: `Pat-${Math.random().toString(36).slice(2)}`,
      ownerId: admin.id,
      visibilityLevel: "all",
      ...values,
    })
    .returning();
  if (row === undefined) throw new Error("no person row");
  return row;
}

async function seedOrg(values: Partial<typeof schema.organizations.$inferInsert> = {}) {
  const [row] = await h.db
    .insert(schema.organizations)
    .values({
      name: `Acme-${Math.random().toString(36).slice(2)}`,
      ownerId: admin.id,
      visibilityLevel: "all",
      ...values,
    })
    .returning();
  if (row === undefined) throw new Error("no org row");
  return row;
}

async function seedRun(
  entityType: "person" | "organization",
  entityId: string,
  outcomes: ProviderOutcome[],
) {
  const [row] = await h.db
    .insert(schema.enrichmentRuns)
    .values({ entityType, entityId, requestedBy: admin.id, outcomes })
    .returning();
  if (row === undefined) throw new Error("no run row");
  return row;
}

async function liveFingerprint(entity: "person" | "organization"): Promise<string> {
  return mappingsFingerprint(await listMappings(h.db, entity, SIG()));
}

async function fingerprintForRun(runId: string): Promise<string> {
  const [run] = await h.db
    .select({ entityType: schema.enrichmentRuns.entityType })
    .from(schema.enrichmentRuns)
    .where(eq(schema.enrichmentRuns.id, runId));
  return mappingsFingerprint(await listMappings(h.db, run?.entityType ?? "person", SIG()));
}

async function apply(
  runId: string,
  expectedUpdatedAt: Date,
  selections: Selection[],
  as: typeof schema.users.$inferSelect = admin,
  fingerprint?: string,
) {
  const args = {
    runId,
    expectedUpdatedAtIso: expectedUpdatedAt.toISOString(),
    selections,
    mappingsFingerprint: fingerprint ?? (await fingerprintForRun(runId)),
  };
  return applyEnrichment(h.db, toContactActor(toActor(as)), args, new Date(), SIG());
}

const APOLLO = (fields: Record<string, string | number>): ProviderOutcome => ({
  provider: "apollo",
  kind: "ok",
  candidate: { fields },
});

async function readRun(id: string) {
  const [row] = await h.db
    .select()
    .from(schema.enrichmentRuns)
    .where(eq(schema.enrichmentRuns.id, id));
  return row;
}

describe("applyEnrichment authorization", () => {
  // Answering "that value was not in the run" to somebody who cannot see the record tells them
  // what the run holds. Both requests have to fail the same way, on the record, not on the guess.
  it("answers a caller who cannot see the record the same way whether or not the value is backed", async () => {
    const org = await seedOrg({ visibilityLevel: "owner" });
    const run = await seedRun("organization", org.id, [APOLLO({ "org.industry": "Aerospace" })]);

    const backed = await apply(
      run.id,
      org.updatedAt,
      [{ canonicalKey: "org.industry", value: "Aerospace" }],
      stranger,
    );
    const guessed = await apply(
      run.id,
      org.updatedAt,
      [{ canonicalKey: "org.industry", value: "Fishing" }],
      stranger,
    );

    expect(backed.ok).toBe(false);
    expect(guessed.ok).toBe(false);
    if (backed.ok || guessed.ok) return;
    expect(backed.error.id).toBe(ERROR_IDS.CONTACT_NOT_FOUND);
    expect(guessed.error.id).toBe(backed.error.id);
  });

  it("leaves the run unstamped when the caller cannot see the record", async () => {
    const org = await seedOrg({ visibilityLevel: "owner" });
    const run = await seedRun("organization", org.id, [APOLLO({ "org.industry": "Aerospace" })]);

    await apply(
      run.id,
      org.updatedAt,
      [{ canonicalKey: "org.industry", value: "Aerospace" }],
      stranger,
    );

    expect((await readRun(run.id))?.appliedAt).toBeNull();
  });

  // The planner keeps the last value for a scalar target while the change log looks the key up
  // with `find`, so a duplicate writes one value and records another.
  it("rejects two selections naming the same canonical key", async () => {
    const org = await seedOrg();
    const run = await seedRun("organization", org.id, [
      APOLLO({ "org.industry": "Aerospace" }),
      { provider: "getprospect", kind: "ok", candidate: { fields: { "org.industry": "Fishing" } } },
    ]);

    const result = await apply(run.id, org.updatedAt, [
      { canonicalKey: "org.industry", value: "Aerospace" },
      { canonicalKey: "org.industry", value: "Fishing" },
    ]);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.id).toBe(ERROR_IDS.ENRICH_INPUT_INVALID);
    const [after] = await h.db
      .select()
      .from(schema.organizations)
      .where(eq(schema.organizations.id, org.id));
    expect(after?.industry ?? null).toBeNull();
  });

  it("rejects an apply that selects nothing", async () => {
    const org = await seedOrg();
    const run = await seedRun("organization", org.id, [APOLLO({ "org.industry": "Aerospace" })]);

    const result = await apply(run.id, org.updatedAt, []);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.id).toBe(ERROR_IDS.ENRICH_INPUT_INVALID);
    expect((await readRun(run.id))?.appliedAt).toBeNull();
  });

  // A company name matching no single organization writes nothing. Stamping the run anyway makes
  // the audit claim an apply that never touched the record.
  it("does not stamp the run when every selection came back unresolved", async () => {
    const person = await seedPerson();
    const run = await seedRun("person", person.id, [
      APOLLO({ "person.companyName": "Nowhere Industries Ltd" }),
    ]);

    const result = await apply(run.id, person.updatedAt, [
      { canonicalKey: "person.companyName", value: "Nowhere Industries Ltd" },
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.appliedFields).toEqual([]);
    expect(result.value.unresolved).toEqual(["person.companyName"]);
    expect((await readRun(run.id))?.appliedAt).toBeNull();
  });

  // An admin repointing a canonical key does not touch the record, so the compare-and-swap still
  // passes while the row the user reviewed as a gap now names a populated field somewhere else.
  it("rejects an apply once the canonical key it reviewed points at another target", async () => {
    const org = await seedOrg();
    const run = await seedRun("organization", org.id, [APOLLO({ "org.industry": "Aerospace" })]);
    const reviewed = await liveFingerprint("organization");

    const [def] = await h.db
      .insert(schema.customFieldDefs)
      .values({
        targetEntity: "organization",
        type: "text",
        name: "Sector",
        key: `sector_${Math.random().toString(36).slice(2)}`,
      })
      .returning();
    if (def === undefined) throw new Error("no custom field def");
    const repointed = await upsertMapping(
      h.db,
      "organization",
      "org.industry",
      { kind: "custom", fieldDefId: def.id },
      SIG(),
    );
    expect(repointed.ok).toBe(true);

    const result = await apply(
      run.id,
      org.updatedAt,
      [{ canonicalKey: "org.industry", value: "Aerospace" }],
      admin,
      reviewed,
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.id).toBe(ERROR_IDS.ENRICH_MAPPINGS_CHANGED);
    const [after] = await h.db
      .select()
      .from(schema.organizations)
      .where(eq(schema.organizations.id, org.id));
    expect(after?.industry ?? null).toBeNull();
    expect((await readRun(run.id))?.appliedAt).toBeNull();

    await upsertMapping(
      h.db,
      "organization",
      "org.industry",
      { kind: "builtin", key: "industry" },
      SIG(),
    );
  });

  it("applies normally while the mapping the user reviewed is still in place", async () => {
    const org = await seedOrg();
    const run = await seedRun("organization", org.id, [APOLLO({ "org.industry": "Aerospace" })]);

    const result = await apply(run.id, org.updatedAt, [
      { canonicalKey: "org.industry", value: "Aerospace" },
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.appliedFields).toEqual(["org.industry"]);
  });
});
