import { describe, expect, it } from "vitest";
import type { PermissionFlagKey } from "@/constants/permissionFlags";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import { createCaller } from "@/server/trpc/root";
import { actorOf, seedAccount, seedDealAndPerson, type TestDb } from "./draft.test-helpers";
import { listDraftsForDeal, listDraftsForPerson } from "./draftEntityReads";
import { saveDraft } from "./draftRepo";

const SIG = (): AbortSignal => AbortSignal.timeout(8000);

function callerFor(db: TestDb, actorId: string): ReturnType<typeof createCaller> {
  return createCaller({
    db,
    session: { userId: actorId, sessionId: "test-session" },
    actor: {
      id: actorId,
      type: "regular",
      isActive: true,
      flags: new Set<PermissionFlagKey>(),
      groupIds: new Set<string>(),
      name: "Test User",
      email: "test@example.com",
      avatarUrl: null,
    },
  });
}

describe("drafts on a record timeline", () => {
  it("returns the actor's own drafts for that deal and nobody else's", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { email: "o@gunsnation.com" });
      const colleague = await seedUser(db, { email: "c@gunsnation.com" });
      const ownerAcct = await seedAccount(db, owner.id, "o@gunsnation.com");
      const colleagueAcct = await seedAccount(db, colleague.id, "c@gunsnation.com");
      const { dealId, personId } = await seedDealAndPerson(db, owner.id);

      const mine = await saveDraft(
        db,
        {
          actor: actorOf(owner.id),
          draft: {
            accountId: ownerAcct,
            subject: "Mine",
            bodyHtml: "",
            toEmails: [],
            ccEmails: [],
            linkDealId: dealId,
            linkPersonId: personId,
          },
        },
        SIG(),
      );
      if (!mine.ok) throw new Error("save failed");
      await saveDraft(
        db,
        {
          actor: actorOf(colleague.id),
          draft: {
            accountId: colleagueAcct,
            subject: "Theirs",
            bodyHtml: "",
            toEmails: [],
            ccEmails: [],
            linkDealId: dealId,
          },
        },
        SIG(),
      );

      const forDeal = await listDraftsForDeal(db, { actor: actorOf(owner.id), dealId }, SIG());
      expect(forDeal.map((d) => d.subject)).toEqual(["Mine"]);

      const forPerson = await listDraftsForPerson(
        db,
        { actor: actorOf(owner.id), personId },
        SIG(),
      );
      expect(forPerson.map((d) => d.subject)).toEqual(["Mine"]);
    });
  });

  it("leaves an unlinked draft off the record timeline", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { email: "o@gunsnation.com" });
      const acctId = await seedAccount(db, owner.id, "o@gunsnation.com");
      const { dealId } = await seedDealAndPerson(db, owner.id);
      await saveDraft(
        db,
        {
          actor: actorOf(owner.id),
          draft: {
            accountId: acctId,
            subject: "Loose",
            bodyHtml: "",
            toEmails: [],
            ccEmails: [],
          },
        },
        SIG(),
      );
      expect(await listDraftsForDeal(db, { actor: actorOf(owner.id), dealId }, SIG())).toEqual([]);
    });
  });

  it("serves the deal's drafts over tRPC so the deal timeline can read them", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { email: "o@gunsnation.com" });
      const acctId = await seedAccount(db, owner.id, "o@gunsnation.com");
      const { dealId } = await seedDealAndPerson(db, owner.id);
      await saveDraft(
        db,
        {
          actor: actorOf(owner.id),
          draft: {
            accountId: acctId,
            subject: "Outreach",
            bodyHtml: "",
            toEmails: ["poc@y.com"],
            ccEmails: [],
            linkDealId: dealId,
          },
        },
        SIG(),
      );

      const out = await callerFor(db, owner.id).email.drafts.listForDeal({ dealId });
      expect(out.map((d) => d.subject)).toEqual(["Outreach"]);
    });
  });
});
