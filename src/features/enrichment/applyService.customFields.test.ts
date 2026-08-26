import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
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

const SIG = (): AbortSignal => AbortSignal.timeout(20_000);
const uniq = (): string => Math.random().toString(36).slice(2);

beforeAll(async () => {
  h = await makeTestDb();
  admin = await seedUser(h, { isAdmin: true });
  await seedDefaultMappings(h.db, SIG());
});
afterAll(async () => {
  await h.close();
});

async function seedDef(entity: "person" | "organization", over: { archived?: boolean } = {}) {
  const [def] = await h.db
    .insert(schema.customFieldDefs)
    .values({
      targetEntity: entity,
      type: "text",
      name: `Field ${uniq()}`,
      key: `f_${uniq()}`,
      archivedAt: over.archived === true ? new Date() : null,
    })
    .returning();
  if (def === undefined) throw new Error("no custom field def");
  return def;
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

async function apply(runId: string, expectedUpdatedAt: Date, selections: Selection[]) {
  const [run] = await h.db
    .select({ entityType: schema.enrichmentRuns.entityType })
    .from(schema.enrichmentRuns)
    .where(eq(schema.enrichmentRuns.id, runId));
  const entity = run?.entityType ?? "person";
  return applyEnrichment(
    h.db,
    toContactActor(toActor(admin)),
    {
      runId,
      expectedUpdatedAtIso: expectedUpdatedAt.toISOString(),
      selections,
      mappingsFingerprint: mappingsFingerprint(await listMappings(h.db, entity, SIG())),
    },
    new Date(),
    SIG(),
  );
}

const APOLLO = (fields: Record<string, string | number>): ProviderOutcome => ({
  provider: "apollo",
  kind: "ok",
  candidate: { fields },
});

// The ordinary inline edit writes one custom field with a JSONB merge for exactly this reason
// (see patchContactCustomField). Sending a whole snapshot through updatePerson / updateOrg runs it
// past the active-definition schema, which strips every key that schema does not know.
describe("applyEnrichment custom-field writes", () => {
  it("keeps an archived organization custom field that the selection never named", async () => {
    const active = await seedDef("organization");
    const archived = await seedDef("organization", { archived: true });
    const [org] = await h.db
      .insert(schema.organizations)
      .values({
        name: `Acme-${uniq()}`,
        ownerId: admin.id,
        visibilityLevel: "all",
        customFields: { [archived.key]: "kept from 2024" },
      })
      .returning();
    if (org === undefined) throw new Error("no org row");

    const mapped = await upsertMapping(
      h.db,
      "organization",
      "org.description",
      { kind: "custom", fieldDefId: active.id },
      SIG(),
    );
    expect(mapped.ok).toBe(true);

    const run = await seedRun("organization", org.id, [
      APOLLO({ "org.description": "Builds engines." }),
    ]);
    const result = await apply(run.id, org.updatedAt, [
      { canonicalKey: "org.description", value: "Builds engines." },
    ]);

    expect(result.ok).toBe(true);
    const [after] = await h.db
      .select()
      .from(schema.organizations)
      .where(eq(schema.organizations.id, org.id));
    const fields = after?.customFields as Record<string, unknown>;
    expect(fields[active.key]).toBe("Builds engines.");
    expect(fields[archived.key]).toBe("kept from 2024");
  });

  it("keeps an archived person custom field that the selection never named", async () => {
    const active = await seedDef("person");
    const archived = await seedDef("person", { archived: true });
    const [person] = await h.db
      .insert(schema.persons)
      .values({
        name: `Pat-${uniq()}`,
        ownerId: admin.id,
        visibilityLevel: "all",
        customFields: { [archived.key]: "kept from 2024" },
      })
      .returning();
    if (person === undefined) throw new Error("no person row");

    const mapped = await upsertMapping(
      h.db,
      "person",
      "person.title",
      { kind: "custom", fieldDefId: active.id },
      SIG(),
    );
    expect(mapped.ok).toBe(true);

    const run = await seedRun("person", person.id, [APOLLO({ "person.title": "VP Sales" })]);
    const result = await apply(run.id, person.updatedAt, [
      { canonicalKey: "person.title", value: "VP Sales" },
    ]);

    expect(result.ok).toBe(true);
    const [after] = await h.db
      .select()
      .from(schema.persons)
      .where(eq(schema.persons.id, person.id));
    const fields = after?.customFields as Record<string, unknown>;
    expect(fields[active.key]).toBe("VP Sales");
    expect(fields[archived.key]).toBe("kept from 2024");
  });

  // The custom write happens after the built-in one. Returning an error from the transaction
  // callback resolves it, so without an explicit rollback the built-in change commits while the
  // caller is told nothing was applied and no change log or run stamp is written.
  it("rolls the built-in write back when a custom value is rejected", async () => {
    const active = await seedDef("organization");
    const [org] = await h.db
      .insert(schema.organizations)
      .values({ name: `Acme-${uniq()}`, ownerId: admin.id, visibilityLevel: "all" })
      .returning();
    if (org === undefined) throw new Error("no org row");
    await upsertMapping(
      h.db,
      "organization",
      "org.description",
      { kind: "custom", fieldDefId: active.id },
      SIG(),
    );

    // A text custom field caps at 255 characters. The planner does not know the target's limit,
    // so this reaches the repo and is rejected there, after the industry column is written.
    const tooLong = "x".repeat(300);
    const run = await seedRun("organization", org.id, [
      APOLLO({ "org.industry": "Aerospace", "org.description": tooLong }),
    ]);
    const result = await apply(run.id, org.updatedAt, [
      { canonicalKey: "org.industry", value: "Aerospace" },
      { canonicalKey: "org.description", value: tooLong },
    ]);

    expect(result.ok).toBe(false);
    const [after] = await h.db
      .select()
      .from(schema.organizations)
      .where(eq(schema.organizations.id, org.id));
    expect(after?.industry ?? null).toBeNull();
    expect(after?.updatedAt.toISOString()).toBe(org.updatedAt.toISOString());
    const [stamped] = await h.db
      .select()
      .from(schema.enrichmentRuns)
      .where(eq(schema.enrichmentRuns.id, run.id));
    expect(stamped?.appliedAt).toBeNull();
  });

  it("moves updatedAt so the dialog's next compare-and-swap sees the write", async () => {
    const active = await seedDef("organization");
    const [org] = await h.db
      .insert(schema.organizations)
      .values({ name: `Acme-${uniq()}`, ownerId: admin.id, visibilityLevel: "all" })
      .returning();
    if (org === undefined) throw new Error("no org row");
    await upsertMapping(
      h.db,
      "organization",
      "org.description",
      { kind: "custom", fieldDefId: active.id },
      SIG(),
    );

    const run = await seedRun("organization", org.id, [APOLLO({ "org.description": "Engines." })]);
    const result = await apply(run.id, org.updatedAt, [
      { canonicalKey: "org.description", value: "Engines." },
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Date.parse(result.value.entityUpdatedAtIso)).toBeGreaterThanOrEqual(
      org.updatedAt.getTime(),
    );
    const [after] = await h.db
      .select()
      .from(schema.organizations)
      .where(eq(schema.organizations.id, org.id));
    expect(after?.updatedAt.toISOString()).toBe(result.value.entityUpdatedAtIso);
  });

  // organizations.address is free-form jsonb and the demo seed writes `locality`. The org update
  // schema is a plain z.object, so it strips every key it does not know and updateOrg then replaces
  // the whole column: applying any address leaf deletes the rest.
  it("keeps an address key the update schema does not know", async () => {
    const [org] = await h.db
      .insert(schema.organizations)
      .values({
        name: `Acme-${uniq()}`,
        ownerId: admin.id,
        visibilityLevel: "all",
        address: { locality: "Shoreditch", city: "London" },
      })
      .returning();
    if (org === undefined) throw new Error("no org row");

    const run = await seedRun("organization", org.id, [
      APOLLO({ "org.country": "United Kingdom" }),
    ]);
    const result = await apply(run.id, org.updatedAt, [
      { canonicalKey: "org.country", value: "United Kingdom" },
    ]);

    expect(result.ok).toBe(true);
    const [after] = await h.db
      .select()
      .from(schema.organizations)
      .where(eq(schema.organizations.id, org.id));
    const address = after?.address as Record<string, unknown>;
    expect(address.country).toBe("United Kingdom");
    expect(address.city).toBe("London");
    expect(address.locality).toBe("Shoreditch");
  });
});
