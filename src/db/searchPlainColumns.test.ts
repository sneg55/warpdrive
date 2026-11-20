import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  actorOf,
  addActivity,
  addDeal,
  addNote,
  addPersonalMailbox,
  addThread,
  run,
  seedWorld,
} from "@/features/search/search.test-helpers";
import * as schema from "./schema";
import { withTestDb } from "./testing";
import { withLoggedTestDb } from "./testing/queryLog";

describe("stored plain-text columns", () => {
  it("email_messages.body_html_plain strips tags and decodes entities", async () => {
    await withTestDb(async (db) => {
      const w = await seedWorld(db);
      const accountId = await addPersonalMailbox(db, w.alice.id);
      const threadId = await addThread(db, {
        accountId,
        message: { bodyHtml: "<div>R&amp;D<br>  <b>plan</b></div>" },
      });
      const [m] = await db
        .select({ plain: schema.emailMessages.bodyHtmlPlain })
        .from(schema.emailMessages)
        .where(eq(schema.emailMessages.threadId, threadId));
      expect(m?.plain).toBe("R&D plan");
    });
  });

  it("notes.body_plain follows updates to body", async () => {
    await withTestDb(async (db) => {
      const w = await seedWorld(db);
      const deal = await addDeal(db, w, "Deal");
      const id = await addNote(db, w, "deal", deal, "<p>one</p>");
      await db
        .update(schema.notes)
        .set({ body: "<p>two &lt; three</p>" })
        .where(eq(schema.notes.id, id));
      const [n] = await db
        .select({ plain: schema.notes.bodyPlain })
        .from(schema.notes)
        .where(eq(schema.notes.id, id));
      expect(n?.plain).toBe("two < three");
    });
  });

  it("activities.note_plain is null when the note is null", async () => {
    await withTestDb(async (db) => {
      const w = await seedWorld(db);
      const deal = await addDeal(db, w, "Deal");
      await addActivity(db, w, "Subject", { dealId: deal });
      const [a] = await db.select({ plain: schema.activities.notePlain }).from(schema.activities);
      expect(a?.plain).toBeNull();
    });
  });
});

describe("content sources read the stored columns", () => {
  it("finds and snippets HTML content without calling search_plain_text", async () => {
    await withLoggedTestDb(async (db, _params, queries) => {
      const w = await seedWorld(db);
      const accountId = await addPersonalMailbox(db, w.alice.id);
      const deal = await addDeal(db, w, "Deal");
      await addThread(db, {
        accountId,
        dealId: deal,
        message: { bodyHtml: "<p>storedemailterm &amp; more</p>" },
      });
      await addNote(db, w, "deal", deal, "<p>storednoteterm</p>");
      await addActivity(db, w, "Subject", { dealId: deal, note: "<i>storedactterm</i>" });
      const actor = actorOf(w.alice.id);
      const email = await run(db, actor, "storedemailterm");
      expect(email.deals[0]?.match).toMatchObject({
        source: "email",
        snippet: "storedemailterm & more",
      });
      const note = await run(db, actor, "storednoteterm");
      expect(note.deals[0]?.match).toMatchObject({ source: "note", snippet: "storednoteterm" });
      const act = await run(db, actor, "storedactterm");
      expect(act.deals[0]?.match).toMatchObject({ source: "activity", snippet: "storedactterm" });
      const searchQueries = queries.filter((q) => q.includes("ILIKE"));
      expect(searchQueries.length).toBeGreaterThan(0);
      for (const q of searchQueries) expect(q).not.toContain("search_plain_text");
    });
  });
});
