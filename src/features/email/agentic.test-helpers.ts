import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import type { TestDb } from "@/test/db";
import { createAgenticClient } from "./provider/agenticClient";
import { encryptAgenticCredentials } from "./provider/agenticCredentials";
import type { FakeAgenticServer } from "./provider/agenticFakeServer";
import { agenticProvider } from "./provider/agenticProvider";

export const AGENTIC_TEST_CREDENTIALS = { clientId: "cid", clientSecret: "csecret" };

export async function seedAgenticMailbox(
  db: TestDb["db"],
  args: { address: string; baseUrl: string; memberIds: string[] },
  signal: AbortSignal,
): Promise<string> {
  signal.throwIfAborted();
  const accountId = randomUUID();
  await db.execute(sql`INSERT INTO email_accounts
    (id, kind, email_address, display_name, provider, provider_base_url, provider_credentials_enc)
    VALUES (${accountId}, 'team', ${args.address}, 'Media', 'agentic_inbox', ${args.baseUrl},
      ${encryptAgenticCredentials(AGENTIC_TEST_CREDENTIALS)})`);
  signal.throwIfAborted();
  for (const id of args.memberIds) {
    await db.execute(sql`INSERT INTO email_account_members VALUES (${accountId}, ${id})`);
    signal.throwIfAborted();
  }
  return accountId;
}

export function fakeAgenticProvider(fake: FakeAgenticServer) {
  const client = createAgenticClient({
    baseUrl: fake.url,
    mailbox: fake.mailbox,
    ...AGENTIC_TEST_CREDENTIALS,
  });
  return { client, provider: agenticProvider(client, fake.mailbox) };
}
