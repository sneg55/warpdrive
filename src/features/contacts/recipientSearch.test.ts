import { describe, expect, it } from "vitest";
import { RECIPIENT_SEARCH_LIMIT, RECIPIENT_SEARCH_SCAN } from "@/constants/email";
import { persons } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import type { ContactActor } from "./personsRepo";
import { searchRecipients } from "./recipientSearch";

type TestDb = Parameters<Parameters<typeof withTestDb>[0]>[0];

const sig = () => new AbortController().signal;

function actorOf(id: string): ContactActor {
  return {
    id,
    type: "regular",
    isActive: true,
    groupIds: new Set(),
    flags: new Set(),
    primaryVisibilityGroupId: null,
  };
}

async function seedPerson(
  db: TestDb,
  o: {
    name: string;
    ownerId: string;
    primaryEmail?: string | null;
    emails?: string[];
    visibilityLevel?: "owner" | "all";
    deleted?: boolean;
  },
): Promise<void> {
  const primary = o.primaryEmail === undefined ? `${o.name.toLowerCase()}@ex.com` : o.primaryEmail;
  const emails = o.emails ?? (primary === null ? [] : [primary]);
  await db.insert(persons).values({
    name: o.name,
    primaryEmail: primary,
    emails: emails.map((value, i) => ({ label: "work", value, primary: i === 0 })),
    phones: [],
    orgId: null,
    ownerId: o.ownerId,
    visibilityLevel: o.visibilityLevel ?? "all",
    visibilityGroupId: null,
    customFields: {},
    deletedAt: o.deleted === true ? new Date() : null,
  });
}

describe("searchRecipients", () => {
  it("finds a person by part of the name, case-insensitively, past the first 500 by name", async () => {
    await withTestDb(async (db) => {
      const me = await seedUser(db);
      await db.insert(persons).values(
        Array.from({ length: 520 }, (_, i) => ({
          name: `Aaron ${String(i).padStart(3, "0")}`,
          primaryEmail: `aaron${String(i)}@ex.com`,
          emails: [],
          phones: [],
          orgId: null,
          ownerId: me.id,
          visibilityLevel: "all" as const,
          visibilityGroupId: null,
          customFields: {},
        })),
      );
      await seedPerson(db, { name: "Martin Kowalski", ownerId: me.id });
      const r = await searchRecipients(db, actorOf(me.id), "mart", sig());
      expect(r).toEqual([
        { personId: expect.any(String), name: "Martin Kowalski", email: "martin kowalski@ex.com" },
      ]);
    });
  });

  it("matches any of a person's addresses and lists each address", async () => {
    await withTestDb(async (db) => {
      const me = await seedUser(db);
      await seedPerson(db, {
        name: "Dana",
        ownerId: me.id,
        primaryEmail: "dana@work.com",
        emails: ["dana@work.com", "dana.home@mail.com"],
      });
      expect(
        (await searchRecipients(db, actorOf(me.id), "home@", sig())).map((o) => o.email),
      ).toEqual(["dana.home@mail.com"]);
      expect(
        (await searchRecipients(db, actorOf(me.id), "dana", sig())).map((o) => o.email),
      ).toEqual(["dana@work.com", "dana.home@mail.com"]);
    });
  });

  it("skips people the actor cannot see, deleted people and people with no address", async () => {
    await withTestDb(async (db) => {
      const me = await seedUser(db);
      const other = await seedUser(db);
      await seedPerson(db, { name: "Mia Visible", ownerId: me.id });
      await seedPerson(db, { name: "Mia Hidden", ownerId: other.id, visibilityLevel: "owner" });
      await seedPerson(db, { name: "Mia Deleted", ownerId: me.id, deleted: true });
      await seedPerson(db, { name: "Mia Nomail", ownerId: me.id, primaryEmail: null });
      const r = await searchRecipients(db, actorOf(me.id), "mia", sig());
      expect(r.map((o) => o.name)).toEqual(["Mia Visible"]);
    });
  });

  it("treats % and _ in the query as literal characters, and ignores address labels", async () => {
    await withTestDb(async (db) => {
      const me = await seedUser(db);
      await seedPerson(db, { name: "Percy", ownerId: me.id });
      expect(await searchRecipients(db, actorOf(me.id), "%", sig())).toEqual([]);
      expect(await searchRecipients(db, actorOf(me.id), "_", sig())).toEqual([]);
      expect(await searchRecipients(db, actorOf(me.id), "work", sig())).toEqual([]);
    });
  });

  it("ranks names that start with the text first, then a word that starts with it", async () => {
    await withTestDb(async (db) => {
      const me = await seedUser(db);
      await seedPerson(db, { name: "Abe Smartin", ownerId: me.id });
      await seedPerson(db, { name: "Bea Martin", ownerId: me.id });
      await seedPerson(db, { name: "Martin Zed", ownerId: me.id });
      const r = await searchRecipients(db, actorOf(me.id), "martin", sig());
      expect(r.map((o) => o.name)).toEqual(["Martin Zed", "Bea Martin", "Abe Smartin"]);
    });
  });

  it("keeps scanning past a full batch of people the actor cannot see", async () => {
    await withTestDb(async (db) => {
      const me = await seedUser(db);
      const other = await seedUser(db);
      await db.insert(persons).values(
        Array.from({ length: RECIPIENT_SEARCH_SCAN + 5 }, (_, i) => ({
          name: `Nora Hidden ${String(i).padStart(3, "0")}`,
          primaryEmail: `nora${String(i)}@ex.com`,
          emails: [],
          phones: [],
          orgId: null,
          ownerId: other.id,
          visibilityLevel: "owner" as const,
          visibilityGroupId: null,
          customFields: {},
        })),
      );
      await seedPerson(db, { name: "Nora Visible", ownerId: me.id });
      const r = await searchRecipients(db, actorOf(me.id), "nora", sig());
      expect(r.map((o) => o.name)).toEqual(["Nora Visible"]);
    });
  });

  it("leaves out excluded addresses before applying the limit", async () => {
    await withTestDb(async (db) => {
      const me = await seedUser(db);
      for (let i = 1; i <= RECIPIENT_SEARCH_LIMIT + 2; i++)
        await seedPerson(db, { name: `Ivy ${String(i).padStart(2, "0")}`, ownerId: me.id });
      const firstPage = await searchRecipients(db, actorOf(me.id), "ivy", sig());
      const r = await searchRecipients(
        db,
        actorOf(me.id),
        "ivy",
        sig(),
        firstPage.map((o) => o.email.toUpperCase()),
      );
      expect(r.map((o) => o.name)).toEqual(["Ivy 11", "Ivy 12"]);
    });
  });

  it("returns at most the suggestion limit, sorted by name", async () => {
    await withTestDb(async (db) => {
      const me = await seedUser(db);
      for (let i = RECIPIENT_SEARCH_LIMIT + 3; i > 0; i--)
        await seedPerson(db, { name: `Sam ${String(i).padStart(2, "0")}`, ownerId: me.id });
      const r = await searchRecipients(db, actorOf(me.id), "sam", sig());
      expect(r).toHaveLength(RECIPIENT_SEARCH_LIMIT);
      expect(r[0]?.name).toBe("Sam 01");
    });
  });
});
