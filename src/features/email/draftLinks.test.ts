import { describe, expect, it } from "vitest";
import { withTestDb } from "@/db/testing";
import { seedUser } from "@/db/testing/factories";
import { actorOf, seedAccount, seedDealAndPerson } from "./draft.test-helpers";
import { listDrafts, saveDraft } from "./draftRepo";

const SIG = (): AbortSignal => AbortSignal.timeout(8000);

describe("draft CRM links", () => {
  it("round-trips linkDealId and linkPersonId so a resumed draft keeps its record link", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { email: "o@gunsnation.com" });
      const acctId = await seedAccount(db, owner.id, "o@gunsnation.com");
      const actor = actorOf(owner.id);
      const { dealId, personId } = await seedDealAndPerson(db, owner.id);

      const created = await saveDraft(
        db,
        {
          actor,
          draft: {
            accountId: acctId,
            subject: "Outreach",
            bodyHtml: "<p>hi</p>",
            toEmails: ["poc@y.com"],
            ccEmails: [],
            linkDealId: dealId,
            linkPersonId: personId,
          },
        },
        SIG(),
      );
      if (!created.ok) throw new Error("save failed");

      const row = (await listDrafts(db, actor, SIG())).find((d) => d.id === created.value.id);
      expect(row?.linkDealId).toBe(dealId);
      expect(row?.linkPersonId).toBe(personId);
    });
  });

  it("clears the links when an update omits them, so unlinking in the composer sticks", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { email: "o@gunsnation.com" });
      const acctId = await seedAccount(db, owner.id, "o@gunsnation.com");
      const actor = actorOf(owner.id);
      const { dealId } = await seedDealAndPerson(db, owner.id);

      const created = await saveDraft(
        db,
        {
          actor,
          draft: {
            accountId: acctId,
            subject: "Outreach",
            bodyHtml: "",
            toEmails: [],
            ccEmails: [],
            linkDealId: dealId,
          },
        },
        SIG(),
      );
      if (!created.ok) throw new Error("save failed");

      await saveDraft(
        db,
        {
          actor,
          draft: {
            id: created.value.id,
            accountId: acctId,
            subject: "Outreach",
            bodyHtml: "",
            toEmails: [],
            ccEmails: [],
            linkDealId: null,
          },
        },
        SIG(),
      );

      const row = (await listDrafts(db, actor, SIG())).find((d) => d.id === created.value.id);
      expect(row?.linkDealId).toBeNull();
    });
  });

  it("rejects a draft pointing at a deal that does not exist instead of throwing an FK error", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { email: "o@gunsnation.com" });
      const acctId = await seedAccount(db, owner.id, "o@gunsnation.com");
      const res = await saveDraft(
        db,
        {
          actor: actorOf(owner.id),
          draft: {
            accountId: acctId,
            subject: "Outreach",
            bodyHtml: "",
            toEmails: [],
            ccEmails: [],
            linkDealId: crypto.randomUUID(),
          },
        },
        SIG(),
      );
      expect(res.ok).toBe(false);
    });
  });
});
