import { describe, expect, it } from "vitest";
import * as schema from "@/db/schema";
import { withTestDb } from "@/db/testing";
import type { SearchResult } from "@/types/search";
import {
  actorOf,
  addActivity,
  addDeal,
  addLead,
  addNote,
  addOrg,
  addPerson,
  addPersonalMailbox,
  addThread,
  run,
  seedWorld,
  type TestDb,
  type World,
} from "./search.test-helpers";

type Section = "deals" | "people" | "leads" | "organizations";

function find(r: Record<Section, SearchResult[]>, s: Section, id: string): SearchResult {
  const hit = r[s].find((x) => x.id === id);
  if (hit === undefined) throw new Error(`${s} did not return ${id}`);
  return hit;
}

async function seedRecords(db: TestDb, w: World) {
  const org = await addOrg(db, w, "Orgname Alpha");
  const deal = await addDeal(db, w, "Dealname Alpha");
  const person = await addPerson(db, w, "Personname Alpha", { orgId: org });
  const lead = await addLead(db, w, "Leadname Alpha");
  return { org, deal, person, lead };
}

describe("note source", () => {
  it("finds every section through a note and labels it", async () => {
    await withTestDb(async (db) => {
      const w = await seedWorld(db);
      const ids = await seedRecords(db, w);
      await addNote(db, w, "deal", ids.deal, "<p>zorblax in a deal note</p>");
      await addNote(db, w, "person", ids.person, "quuxzap in a person note");
      await addNote(db, w, "lead", ids.lead, "frobnitz in a lead note");
      await addNote(db, w, "organization", ids.org, "wibblewomp in an org note");
      const a = actorOf(w.alice.id);

      const d = find(await run(db, a, "zorblax"), "deals", ids.deal);
      expect(d.match).toMatchObject({ source: "note", label: "Note" });
      expect(d.match?.snippet).toBe("zorblax in a deal note");
      expect(find(await run(db, a, "quuxzap"), "people", ids.person).match?.source).toBe("note");
      expect(find(await run(db, a, "frobnitz"), "leads", ids.lead).match?.source).toBe("note");
      expect(find(await run(db, a, "wibblewomp"), "organizations", ids.org).match?.source).toBe(
        "note",
      );
    });
  });
});

describe("comment source", () => {
  it("finds deal, person and organization through a comment but never a lead", async () => {
    await withTestDb(async (db) => {
      const w = await seedWorld(db);
      const ids = await seedRecords(db, w);
      const a = actorOf(w.alice.id);
      const pairs: Array<[string, "deal" | "person" | "organization", string]> = [
        ["commdealterm", "deal", ids.deal],
        ["commpersonterm", "person", ids.person],
        ["commorgterm", "organization", ids.org],
      ];
      for (const [term, type, id] of pairs) {
        const noteId = await addNote(db, w, type, id, "plain note");
        await db
          .insert(schema.comments)
          .values({ noteId, body: `reply ${term}`, authorId: w.bob.id });
      }
      const leadNote = await addNote(db, w, "lead", ids.lead, "plain note");
      await db
        .insert(schema.comments)
        .values({ noteId: leadNote, body: "commleadterm", authorId: w.bob.id });

      const d = find(await run(db, a, "commdealterm"), "deals", ids.deal);
      expect(d.match).toMatchObject({ source: "comment", label: "Comment" });
      expect(find(await run(db, a, "commpersonterm"), "people", ids.person).match?.source).toBe(
        "comment",
      );
      expect(find(await run(db, a, "commorgterm"), "organizations", ids.org).match?.source).toBe(
        "comment",
      );
      expect((await run(db, a, "commleadterm")).leads).toHaveLength(0);
    });
  });

  it("ignores a comment under a soft-deleted note", async () => {
    await withTestDb(async (db) => {
      const w = await seedWorld(db);
      const deal = await addDeal(db, w, "Dealname Alpha");
      const noteId = await addNote(db, w, "deal", deal, "plain", { deleted: true });
      await db.insert(schema.comments).values({ noteId, body: "ghostcomment", authorId: w.bob.id });
      expect((await run(db, actorOf(w.alice.id), "ghostcomment")).deals).toHaveLength(0);
    });
  });
});

describe("activity source", () => {
  it("finds every section through subject or note", async () => {
    await withTestDb(async (db) => {
      const w = await seedWorld(db);
      const ids = await seedRecords(db, w);
      await addActivity(db, w, "actdealsubject call", { dealId: ids.deal });
      await addActivity(db, w, "plain", { personId: ids.person, note: "<p>actpersonnote</p>" });
      await addActivity(db, w, "actleadsubject", { leadId: ids.lead, personId: ids.person });
      await addActivity(db, w, "actorgsubject", { orgId: ids.org });
      const a = actorOf(w.alice.id);

      expect(find(await run(db, a, "actdealsubject"), "deals", ids.deal).match).toMatchObject({
        source: "activity",
        label: "Activity",
      });
      const p = find(await run(db, a, "actpersonnote"), "people", ids.person);
      expect(p.match?.source).toBe("activity");
      expect(p.match?.snippet).toBe("actpersonnote");
      expect(find(await run(db, a, "actorgsubject"), "organizations", ids.org).match?.source).toBe(
        "activity",
      );
    });
  });

  it("finds a lead through an activity attached to the lead and its person", async () => {
    await withTestDb(async (db) => {
      const w = await seedWorld(db);
      const person = await addPerson(db, w, "Personname Alpha");
      const lead = await addLead(db, w, "Leadname Alpha");
      await addActivity(db, w, "leadactivityterm", { leadId: lead, personId: person });
      const r = await run(db, actorOf(w.alice.id), "leadactivityterm");
      expect(find(r, "leads", lead).match?.source).toBe("activity");
    });
  });

  it("ignores deleted activities", async () => {
    await withTestDb(async (db) => {
      const w = await seedWorld(db);
      const deal = await addDeal(db, w, "Dealname Alpha");
      await addActivity(db, w, "deletedactivityterm", { dealId: deal, deleted: true });
      expect((await run(db, actorOf(w.alice.id), "deletedactivityterm")).deals).toHaveLength(0);
    });
  });
});

describe("email source", () => {
  it("finds deal, person, lead through their linked threads", async () => {
    await withTestDb(async (db) => {
      const w = await seedWorld(db);
      const ids = await seedRecords(db, w);
      const acct = await addPersonalMailbox(db, w.alice.id);
      await addThread(db, {
        accountId: acct,
        dealId: ids.deal,
        subject: "emaildealthread",
        message: { bodyText: "hello" },
      });
      await addThread(db, {
        accountId: acct,
        personId: ids.person,
        message: { subject: "emailpersonmsgsubject" },
      });
      await addThread(db, {
        accountId: acct,
        leadId: ids.lead,
        message: { bodyText: "emailleadbodytext please" },
      });
      const a = actorOf(w.alice.id);

      expect(find(await run(db, a, "emaildealthread"), "deals", ids.deal).match).toMatchObject({
        source: "email",
        label: "Email",
      });
      expect(
        find(await run(db, a, "emailpersonmsgsubject"), "people", ids.person).match?.source,
      ).toBe("email");
      expect(find(await run(db, a, "emailleadbodytext"), "leads", ids.lead).match?.source).toBe(
        "email",
      );
    });
  });

  it("finds a record through body_html when body_text is null", async () => {
    await withTestDb(async (db) => {
      const w = await seedWorld(db);
      const deal = await addDeal(db, w, "Dealname Alpha");
      const acct = await addPersonalMailbox(db, w.alice.id);
      await addThread(db, {
        accountId: acct,
        dealId: deal,
        message: { bodyText: null, bodyHtml: "<div>htmlonlyterm<br>tail</div>" },
      });
      const r = await run(db, actorOf(w.alice.id), "htmlonlyterm");
      expect(find(r, "deals", deal).match?.snippet).toBe("htmlonlyterm tail");
    });
  });

  it("finds a record through the sender name and address", async () => {
    await withTestDb(async (db) => {
      const w = await seedWorld(db);
      const deal = await addDeal(db, w, "Dealname Alpha");
      const acct = await addPersonalMailbox(db, w.alice.id);
      await addThread(db, {
        accountId: acct,
        dealId: deal,
        message: { fromName: "Sendername Zed", fromEmail: "who@sendersdomain.test" },
      });
      const a = actorOf(w.alice.id);
      expect(find(await run(db, a, "sendername"), "deals", deal).match?.source).toBe("email");
      expect(find(await run(db, a, "sendersdomain"), "deals", deal).match?.source).toBe("email");
    });
  });

  it("finds an organization through the email of its people", async () => {
    await withTestDb(async (db) => {
      const w = await seedWorld(db);
      const org = await addOrg(db, w, "Orgname Alpha");
      const person = await addPerson(db, w, "Personname Alpha", { orgId: org });
      const acct = await addPersonalMailbox(db, w.alice.id);
      await addThread(db, {
        accountId: acct,
        personId: person,
        message: { bodyText: "orgviapeopleterm" },
      });
      const r = await run(db, actorOf(w.alice.id), "orgviapeopleterm");
      expect(find(r, "organizations", org).match?.source).toBe("email");
    });
  });

  it("ignores trashed threads", async () => {
    await withTestDb(async (db) => {
      const w = await seedWorld(db);
      const deal = await addDeal(db, w, "Dealname Alpha");
      const acct = await addPersonalMailbox(db, w.alice.id);
      await addThread(db, {
        accountId: acct,
        dealId: deal,
        trashed: true,
        message: { bodyText: "trashedterm" },
      });
      expect((await run(db, actorOf(w.alice.id), "trashedterm")).deals).toHaveLength(0);
    });
  });
});

describe("file source", () => {
  it("finds deal, person and organization by ready file name only", async () => {
    await withTestDb(async (db) => {
      const w = await seedWorld(db);
      const ids = await seedRecords(db, w);
      const mk = (
        entityType: "deal" | "person" | "organization",
        entityId: string,
        filename: string,
        status: "ready" | "uploading",
      ) =>
        db.insert(schema.files).values({
          entityType,
          entityId,
          filename,
          s3Key: `k/${filename}`,
          sizeBytes: 1,
          contentType: "application/pdf",
          status,
          uploadedBy: w.alice.id,
        });
      await mk("deal", ids.deal, "dealcontract.pdf", "ready");
      await mk("person", ids.person, "personresume.pdf", "ready");
      await mk("organization", ids.org, "orgbrochure.pdf", "ready");
      await mk("deal", ids.deal, "pendingupload.pdf", "uploading");
      const a = actorOf(w.alice.id);

      expect(find(await run(db, a, "dealcontract"), "deals", ids.deal).match).toMatchObject({
        source: "file",
        label: "File",
      });
      expect(find(await run(db, a, "personresume"), "people", ids.person).match?.source).toBe(
        "file",
      );
      expect(find(await run(db, a, "orgbrochure"), "organizations", ids.org).match?.source).toBe(
        "file",
      );
      expect((await run(db, a, "pendingupload")).deals).toHaveLength(0);
    });
  });
});
