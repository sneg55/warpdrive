import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { brevoTrackedEmails } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import {
  seedContactCampaign,
  seedDeal,
  seedParticipant,
  seedPerson,
  trackedEmails,
} from "./seed.test-helpers";
import { trackEmails } from "./track";

const SIG = (): AbortSignal => new AbortController().signal;

describe("trackEmails", () => {
  it("tracks the primary and secondary emails of a deal person and a deal participant", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const main = await seedPerson(db, {
        ownerId: owner.id,
        email: " Main@Example.com",
        emails: ["alt@example.com"],
      });
      const guest = await seedPerson(db, { ownerId: owner.id, email: "guest@example.com" });
      const deal = await seedDeal(db, { ownerId: owner.id, personId: main });
      await seedParticipant(db, deal, guest);
      await trackEmails(db, SIG());
      expect(await trackedEmails(db)).toEqual([
        { email: "alt@example.com", active: true },
        { email: "guest@example.com", active: true },
        { email: "main@example.com", active: true },
      ]);
    });
  });

  it("skips persons with no deal, deleted persons, deleted deals and noreply addresses", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      await seedPerson(db, { ownerId: owner.id, email: "nodeal@example.com" });
      const gone = await seedPerson(db, { ownerId: owner.id, email: "gone@example.com" });
      await seedDeal(db, { ownerId: owner.id, personId: gone });
      await db.execute(sql`UPDATE persons SET deleted_at = now() WHERE id = ${gone}`);
      const robot = await seedPerson(db, { ownerId: owner.id, email: "no-reply@example.com" });
      await seedDeal(db, { ownerId: owner.id, personId: robot });
      const dealless = await seedPerson(db, {
        ownerId: owner.id,
        email: "deleted-deal@example.com",
      });
      const deal = await seedDeal(db, { ownerId: owner.id, personId: dealless });
      await db.execute(sql`UPDATE deals SET deleted_at = now() WHERE id = ${deal}`);
      await trackEmails(db, SIG());
      expect(await trackedEmails(db)).toEqual([]);
    });
  });

  it("deactivates an email when its deal is deleted, keeps its stored rows, and reactivates on relink", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const person = await seedPerson(db, { ownerId: owner.id, email: "pat@example.com" });
      const deal = await seedDeal(db, { ownerId: owner.id, personId: person });
      await seedContactCampaign(db, { email: "pat@example.com", campaignId: 1 });
      await trackEmails(db, SIG());
      await db.execute(sql`UPDATE deals SET deleted_at = now() WHERE id = ${deal}`);
      await trackEmails(db, SIG());
      expect(await trackedEmails(db)).toEqual([{ email: "pat@example.com", active: false }]);
      const stored = await db.execute(sql`SELECT count(*)::int AS n FROM brevo_contact_campaigns`);
      expect((stored.rows[0] as { n: number }).n).toBe(1);
      await db.execute(sql`UPDATE deals SET deleted_at = NULL WHERE id = ${deal}`);
      await trackEmails(db, SIG());
      expect(await trackedEmails(db)).toEqual([{ email: "pat@example.com", active: true }]);
    });
  });

  it("deactivates the old person's email after a person switch", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const first = await seedPerson(db, { ownerId: owner.id, email: "first@example.com" });
      const second = await seedPerson(db, { ownerId: owner.id, email: "second@example.com" });
      const deal = await seedDeal(db, { ownerId: owner.id, personId: first });
      await trackEmails(db, SIG());
      await db.execute(sql`UPDATE deals SET person_id = ${second} WHERE id = ${deal}`);
      await trackEmails(db, SIG());
      expect(await trackedEmails(db)).toEqual([
        { email: "first@example.com", active: false },
        { email: "second@example.com", active: true },
      ]);
    });
  });

  it("deactivates a participant's email after the participant is removed", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const guest = await seedPerson(db, { ownerId: owner.id, email: "guest@example.com" });
      const deal = await seedDeal(db, { ownerId: owner.id, personId: null });
      await seedParticipant(db, deal, guest);
      await trackEmails(db, SIG());
      await db.execute(sql`DELETE FROM deal_participants WHERE deal_id = ${deal}`);
      await trackEmails(db, SIG());
      expect(await trackedEmails(db)).toEqual([{ email: "guest@example.com", active: false }]);
    });
  });

  it("leaves sync state untouched for an email that stays tracked", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const person = await seedPerson(db, { ownerId: owner.id, email: "pat@example.com" });
      await seedDeal(db, { ownerId: owner.id, personId: person });
      await trackEmails(db, SIG());
      await db.update(brevoTrackedEmails).set({ coveredThrough: "2026-01-01" });
      await trackEmails(db, SIG());
      const [row] = await db.select().from(brevoTrackedEmails);
      expect(row?.coveredThrough).toBe("2026-01-01");
    });
  });
});
