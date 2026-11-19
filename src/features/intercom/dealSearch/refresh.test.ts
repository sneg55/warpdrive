import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { INTERCOM_TITLE_PART_ID } from "@/constants/search";
import { deals, intercomConversations, persons } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { seedWorld } from "@/features/search/search.test-helpers";
import {
  addParticipantRow,
  conversationFor,
  linkedDeal,
  MAYA_EMAIL,
  removeParticipantRow,
  searchRows,
} from "./dealSearch.test-helpers";
import { refreshDealIntercomSearch } from "./refresh";

const signal = () => new AbortController().signal;

describe("refreshDealIntercomSearch", () => {
  it("writes one row per part and one per title with plain text", async () => {
    await withTestDb(async (db) => {
      const w = await seedWorld(db);
      const { dealId } = await linkedDeal(db, w);
      await conversationFor(db, "c1", MAYA_EMAIL, {
        title: "Affiliate code",
        parts: [
          { id: "p1", partType: "comment", body: "<p>code PROPDESK &amp; more</p>" },
          { id: "p2", partType: "comment", body: "<p>second</p>" },
        ],
      });
      await refreshDealIntercomSearch(db, [dealId], signal());
      const rows = await searchRows(db, dealId);
      expect(rows.map((r) => r.partId).sort()).toEqual([INTERCOM_TITLE_PART_ID, "p1", "p2"]);
      expect(rows.find((r) => r.partId === "p1")?.plainText).toBe("code PROPDESK & more");
      expect(rows.find((r) => r.partId === INTERCOM_TITLE_PART_ID)?.plainText).toBe(
        "Affiliate code",
      );
    });
  });

  it("uses the part time for parts and the last part time for the title", async () => {
    await withTestDb(async (db) => {
      const w = await seedWorld(db);
      const { dealId } = await linkedDeal(db, w);
      const lastPartAt = new Date("2026-10-05T10:00:00Z");
      await conversationFor(db, "c1", MAYA_EMAIL, {
        title: "T",
        lastPartAt,
        parts: [{ id: "p1", partType: "comment" }],
      });
      await refreshDealIntercomSearch(db, [dealId], signal());
      const rows = await searchRows(db, dealId);
      expect(rows.find((r) => r.partId === INTERCOM_TITLE_PART_ID)?.matchedAt).toEqual(lastPartAt);
      expect(rows.find((r) => r.partId === "p1")?.matchedAt).toEqual(lastPartAt);
    });
  });

  it("skips empty conversations, empty titles and unmatched contacts", async () => {
    await withTestDb(async (db) => {
      const w = await seedWorld(db);
      const { dealId } = await linkedDeal(db, w);
      await conversationFor(db, "c1", MAYA_EMAIL, { title: "Empty", parts: [] });
      await db.update(intercomConversations).set({ messageCount: 0 });
      await conversationFor(db, "c2", "other@example.com", { title: "Other" });
      await conversationFor(db, "c3", "noreply@propdesknews.com", { title: "Bot" });
      await refreshDealIntercomSearch(db, [dealId], signal());
      expect(await searchRows(db, dealId)).toEqual([]);
    });
  });

  it("links through participants and matches secondary emails", async () => {
    await withTestDb(async (db) => {
      const w = await seedWorld(db);
      const { dealId } = await linkedDeal(db, w, "main@acme.com");
      const other = await linkedDeal(db, w, "second@acme.com");
      await db
        .update(persons)
        .set({ emails: [{ label: "work", value: "Alt@Beta.com " }] })
        .where(eq(persons.id, other.personId));
      await addParticipantRow(db, dealId, other.personId);
      await conversationFor(db, "c1", "alt@beta.com", { title: "Via secondary" });
      await refreshDealIntercomSearch(db, [dealId], signal());
      const rows = await searchRows(db, dealId);
      expect([...new Set(rows.map((r) => r.personId))]).toEqual([other.personId]);
    });
  });

  it("removes stale rows and ignores deleted deals", async () => {
    await withTestDb(async (db) => {
      const w = await seedWorld(db);
      const { dealId, personId } = await linkedDeal(db, w);
      const second = await linkedDeal(db, w, "kept@acme.com");
      await addParticipantRow(db, dealId, second.personId);
      await conversationFor(db, "c1", MAYA_EMAIL, { title: "A" });
      await conversationFor(db, "c2", "kept@acme.com", { title: "B" });
      await refreshDealIntercomSearch(db, [dealId], signal());
      expect([...new Set((await searchRows(db, dealId)).map((r) => r.personId))].sort()).toEqual(
        [personId, second.personId].sort(),
      );
      await removeParticipantRow(db, dealId, second.personId);
      await refreshDealIntercomSearch(db, [dealId], signal());
      expect([...new Set((await searchRows(db, dealId)).map((r) => r.personId))]).toEqual([
        personId,
      ]);
      await db.update(deals).set({ deletedAt: new Date() }).where(eq(deals.id, dealId));
      await refreshDealIntercomSearch(db, [dealId], signal());
      expect(await searchRows(db, dealId)).toEqual([]);
    });
  });

  it("rolls back when the signal aborts during the transaction", async () => {
    await withTestDb(async (db) => {
      const w = await seedWorld(db);
      const { dealId } = await linkedDeal(db, w);
      await conversationFor(db, "c1", MAYA_EMAIL, { title: "Kept" });
      await refreshDealIntercomSearch(db, [dealId], signal());
      const before = await searchRows(db, dealId);
      const controller = new AbortController();
      const abortingDb = new Proxy(db, {
        get(target, prop, receiver) {
          if (prop !== "transaction") return Reflect.get(target, prop, receiver) as unknown;
          return (run: (tx: typeof db) => Promise<unknown>) =>
            target.transaction(async (tx) => {
              const abortingTx = new Proxy(tx, {
                get(t, p, r) {
                  if (p !== "execute") return Reflect.get(t, p, r) as unknown;
                  return async (query: Parameters<typeof tx.execute>[0]) => {
                    const result = await t.execute(query);
                    controller.abort();
                    return result;
                  };
                },
              });
              return run(abortingTx);
            });
        },
      });
      await expect(
        refreshDealIntercomSearch(abortingDb, [dealId], controller.signal),
      ).rejects.toThrow();
      expect(await searchRows(db, dealId)).toEqual(before);
    });
  });

  it("leaves other deals untouched", async () => {
    await withTestDb(async (db) => {
      const w = await seedWorld(db);
      const a = await linkedDeal(db, w);
      const b = await linkedDeal(db, w, "b@acme.com");
      await conversationFor(db, "c1", "b@acme.com", { title: "B" });
      await refreshDealIntercomSearch(db, [b.dealId], signal());
      await refreshDealIntercomSearch(db, [a.dealId], signal());
      expect(await searchRows(db, b.dealId)).toHaveLength(2);
    });
  });
});
