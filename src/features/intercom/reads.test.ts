import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { ERROR_IDS } from "@/constants/errorIds";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import { getSupportConversationParts } from "./parts";
import { listSupportConversations } from "./reads";
import {
  actorOf,
  SIG,
  seedConversation,
  seedDeal,
  seedLead,
  seedPerson,
} from "./seed.test-helpers";

describe("listSupportConversationsForPerson", () => {
  it("matches on the primary email or any email entry, case and space insensitive", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const person = await seedPerson(db, {
        ownerId: owner.id,
        email: " Pat@Example.com",
        emails: ["pat.alt@example.com"],
      });
      await seedConversation(db, { id: "c1", contactEmails: ["pat@example.com"] });
      await seedConversation(db, { id: "c2", contactEmails: [null, "pat.alt@example.com"] });
      await seedConversation(db, { id: "c3", contactEmails: ["someone@example.com"] });
      const rows = await listSupportConversations(
        db,
        actorOf(owner.id),
        { kind: "person", personId: person },
        SIG(),
      );
      expect(rows.map((r) => r.id).sort()).toEqual(["c1", "c2"]);
    });
  });

  it("shows a conversation synced before the person existed, and drops it when the email changes", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      await seedConversation(db, { id: "c1", contactEmails: ["late@example.com"] });
      const person = await seedPerson(db, { ownerId: owner.id, email: "late@example.com" });
      const actor = actorOf(owner.id);
      expect(
        await listSupportConversations(db, actor, { kind: "person", personId: person }, SIG()),
      ).toHaveLength(1);
      await db.execute(
        sql`UPDATE persons SET primary_email = 'moved@example.com' WHERE id = ${person}`,
      );
      expect(
        await listSupportConversations(db, actor, { kind: "person", personId: person }, SIG()),
      ).toHaveLength(0);
    });
  });

  it("ignores noreply addresses and deleted persons", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const robot = await seedPerson(db, { ownerId: owner.id, email: "no-reply@example.com" });
      await seedConversation(db, { id: "c1", contactEmails: ["no-reply@example.com"] });
      expect(
        await listSupportConversations(
          db,
          actorOf(owner.id),
          { kind: "person", personId: robot },
          SIG(),
        ),
      ).toEqual([]);
      const gone = await seedPerson(db, { ownerId: owner.id, email: "gone@example.com" });
      await seedConversation(db, { id: "c2", contactEmails: ["gone@example.com"] });
      await db.execute(sql`UPDATE persons SET deleted_at = now() WHERE id = ${gone}`);
      expect(
        await listSupportConversations(
          db,
          actorOf(owner.id),
          { kind: "person", personId: gone },
          SIG(),
        ),
      ).toEqual([]);
    });
  });

  it("returns nothing to a user who cannot see the person", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const other = await seedUser(db);
      const person = await seedPerson(db, {
        ownerId: owner.id,
        email: "pat@example.com",
        level: "owner",
      });
      await seedConversation(db, { id: "c1", contactEmails: ["pat@example.com"] });
      expect(
        await listSupportConversations(
          db,
          actorOf(other.id),
          { kind: "person", personId: person },
          SIG(),
        ),
      ).toEqual([]);
      expect(
        await listSupportConversations(
          db,
          actorOf(owner.id),
          { kind: "person", personId: person },
          SIG(),
        ),
      ).toHaveLength(1);
    });
  });
});

describe("listSupportConversationsForDeal", () => {
  it("includes the deal person and participants, once each", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const main = await seedPerson(db, { ownerId: owner.id, email: "main@example.com" });
      const guest = await seedPerson(db, { ownerId: owner.id, email: "guest@example.com" });
      const deal = await seedDeal(db, { ownerId: owner.id, personId: main });
      await db.execute(
        sql`INSERT INTO deal_participants (deal_id, person_id) VALUES (${deal}, ${guest})`,
      );
      await seedConversation(db, {
        id: "c1",
        contactEmails: ["main@example.com", "guest@example.com"],
      });
      await seedConversation(db, { id: "c2", contactEmails: ["guest@example.com"] });
      const rows = await listSupportConversations(
        db,
        actorOf(owner.id),
        { kind: "deal", dealId: deal },
        SIG(),
      );
      expect(rows.map((r) => r.id).sort()).toEqual(["c1", "c2"]);
    });
  });

  it("hides a person's conversations from a user who sees the deal but not the person", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const viewer = await seedUser(db);
      const hidden = await seedPerson(db, {
        ownerId: owner.id,
        email: "hidden@example.com",
        level: "owner",
      });
      const deal = await seedDeal(db, { ownerId: owner.id, personId: hidden });
      await seedConversation(db, { id: "c1", contactEmails: ["hidden@example.com"] });
      expect(
        await listSupportConversations(
          db,
          actorOf(viewer.id),
          { kind: "deal", dealId: deal },
          SIG(),
        ),
      ).toEqual([]);
      expect(
        await listSupportConversations(
          db,
          actorOf(owner.id),
          { kind: "deal", dealId: deal },
          SIG(),
        ),
      ).toHaveLength(1);
    });
  });

  it("returns nothing for a deal the user cannot see", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const viewer = await seedUser(db);
      const person = await seedPerson(db, { ownerId: owner.id, email: "pat@example.com" });
      const deal = await seedDeal(db, { ownerId: owner.id, personId: person, level: "owner" });
      await seedConversation(db, { id: "c1", contactEmails: ["pat@example.com"] });
      expect(
        await listSupportConversations(
          db,
          actorOf(viewer.id),
          { kind: "deal", dealId: deal },
          SIG(),
        ),
      ).toEqual([]);
    });
  });
});

describe("listSupportConversationsForLead", () => {
  it("resolves through the lead person and respects lead visibility", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const viewer = await seedUser(db);
      const person = await seedPerson(db, { ownerId: owner.id, email: "pat@example.com" });
      const lead = await seedLead(db, { ownerId: owner.id, personId: person });
      const privateLead = await seedLead(db, {
        ownerId: owner.id,
        personId: person,
        level: "owner",
      });
      await seedConversation(db, { id: "c1", contactEmails: ["pat@example.com"] });
      expect(
        await listSupportConversations(
          db,
          actorOf(viewer.id),
          { kind: "lead", leadId: lead },
          SIG(),
        ),
      ).toHaveLength(1);
      expect(
        await listSupportConversations(
          db,
          actorOf(viewer.id),
          { kind: "lead", leadId: privateLead },
          SIG(),
        ),
      ).toEqual([]);
    });
  });
});

describe("getSupportConversationParts", () => {
  it("returns only the opening message and public replies, sanitized", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const person = await seedPerson(db, { ownerId: owner.id, email: "pat@example.com" });
      await seedConversation(db, {
        id: "c1",
        contactEmails: ["pat@example.com"],
        parts: [
          {
            id: "source-c1",
            partType: "source",
            body: '<p onclick="x()">Hi</p><script>bad()</script>',
          },
          { id: "p1", partType: "comment" },
          { id: "p2", partType: "note", body: "<p>internal note</p>" },
          { id: "p3", partType: "some_future_type" },
        ],
      });
      const scope = { kind: "person" as const, personId: person };
      const r = await getSupportConversationParts(
        db,
        actorOf(owner.id),
        { conversationId: "c1", scope, allowRemote: false },
        SIG(),
      );
      expect(r.ok).toBe(true);
      if (!r.ok) return;
      expect(r.value.map((p) => p.id)).toEqual(["source-c1", "p1"]);
      expect(JSON.stringify(r.value)).not.toContain("internal note");
      expect(r.value[0]?.bodyHtml).not.toContain("script");
      expect(r.value[0]?.bodyHtml).not.toContain("onclick");
    });
  });

  it("denies a conversation outside the record or about a person the user cannot see", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db);
      const other = await seedUser(db);
      const hidden = await seedPerson(db, {
        ownerId: owner.id,
        email: "pat@example.com",
        level: "owner",
      });
      const open = await seedPerson(db, { ownerId: owner.id, email: "open@example.com" });
      await seedConversation(db, { id: "c1", contactEmails: ["pat@example.com"] });
      await seedConversation(db, { id: "c2", contactEmails: ["nobody@example.com"] });
      const cases = [
        { conversationId: "c1", personId: hidden },
        { conversationId: "c1", personId: open },
        { conversationId: "c2", personId: open },
        { conversationId: "missing", personId: open },
      ];
      for (const c of cases) {
        const r = await getSupportConversationParts(
          db,
          actorOf(other.id),
          {
            conversationId: c.conversationId,
            scope: { kind: "person", personId: c.personId },
            allowRemote: false,
          },
          SIG(),
        );
        expect(!r.ok && r.error.id).toBe(ERROR_IDS.INTERCOM_CONVERSATION_DENIED);
      }
    });
  });
});
