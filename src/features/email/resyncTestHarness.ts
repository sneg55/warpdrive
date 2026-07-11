import { sql } from "drizzle-orm";
import type { withTestDb } from "@/db/testing";
import type { GmailMessage } from "./gmailSchemas";

// Shared test harness for the resync (ops-B3 gap recovery) suites. Co-located with
// the feature; imported by resync.test.ts and resyncCoverage.test.ts.

export type TestDb = Parameters<Parameters<typeof withTestDb>[0]>[0];

export const newSignal = (): AbortSignal => new AbortController().signal;

// Build a minimal full GmailMessage with a text/plain body and the given sender.
export function msg(id: string, threadId: string, from: string): GmailMessage {
  return {
    id,
    threadId,
    labelIds: [],
    snippet: "hi",
    payload: {
      mimeType: "text/plain",
      headers: [
        { name: "From", value: from },
        { name: "To", value: "o@gunsnation.com" },
        { name: "Subject", value: "Hello" },
      ],
      body: { data: Buffer.from("body").toString("base64url") },
    },
  };
}

export async function seedAccount(
  db: TestDb,
  opts: {
    startHistoryId: string;
    lastSyncAt?: Date;
    status?: string;
  },
): Promise<{ acctId: string; userId: string }> {
  const u = (
    await db.execute(
      sql`INSERT INTO users (email, name, google_sub)
          VALUES ('o@gunsnation.com','O','sub-o-resync')
          RETURNING id`,
    )
  ).rows[0] as { id: string };

  const lastSyncSql =
    opts.lastSyncAt !== undefined ? sql`${opts.lastSyncAt.toISOString()}::timestamptz` : sql`NULL`;

  const status = opts.status ?? "connected";

  const a = (
    await db.execute(
      sql`INSERT INTO email_accounts (user_id, email_address, last_history_id, status, last_sync_at)
          VALUES (${u.id}, 'o@gunsnation.com', ${opts.startHistoryId}, ${status}, ${lastSyncSql})
          RETURNING id`,
    )
  ).rows[0] as { id: string };

  return { acctId: a.id, userId: u.id };
}

export async function countMessages(db: TestDb, acctId: string): Promise<number> {
  const r = await db.execute(
    sql`SELECT count(*)::int AS n FROM email_messages WHERE account_id=${acctId}`,
  );
  return (r.rows[0] as { n: number }).n;
}
