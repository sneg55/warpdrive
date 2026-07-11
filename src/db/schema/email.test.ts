import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { withTestDb } from "@/db/testing";

describe("email schema constraints", () => {
  it("enforces per-account message dedup, not global", async () => {
    await withTestDb(async (db) => {
      const uA = (
        await db.execute(
          sql`INSERT INTO users (email, name, google_sub) VALUES ('a@x.com','A','sub-a') RETURNING id`,
        )
      ).rows[0] as { id: string };
      const acctA = (
        await db.execute(
          sql`INSERT INTO email_accounts (user_id, email_address) VALUES (${uA.id}, 'a@x.com') RETURNING id`,
        )
      ).rows[0] as { id: string };
      const uB = (
        await db.execute(
          sql`INSERT INTO users (email, name, google_sub) VALUES ('b@x.com','B','sub-b') RETURNING id`,
        )
      ).rows[0] as { id: string };
      const acctB = (
        await db.execute(
          sql`INSERT INTO email_accounts (user_id, email_address) VALUES (${uB.id}, 'b@x.com') RETURNING id`,
        )
      ).rows[0] as { id: string };
      const thrA = (
        await db.execute(
          sql`INSERT INTO email_threads (gmail_thread_id, account_id) VALUES ('t1', ${acctA.id}) RETURNING id`,
        )
      ).rows[0] as { id: string };
      const thrB = (
        await db.execute(
          sql`INSERT INTO email_threads (gmail_thread_id, account_id) VALUES ('t1', ${acctB.id}) RETURNING id`,
        )
      ).rows[0] as { id: string };

      // Same Gmail message id may exist in two mailboxes (per-account uniqueness).
      await db.execute(
        sql`INSERT INTO email_messages (thread_id, account_id, gmail_message_id, direction, from_email) VALUES (${thrA.id}, ${acctA.id}, 'm1', 'inbound', 's@y.com')`,
      );
      await db.execute(
        sql`INSERT INTO email_messages (thread_id, account_id, gmail_message_id, direction, from_email) VALUES (${thrB.id}, ${acctB.id}, 'm1', 'inbound', 's@y.com')`,
      );

      // Duplicate within the SAME account violates UNIQUE (account_id, gmail_message_id).
      await expect(
        db.execute(
          sql`INSERT INTO email_messages (thread_id, account_id, gmail_message_id, direction, from_email) VALUES (${thrA.id}, ${acctA.id}, 'm1', 'inbound', 's@y.com')`,
        ),
      ).rejects.toThrow();
    });
  });

  it("blocks attaching a message to a thread in a different mailbox (composite FK)", async () => {
    await withTestDb(async (db) => {
      const uC = (
        await db.execute(
          sql`INSERT INTO users (email, name, google_sub) VALUES ('c@x.com','C','sub-c') RETURNING id`,
        )
      ).rows[0] as { id: string };
      const acctA = (
        await db.execute(
          sql`INSERT INTO email_accounts (user_id, email_address) VALUES (${uC.id}, 'c@x.com') RETURNING id`,
        )
      ).rows[0] as { id: string };
      const uD = (
        await db.execute(
          sql`INSERT INTO users (email, name, google_sub) VALUES ('d@x.com','D','sub-d') RETURNING id`,
        )
      ).rows[0] as { id: string };
      const acctB = (
        await db.execute(
          sql`INSERT INTO email_accounts (user_id, email_address) VALUES (${uD.id}, 'd@x.com') RETURNING id`,
        )
      ).rows[0] as { id: string };
      const thrA = (
        await db.execute(
          sql`INSERT INTO email_threads (gmail_thread_id, account_id) VALUES ('t9', ${acctA.id}) RETURNING id`,
        )
      ).rows[0] as { id: string };

      // thread belongs to acctA, message claims acctB: composite FK must reject.
      await expect(
        db.execute(
          sql`INSERT INTO email_messages (thread_id, account_id, gmail_message_id, direction, from_email) VALUES (${thrA.id}, ${acctB.id}, 'mX', 'inbound', 's@y.com')`,
        ),
      ).rejects.toThrow();
    });
  });

  it("allows duplicate gmail_thread_id across different accounts (per-account scope)", async () => {
    await withTestDb(async (db) => {
      const uE = (
        await db.execute(
          sql`INSERT INTO users (email, name, google_sub) VALUES ('e@x.com','E','sub-e') RETURNING id`,
        )
      ).rows[0] as { id: string };
      const acctE = (
        await db.execute(
          sql`INSERT INTO email_accounts (user_id, email_address) VALUES (${uE.id}, 'e@x.com') RETURNING id`,
        )
      ).rows[0] as { id: string };
      const uF = (
        await db.execute(
          sql`INSERT INTO users (email, name, google_sub) VALUES ('f@x.com','F','sub-f') RETURNING id`,
        )
      ).rows[0] as { id: string };
      const acctF = (
        await db.execute(
          sql`INSERT INTO email_accounts (user_id, email_address) VALUES (${uF.id}, 'f@x.com') RETURNING id`,
        )
      ).rows[0] as { id: string };

      // Same gmail_thread_id is fine across different accounts.
      await db.execute(
        sql`INSERT INTO email_threads (gmail_thread_id, account_id) VALUES ('shared-thread', ${acctE.id})`,
      );
      await db.execute(
        sql`INSERT INTO email_threads (gmail_thread_id, account_id) VALUES ('shared-thread', ${acctF.id})`,
      );

      // But duplicate within same account must fail.
      await expect(
        db.execute(
          sql`INSERT INTO email_threads (gmail_thread_id, account_id) VALUES ('shared-thread', ${acctE.id})`,
        ),
      ).rejects.toThrow();
    });
  });
});
