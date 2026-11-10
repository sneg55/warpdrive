import { sql } from "drizzle-orm";
import { AppError } from "@/constants/errorIds";
import type { withTestDb } from "@/db/testing";
import { err, ok, type Result } from "@/types/result";
import { FakeGmailClient } from "./gmailFake";
import type { GmailMessage } from "./gmailSchemas";

type TestDb = Parameters<Parameters<typeof withTestDb>[0]>[0];
export class ToggleGetMessageFake extends FakeGmailClient {
  failGetMessage = false;
  override getMessage(a: {
    id: string;
    signal: AbortSignal;
  }): Promise<Result<GmailMessage, AppError>> {
    a.signal.throwIfAborted();
    this.calls.push({ method: "getMessage", args: a });
    if (this.failGetMessage) {
      return Promise.resolve(err(new AppError("E_GMAIL_003", "getMessage failed", {})));
    }
    const msg = this.messages.get(a.id);
    return Promise.resolve(ok(msg ?? { id: a.id, threadId: "t1", labelIds: [] }));
  }
}
export async function seedAccount(
  db: TestDb,
  ownerId: string,
  signal: AbortSignal,
  email = "owner@gunsnation.com",
): Promise<string> {
  signal.throwIfAborted();
  const acct = (
    await db.execute(
      sql`INSERT INTO email_accounts (user_id, email_address) VALUES (${ownerId}, ${email}) RETURNING id`,
    )
  ).rows[0] as { id: string };
  signal.throwIfAborted();
  return acct.id;
}
