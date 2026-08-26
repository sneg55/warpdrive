import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { PermissionFlagKey } from "@/constants/permissionFlags";
import * as schema from "@/db/schema";
import { toContactActor } from "@/features/contacts/actorAdapters";
import { encryptToken } from "@/features/email/crypto";
import { seedUser, toActor } from "@/features/stats/statsTestHelpers";
import { makeTestDb, type TestDb } from "@/test/db";
import { seedDefaultMappings } from "./mappingsRepo";
import type { EnrichmentProvider, ProviderId } from "./providers/types";
import { runEnrichment } from "./service";

let h: TestDb;
let admin: typeof schema.users.$inferSelect;
let owner: typeof schema.users.$inferSelect;

const SIG = (): AbortSignal => AbortSignal.timeout(20_000);
const NOW = new Date("2026-08-24T12:00:00.000Z");
const uniq = (): string => Math.random().toString(36).slice(2);

beforeAll(async () => {
  h = await makeTestDb();
  admin = await seedUser(h, { isAdmin: true });
  owner = await seedUser(h);
  await seedDefaultMappings(h.db, SIG());
  await h.db.insert(schema.enrichmentProviders).values({
    provider: "apollo",
    enabled: true,
    apiKeyEncrypted: encryptToken("key-apollo"),
    apiKeyHint: "olo1",
  });
});
afterAll(async () => {
  await h.close();
});

const answers = (id: ProviderId): EnrichmentProvider => ({
  id,
  matchPerson: () =>
    Promise.resolve({
      provider: id,
      kind: "ok" as const,
      candidate: { fields: { "person.companyName": "Initech" } },
    }),
  matchOrganization: () => Promise.resolve({ provider: id, kind: "no_match" as const }),
});

const FLAGS: PermissionFlagKey[] = ["contact.edit_own"];

describe("runEnrichment with a link the actor cannot see", () => {
  // The company value reads as null whether the person has no organization or one outside the
  // actor's visibility. Treating the second as a gap checks the row by default, and applying it
  // moves the link to a company the user picked without ever knowing one was there.
  it("proposes the company as an unchecked overwrite rather than a gap", async () => {
    const [hidden] = await h.db
      .insert(schema.organizations)
      .values({
        name: `Hidden-${uniq()}`,
        ownerId: admin.id,
        visibilityLevel: "owner",
      })
      .returning();
    if (hidden === undefined) throw new Error("no org row");
    const [person] = await h.db
      .insert(schema.persons)
      .values({
        name: `Pat ${uniq()}`,
        ownerId: owner.id,
        visibilityLevel: "all",
        primaryEmail: `pat-${uniq()}@initech.test`,
        orgId: hidden.id,
      })
      .returning();
    if (person === undefined) throw new Error("no person row");

    const actor = { ...toActor(owner), flags: new Set(FLAGS) };
    const result = await runEnrichment(
      h.db,
      toContactActor(actor),
      { entityType: "person", entityId: person.id },
      NOW,
      SIG(),
      answers,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const company = result.value.fields.find((f) => f.canonicalKey === "person.companyName");
    expect(company?.isOverwrite).toBe(true);
    expect(company?.defaultSelected).toBe(false);
    // The name itself is never disclosed, only the fact that something is there.
    expect(company?.currentValue).toBeNull();
  });

  it("still offers the company as a gap when the person has no organization", async () => {
    const [person] = await h.db
      .insert(schema.persons)
      .values({
        name: `Pat ${uniq()}`,
        ownerId: owner.id,
        visibilityLevel: "all",
        primaryEmail: `pat-${uniq()}@initech.test`,
        orgId: null,
      })
      .returning();
    if (person === undefined) throw new Error("no person row");

    const actor = { ...toActor(owner), flags: new Set(FLAGS) };
    const result = await runEnrichment(
      h.db,
      toContactActor(actor),
      { entityType: "person", entityId: person.id },
      NOW,
      SIG(),
      answers,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const company = result.value.fields.find((f) => f.canonicalKey === "person.companyName");
    expect(company?.isOverwrite).toBe(false);
    expect(company?.defaultSelected).toBe(true);
  });
});
