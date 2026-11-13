import { sql } from "drizzle-orm";
import { wsChannel } from "@/constants/wsChannels";
import { publishEvent } from "@/server/notify";
import type { DbOrTx } from "@/server/realtime/channelVersions";

export async function publishXConversationUpdated(
  db: DbOrTx,
  conversationId: string,
  actorId: string | null,
  signal: AbortSignal,
): Promise<void> {
  signal.throwIfAborted();
  const rows = await db.execute(sql`SELECT c.account_id, m.user_id FROM x_conversations c
    JOIN x_account_members m ON m.account_id = c.account_id WHERE c.id = ${conversationId}::uuid`);
  signal.throwIfAborted();
  for (const row of rows.rows as { account_id: string; user_id: string }[]) {
    await publishEvent(
      db,
      {
        v: 1,
        channel: wsChannel.user(row.user_id),
        ts: new Date().toISOString(),
        actorId,
        type: "x_conversation_updated",
        data: { conversationId, accountId: row.account_id },
      },
      signal,
    );
  }
}
