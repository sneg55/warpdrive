import { expect, it } from "vitest";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import { type ContactActor, createPerson } from "@/features/contacts/personsRepo";
import { findCandidates } from "./dedup";

function actorFor(id: string): ContactActor {
  return {
    id,
    type: "regular",
    isActive: true,
    groupIds: new Set<string>(),
    flags: new Set(),
    primaryVisibilityGroupId: null,
  };
}

it("returns none when no visible candidate shares the email", async () => {
  await withTestDb(async (db) => {
    const signal = new AbortController().signal;
    const importer = actorFor((await seedUser(db)).id);

    const r = await findCandidates(
      db,
      importer,
      "person",
      { emails: [{ label: "work", value: "new@a.com", primary: true }] },
      signal,
    );
    expect(r.outcome).toBe("none");
  });
});

it("returns one for a single visible match (case-insensitive email)", async () => {
  await withTestDb(async (db) => {
    const signal = new AbortController().signal;
    const importer = actorFor((await seedUser(db)).id);

    await createPerson(
      db,
      importer,
      {
        name: "Jane",
        emails: [{ label: "work", value: "JANE@A.com", primary: true }],
        phones: [],
        orgId: null,
        customFields: {},
      },
      signal,
    );

    const r = await findCandidates(
      db,
      importer,
      "person",
      { emails: [{ label: "work", value: "jane@a.com", primary: true }] },
      signal,
    );
    expect(r.outcome).toBe("one");
  });
});

it("does NOT count a hidden candidate (preserves 404-on-invisible)", async () => {
  await withTestDb(async (db) => {
    const signal = new AbortController().signal;
    const importer = actorFor((await seedUser(db)).id);
    const other = actorFor((await seedUser(db)).id);

    // owner-level person owned by `other`: importer cannot see it.
    await createPerson(
      db,
      other,
      {
        name: "Secret",
        emails: [{ label: "work", value: "dup@a.com", primary: true }],
        phones: [],
        orgId: null,
        customFields: {},
      },
      signal,
    );

    const r = await findCandidates(
      db,
      importer,
      "person",
      { emails: [{ label: "work", value: "dup@a.com", primary: true }] },
      signal,
    );
    expect(r.outcome).toBe("none"); // hidden candidate not surfaced
  });
});

it("returns ambiguous for >1 visible match", async () => {
  await withTestDb(async (db) => {
    const signal = new AbortController().signal;
    const importer = actorFor((await seedUser(db)).id);

    await createPerson(
      db,
      importer,
      {
        name: "A",
        emails: [{ label: "work", value: "amb@a.com", primary: true }],
        phones: [],
        orgId: null,
        customFields: {},
      },
      signal,
    );
    await createPerson(
      db,
      importer,
      {
        name: "B",
        emails: [{ label: "work", value: "amb@a.com", primary: true }],
        phones: [],
        orgId: null,
        customFields: {},
      },
      signal,
    );

    const r = await findCandidates(
      db,
      importer,
      "person",
      { emails: [{ label: "work", value: "amb@a.com", primary: true }] },
      signal,
    );
    expect(r.outcome).toBe("ambiguous");
    if (r.outcome === "ambiguous") expect(r.count).toBe(2);
  });
});
