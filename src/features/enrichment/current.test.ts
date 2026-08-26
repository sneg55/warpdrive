import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { seedUser } from "@/features/stats/statsTestHelpers";
import { makeTestDb, type TestDb } from "@/test/db";
import { readOrgCurrent, readPersonCurrent } from "./current";
import { listMappings, seedDefaultMappings } from "./mappingsRepo";
import type { ResolvedMapping } from "./types";

let h: TestDb;
let admin: typeof schema.users.$inferSelect;
let personMappings: ResolvedMapping[];

const SIG = (): AbortSignal => AbortSignal.timeout(20_000);
const EMAIL_KEY = "person.email";

type ContactPoint = { label: string; value: string; primary?: boolean };

beforeAll(async () => {
  h = await makeTestDb();
  admin = await seedUser(h, { isAdmin: true });
  await seedDefaultMappings(h.db, SIG());
  personMappings = await listMappings(h.db, "person", SIG());
});
afterAll(async () => {
  await h.close();
});

async function seedPerson(values: Partial<typeof schema.persons.$inferInsert> = {}) {
  const [row] = await h.db
    .insert(schema.persons)
    .values({
      name: `Jane-${Math.random().toString(36).slice(2)}`,
      ownerId: admin.id,
      visibilityLevel: "all",
      ...values,
    })
    .returning();
  if (row === undefined) throw new Error("no person row");
  return row;
}

function stored(values: Record<string, readonly string[]>, key: string): readonly string[] {
  return values[key] ?? [];
}

describe("readPersonCurrent", () => {
  it("reports every stored address for the emails target, not only the primary", async () => {
    const emails: ContactPoint[] = [
      { label: "work", value: "jane@acme.com", primary: true },
      { label: "other", value: "j.doe@acme.com" },
    ];
    const person = await seedPerson({ primaryEmail: "jane@acme.com", emails });

    const current = await readPersonCurrent(h.db, person, personMappings, SIG());

    expect(stored(current.multiValues, EMAIL_KEY)).toEqual(["jane@acme.com", "j.doe@acme.com"]);
    expect(current.canonicalValues[EMAIL_KEY]).toBe("jane@acme.com");
  });

  // The secondary address is the case the primary-only read got wrong: it is already on the record,
  // so a provider returning it has nothing new to offer.
  it("counts a secondary address as already held, whatever its case", async () => {
    const emails: ContactPoint[] = [
      { label: "work", value: "jane@acme.com", primary: true },
      { label: "other", value: "J.Doe@Acme.com" },
    ];
    const person = await seedPerson({ primaryEmail: "jane@acme.com", emails });

    const current = await readPersonCurrent(h.db, person, personMappings, SIG());
    const held = stored(current.multiValues, EMAIL_KEY).map((v) => v.toLowerCase());

    expect(held).toContain("j.doe@acme.com");
  });

  it("falls back to a stored address when the record carries no primary", async () => {
    const emails: ContactPoint[] = [{ label: "work", value: "solo@acme.com" }];
    const person = await seedPerson({ primaryEmail: null, emails });

    const current = await readPersonCurrent(h.db, person, personMappings, SIG());

    expect(stored(current.multiValues, EMAIL_KEY)).toEqual(["solo@acme.com"]);
    expect(current.canonicalValues[EMAIL_KEY]).toBe("solo@acme.com");
  });

  it("lists a primary that the contact-point array does not repeat, exactly once", async () => {
    const emails: ContactPoint[] = [{ label: "work", value: "JANE@acme.com", primary: true }];
    const person = await seedPerson({ primaryEmail: "jane@acme.com", emails });

    const current = await readPersonCurrent(h.db, person, personMappings, SIG());

    expect(stored(current.multiValues, EMAIL_KEY)).toHaveLength(1);
  });

  it("reports no stored address at all for a person with none", async () => {
    const person = await seedPerson({ primaryEmail: null, emails: [] });

    const current = await readPersonCurrent(h.db, person, personMappings, SIG());

    expect(stored(current.multiValues, EMAIL_KEY)).toEqual([]);
    expect(current.canonicalValues[EMAIL_KEY]).toBeNull();
  });
});

describe("readOrgCurrent", () => {
  it("reads the built-in columns and holds no multi-valued target", async () => {
    const [org] = await h.db
      .insert(schema.organizations)
      .values({
        name: `Acme-${Math.random().toString(36).slice(2)}`,
        domain: "acme.com",
        ownerId: admin.id,
        visibilityLevel: "all",
      })
      .returning();
    if (org === undefined) throw new Error("no org row");
    const mappings = await listMappings(h.db, "organization", SIG());

    const current = await readOrgCurrent(h.db, org, mappings, SIG());

    expect(current.canonicalValues["org.domain"]).toBe("acme.com");
    expect(current.multiValues).toEqual({});
  });
});

// A sentinel here would make a provider returning the company's real name look like an overwrite,
// would be written into the change log as the value replaced, and would be handed to providers as
// the company to match against.
describe("the linked company value", () => {
  it("reports the organization's real name, not a placeholder", async () => {
    const person = await seedPerson();
    const current = await readPersonCurrent(h.db, person, personMappings, SIG(), {
      name: "Acme Inc",
      domain: "acme.com",
    });
    expect(current.canonicalValues["person.companyName"]).toBe("Acme Inc");
  });

  it("reports no company when the caller could not see the linked organization", async () => {
    const person = await seedPerson();
    const current = await readPersonCurrent(h.db, person, personMappings, SIG(), null);
    expect(current.canonicalValues["person.companyName"]).toBeNull();
  });
});

// A person can be linked to an organization the actor is not allowed to see. The company value
// reads as null either way, so without this the merge cannot tell that link from no link at all.
describe("readPersonCurrent occupied targets", () => {
  it("reports the company target as occupied when the link is hidden from the actor", async () => {
    const person = await seedPerson({ orgId: (await seedHiddenOrg()).id });
    const current = await readPersonCurrent(h.db, person, personMappings, SIG(), null);

    expect(current.canonicalValues["person.companyName"]).toBeNull();
    expect(current.occupiedKeys).toContain("person.companyName");
  });

  it("reports nothing occupied when the person has no organization at all", async () => {
    const person = await seedPerson({ orgId: null });
    const current = await readPersonCurrent(h.db, person, personMappings, SIG(), null);

    expect(current.occupiedKeys).not.toContain("person.companyName");
  });

  it("reports nothing occupied when the actor can see the link", async () => {
    const org = await seedHiddenOrg();
    const person = await seedPerson({ orgId: org.id });
    const current = await readPersonCurrent(h.db, person, personMappings, SIG(), {
      name: org.name,
      domain: null,
    });

    expect(current.canonicalValues["person.companyName"]).toBe(org.name);
    expect(current.occupiedKeys).not.toContain("person.companyName");
  });
});

async function seedHiddenOrg() {
  const [row] = await h.db
    .insert(schema.organizations)
    .values({
      name: `Hidden-${Math.random().toString(36).slice(2)}`,
      ownerId: admin.id,
      visibilityLevel: "owner",
    })
    .returning();
  if (row === undefined) throw new Error("no org row");
  return row;
}

// person.companyDomain usually has no target of its own, but an admin may map it onto a real one.
// Reading the linked organization's domain regardless made a populated target look empty, so the
// row was checked by default and the apply overwrote it with no warning.
describe("readPersonCurrent companyDomain with a target of its own", () => {
  const mapped = (targetKey: string): ResolvedMapping[] => [
    {
      canonicalKey: "person.companyDomain",
      label: "Company domain",
      targetKind: "builtin",
      targetKey,
      targetFieldDefId: null,
    },
  ];

  it("reads the target the mapping names, not the linked organization", async () => {
    const person = await seedPerson({ name: "Ada Lovelace" });
    const current = await readPersonCurrent(h.db, person, mapped("name"), SIG(), {
      name: "Analytical Engines",
      domain: "analyticalengines.test",
    });

    expect(current.canonicalValues["person.companyDomain"]).toBe("Ada Lovelace");
  });

  it("still reads nothing when the named target holds nothing", async () => {
    const person = await seedPerson();
    const current = await readPersonCurrent(h.db, person, mapped("emails"), SIG(), null);

    expect(current.canonicalValues["person.companyDomain"]).toBeNull();
  });
});

describe("readPersonCurrent: name parts", () => {
  const partMapping = (canonicalKey: string, targetKey: string): ResolvedMapping[] => [
    { canonicalKey, label: targetKey, targetKind: "builtin", targetKey, targetFieldDefId: null },
  ];

  it("reports the stored part so the merge sees an overwrite, not a gap", async () => {
    const person = await seedPerson({
      name: "Ada Lovelace",
      firstName: "Ada",
      lastName: "Lovelace",
    });

    const first = await readPersonCurrent(
      h.db,
      person,
      partMapping("person.firstName", "firstName"),
      SIG(),
    );
    const last = await readPersonCurrent(
      h.db,
      person,
      partMapping("person.lastName", "lastName"),
      SIG(),
    );

    expect(first.canonicalValues["person.firstName"]).toBe("Ada");
    expect(last.canonicalValues["person.lastName"]).toBe("Lovelace");
  });
});
