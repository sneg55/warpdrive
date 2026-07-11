import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withTestDb } from "@/db/testing";
import { seedPipelineWithStages, seedUser } from "@/db/testing/factories";
import type { AuthUser } from "@/features/permissions/types";
import { getThread } from "./router";

// Regression: the reader header rendered literal "Person" / "Deal" pills (the type noun) for a
// linked thread instead of the linked record's name/title. getThread must project those labels so
// the header can show the NAME (Pipedrive parity; the link-shows-type-noun content smell).

const SIG = (): AbortSignal => AbortSignal.timeout(8000);

function actorOf(id: string): AuthUser {
  return { id, type: "regular", isActive: true, groupIds: new Set() };
}

describe("getThread linked-record labels", () => {
  it("returns the linked person's name and deal's title", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { email: "o@gunsnation.com" });
      const acctId = (
        await db.execute(
          sql`INSERT INTO email_accounts (user_id, email_address) VALUES (${owner.id}, 'o@gunsnation.com') RETURNING id`,
        )
      ).rows[0] as { id: string };
      const person = (
        await db.execute(
          sql`INSERT INTO persons (name, primary_email, owner_id, visibility_level) VALUES ('Ada Client', 'ada@acme.com', ${owner.id}, 'all') RETURNING id`,
        )
      ).rows[0] as { id: string };
      const pipe = await seedPipelineWithStages(db, ["Lead"]);
      const deal = (
        await db.execute(
          sql`INSERT INTO deals (title, owner_id, visibility_level, pipeline_id, stage_id)
              VALUES ('Acme Renewal', ${owner.id}, 'all', ${pipe.pipeline.id}, ${pipe.stages[0]?.id}) RETURNING id`,
        )
      ).rows[0] as { id: string };
      const thr = (
        await db.execute(sql`
          INSERT INTO email_threads (gmail_thread_id, account_id, person_id, deal_id)
          VALUES ('t1', ${acctId.id}, ${person.id}, ${deal.id}) RETURNING id
        `)
      ).rows[0] as { id: string };
      await db.execute(sql`
        INSERT INTO email_messages (thread_id, account_id, gmail_message_id, direction, from_email, body_html, sent_at)
        VALUES (${thr.id}, ${acctId.id}, 'm1', 'inbound', 'ada@acme.com', '<p>hi</p>', now())
      `);

      const out = await getThread(
        db,
        { actor: actorOf(owner.id), threadId: thr.id, allowRemote: false },
        SIG(),
      );
      expect(out.ok).toBe(true);
      if (out.ok) {
        expect(out.value.personName).toBe("Ada Client");
        expect(out.value.dealTitle).toBe("Acme Renewal");
      }
    });
  });

  it("returns null labels for an unlinked thread", async () => {
    await withTestDb(async (db) => {
      const owner = await seedUser(db, { email: "o@gunsnation.com" });
      const acctId = (
        await db.execute(
          sql`INSERT INTO email_accounts (user_id, email_address) VALUES (${owner.id}, 'o@gunsnation.com') RETURNING id`,
        )
      ).rows[0] as { id: string };
      const thr = (
        await db.execute(
          sql`INSERT INTO email_threads (gmail_thread_id, account_id) VALUES ('t1', ${acctId.id}) RETURNING id`,
        )
      ).rows[0] as { id: string };
      await db.execute(sql`
        INSERT INTO email_messages (thread_id, account_id, gmail_message_id, direction, from_email, body_html, sent_at)
        VALUES (${thr.id}, ${acctId.id}, 'm1', 'inbound', 'ada@acme.com', '<p>hi</p>', now())
      `);

      const out = await getThread(
        db,
        { actor: actorOf(owner.id), threadId: thr.id, allowRemote: false },
        SIG(),
      );
      expect(out.ok).toBe(true);
      if (out.ok) {
        expect(out.value.personName).toBeNull();
        expect(out.value.dealTitle).toBeNull();
      }
    });
  });
});
