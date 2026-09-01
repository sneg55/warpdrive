import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { seedUser } from "@/db/testing/factories";
import { makeTestDb, type TestDb } from "@/test/db";
import { seedDefaultMappings, upsertMapping } from "./mappingsRepo";
import { applyProspects } from "./prospectApply";
import {
  actorOf,
  outcomeFrom,
  personFingerprint,
  SIG,
  seedOrg,
  seedReveal,
  type UserRow,
} from "./prospectApplyTestKit";

let h: TestDb;
let admin: UserRow;

beforeAll(async () => {
  h = await makeTestDb();
  admin = await seedUser(h.db, { isAdmin: true });
  await seedDefaultMappings(h.db, SIG());
});
afterAll(async () => {
  await h.close();
});

async function seedTitleCustomField() {
  const [def] = await h.db
    .insert(schema.customFieldDefs)
    .values({
      targetEntity: "person",
      type: "text",
      name: `Title ${Math.random().toString(36).slice(2)}`,
      key: `title_${Math.random().toString(36).slice(2)}`,
    })
    .returning();
  if (def === undefined) throw new Error("no custom field def");
  const mapped = await upsertMapping(
    h.db,
    "person",
    "person.title",
    { kind: "custom", fieldDefId: def.id },
    SIG(),
  );
  expect(mapped.ok).toBe(true);
  return def;
}

describe("applyProspects create branch, create-only actor", () => {
  it("completes the create for an actor with contact.create but no contact.edit", async () => {
    const titleField = await seedTitleCustomField();
    const org = await seedOrg(h.db, admin.id);
    const creator = await seedUser(h.db);
    const batchId = crypto.randomUUID();
    await seedReveal(h.db, {
      orgId: org.id,
      requestedBy: creator.id,
      batchId,
      providerRef: "ref-create-only",
      outcomes: [
        outcomeFrom("apollo", {
          "person.email": "ada@create-only.test",
          "person.title": "Founder",
        }),
      ],
    });

    const result = await applyProspects(
      h.db,
      actorOf(creator, ["contact.create"]),
      {
        orgId: org.id,
        batchId,
        mappingsFingerprint: await personFingerprint(h.db),
        items: [
          {
            providerRef: "ref-create-only",
            selections: [
              { canonicalKey: "person.email", value: "ada@create-only.test" },
              { canonicalKey: "person.title", value: "Founder" },
            ],
            existing: null,
          },
        ],
      },
      new Date(),
      SIG(),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value[0]?.result).toEqual({
      ok: true,
      personId: expect.any(String),
      appliedFields: ["person.email", "person.title"],
    });
    const personId = result.value[0]?.result.ok === true ? result.value[0].result.personId : "";
    const [person] = await h.db
      .select()
      .from(schema.persons)
      .where(eq(schema.persons.id, personId));
    expect(person?.emails.map((e) => e.value)).toContain("ada@create-only.test");
    const fields = person?.customFields as Record<string, unknown>;
    expect(fields[titleField.key]).toBe("Founder");
  });
});
