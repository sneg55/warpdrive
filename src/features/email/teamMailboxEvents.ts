import { sql } from "drizzle-orm";
import { wsChannel } from "@/constants/wsChannels";
import { publishEvent } from "@/server/notify";
import type { DbOrTx } from "@/server/realtime/channelVersions";

export async function publishTeamThreadUpdated(
  db: DbOrTx,
  threadId: string,
  actorId: string | null,
  signal: AbortSignal,
): Promise<void> {
  signal.throwIfAborted();
  const rows = await db.execute(sql`SELECT t.account_id, am.user_id FROM email_threads t
    JOIN email_accounts a ON a.id=t.account_id AND a.kind='team'
    JOIN email_account_members am ON am.account_id=a.id WHERE t.id=${threadId}`);
  signal.throwIfAborted();
  for (const row of rows.rows as { account_id: string; user_id: string }[]) {
    await publishEvent(
      db,
      {
        v: 1,
        channel: wsChannel.user(row.user_id),
        ts: new Date().toISOString(),
        actorId,
        type: "email_thread_updated",
        data: { threadId, accountId: row.account_id },
      },
      signal,
    );
  }
}
