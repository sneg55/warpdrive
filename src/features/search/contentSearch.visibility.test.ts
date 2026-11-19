import { describe, expect, it } from "vitest";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import {
  actorOf,
  addActivity,
  addDeal,
  addNote,
  addOrg,
  addPerson,
  addPersonalMailbox,
  addTeamMailbox,
  addThread,
  run,
  seedWorld,
} from "./search.test-helpers";

describe("content visibility", () => {
  it("never returns a hidden deal or person through any content source", async () => {
    await withTestDb(async (db) => {
      const w = await seedWorld(db);
      const deal = await addDeal(db, w, "Hidden", { ownerId: w.bob.id, visibility: "owner" });
      const person = await addPerson(db, w, "Hidden", { ownerId: w.bob.id, visibility: "owner" });
      await addNote(db, w, "deal", deal, "hiddennoteterm");
      await addNote(db, w, "person", person, "hiddennoteterm");
      await addActivity(db, w, "hiddenactivityterm", { dealId: deal });
      const acct = await addPersonalMailbox(db, w.bob.id);
      await addThread(db, {
        accountId: acct,
        dealId: deal,
        message: { bodyText: "hiddenemailterm" },
      });
      const a = actorOf(w.alice.id);
      for (const q of ["hiddennoteterm", "hiddenactivityterm", "hiddenemailterm"]) {
        const r = await run(db, a, q);
        expect(r.deals).toHaveLength(0);
        expect(r.people).toHaveLength(0);
      }
    });
  });

  it("does not let an activity on a hidden deal surface its visible person or organization", async () => {
    await withTestDb(async (db) => {
      const w = await seedWorld(db);
      const org = await addOrg(db, w, "Visible Org");
      const person = await addPerson(db, w, "Visible Person", { orgId: org });
      const deal = await addDeal(db, w, "Hidden", { ownerId: w.bob.id, visibility: "owner" });
      await addActivity(db, w, "crossparentterm", { dealId: deal, personId: person, orgId: org });
      const r = await run(db, actorOf(w.alice.id), "crossparentterm");
      expect(r.people).toHaveLength(0);
      expect(r.organizations).toHaveLength(0);
      expect(r.deals).toHaveLength(0);
    });
  });

  it("does not surface a deal through a private thread in another user's mailbox", async () => {
    await withTestDb(async (db) => {
      const w = await seedWorld(db);
      const deal = await addDeal(db, w, "Visible deal");
      const acct = await addPersonalMailbox(db, w.bob.id);
      await addThread(db, {
        accountId: acct,
        dealId: deal,
        visibility: "private",
        message: { bodyText: "privatethreadterm" },
      });
      expect((await run(db, actorOf(w.alice.id), "privatethreadterm")).deals).toHaveLength(0);
      const own = await run(db, actorOf(w.bob.id), "privatethreadterm");
      expect(own.deals.map((d) => d.id)).toEqual([deal]);
    });
  });

  it("surfaces a deal through a shared-mailbox thread for a user who can use the mailbox", async () => {
    await withTestDb(async (db) => {
      const w = await seedWorld(db);
      const deal = await addDeal(db, w, "Shared mailbox deal");
      const team = await addTeamMailbox(db, [w.bob.id]);
      await addThread(db, {
        accountId: team,
        dealId: deal,
        visibility: "private",
        message: { bodyText: "teamthreadterm" },
      });
      const outsider = await seedUser(db);
      const viaMember = await run(db, actorOf(w.bob.id), "teamthreadterm");
      expect(viaMember.deals.map((d) => d.id)).toEqual([deal]);
      expect((await run(db, actorOf(outsider.id), "teamthreadterm")).deals).toHaveLength(0);
    });
  });

  it("does not find an organization through the email of a person the actor cannot see", async () => {
    await withTestDb(async (db) => {
      const w = await seedWorld(db);
      const org = await addOrg(db, w, "Visible Org");
      const hiddenPerson = await addPerson(db, w, "Hidden", {
        orgId: org,
        ownerId: w.bob.id,
        visibility: "owner",
      });
      const acct = await addPersonalMailbox(db, w.alice.id);
      await addThread(db, {
        accountId: acct,
        personId: hiddenPerson,
        message: { bodyText: "hiddenpersonmailterm" },
      });
      const r = await run(db, actorOf(w.alice.id), "hiddenpersonmailterm");
      expect(r.organizations).toHaveLength(0);
      expect(r.people).toHaveLength(0);
    });
  });
});
