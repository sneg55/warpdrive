import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withTestDb } from "@/db/testing";
import { canSeeEmail } from "@/features/email/emailVisibility";
import { emailVisibilitySql } from "./emailVisibilitySql";
import {
  actorOf,
  addDeal,
  addPerson,
  addPersonalMailbox,
  addTeamMailbox,
  addThread,
  seedWorld,
} from "./search.test-helpers";
import { toVisibilityCtx } from "./visibilitySql";

describe("emailVisibilitySql parity with canSeeEmail", () => {
  it("agrees on every thread in the fixture matrix for every actor", async () => {
    await withTestDb(async (db) => {
      const w = await seedWorld(db);
      const carol = actorOf((await (await import("@/db/testing/factories")).seedUser(db)).id);
      const admin = actorOf(
        (await (await import("@/db/testing/factories")).seedUser(db, { isAdmin: true })).id,
        "admin",
      );
      const visibleDeal = await addDeal(db, w, "Visible");
      const hiddenDeal = await addDeal(db, w, "Hidden", { ownerId: w.bob.id, visibility: "owner" });
      const visiblePerson = await addPerson(db, w, "Visible");
      const hiddenPerson = await addPerson(db, w, "Hidden", {
        ownerId: w.bob.id,
        visibility: "owner",
      });
      const aliceBox = await addPersonalMailbox(db, w.alice.id);
      const bobBox = await addPersonalMailbox(db, w.bob.id);
      const team = await addTeamMailbox(db, [w.bob.id]);

      const links = [
        {},
        { dealId: visibleDeal },
        { dealId: hiddenDeal },
        { personId: visiblePerson },
        { personId: hiddenPerson },
        { dealId: hiddenDeal, personId: visiblePerson },
      ];
      for (const accountId of [aliceBox, bobBox, team]) {
        for (const visibility of ["private", "shared"] as const) {
          for (const link of links) await addThread(db, { accountId, visibility, ...link });
        }
      }

      const actors = [actorOf(w.alice.id), actorOf(w.bob.id), carol, admin];
      const threads = (
        await db.execute(
          sql`SELECT t.id, t.account_id, t.visibility, t.deal_id, t.person_id FROM email_threads t`,
        )
      ).rows as Array<{
        id: string;
        account_id: string;
        visibility: string;
        deal_id: string | null;
        person_id: string | null;
      }>;
      expect(threads).toHaveLength(36);

      for (const actor of actors) {
        const visible = new Set(
          (
            await db.execute(
              sql`SELECT t.id FROM email_threads t JOIN email_accounts a ON a.id = t.account_id
                  WHERE ${emailVisibilitySql(toVisibilityCtx(actor))}`,
            )
          ).rows.map((r) => (r as { id: string }).id),
        );
        for (const t of threads) {
          const expected = await canSeeEmail(
            db,
            actor,
            {
              accountId: t.account_id,
              visibility: t.visibility,
              dealId: t.deal_id,
              personId: t.person_id,
            },
            new AbortController().signal,
          );
          expect(visible.has(t.id), `${actor.id} thread ${t.id}`).toBe(expected);
        }
      }
    });
  });
});
