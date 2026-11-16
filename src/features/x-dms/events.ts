import { type SQL, sql } from "drizzle-orm";
import { wsChannel } from "@/constants/wsChannels";
import { publishEvent } from "@/server/notify";
import type { DbOrTx } from "@/server/realtime/channelVersions";

interface Recipient {
  conversation_id: string;
  account_id: string;
  user_id: string;
}

async function publishTo(
  db: DbOrTx,
  where: SQL,
  actorId: string | null,
  signal: AbortSignal,
): Promise<void> {
  signal.throwIfAborted();
  const rows = await db.execute(sql`SELECT c.id AS conversation_id, c.account_id, m.user_id
    FROM x_conversations c JOIN x_account_members m ON m.account_id = c.account_id WHERE ${where}`);
  signal.throwIfAborted();
  for (const row of rows.rows as unknown as Recipient[]) {
    await publishEvent(
      db,
      {
        v: 1,
        channel: wsChannel.user(row.user_id),
        ts: new Date().toISOString(),
        actorId,
        type: "x_conversation_updated",
        data: { conversationId: row.conversation_id, accountId: row.account_id },
      },
      signal,
    );
  }
}

export function publishXConversationUpdated(
  db: DbOrTx,
  conversationId: string,
  actorId: string | null,
  signal: AbortSignal,
): Promise<void> {
  return publishTo(db, sql`c.id = ${conversationId}::uuid`, actorId, signal);
}

export function publishXAccountEncryptedConversationsUpdated(
  db: DbOrTx,
  accountId: string,
  actorId: string | null,
  signal: AbortSignal,
): Promise<void> {
  return publishTo(db, sql`c.account_id = ${accountId}::uuid AND c.encrypted`, actorId, signal);
}
