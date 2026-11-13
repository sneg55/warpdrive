import { sql } from "drizzle-orm";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import { xAccountMembers, xAccounts, xConversations } from "@/db/schema/xDms";

export const sig = (): AbortSignal => new AbortController().signal;

let counter = 0;
const nextKey = (): string => {
  counter += 1;
  return `${Date.now().toString(36)}${counter.toString(36)}`;
};

export const at = (iso: string): Date => new Date(iso);

export async function seedXAccount(
  db: Db,
  o: { members: string[]; displayName?: string; overdueAfterHours?: number },
): Promise<string> {
  const key = nextKey();
  const [row] = await db
    .insert(xAccounts)
    .values({
      xUserId: `me-${key}`,
      username: `brand${key}`,
      displayName: o.displayName ?? "Brand",
      overdueAfterHours: o.overdueAfterHours ?? 24,
    })
    .returning({ id: xAccounts.id });
  if (!row) throw new AppError(ERROR_IDS.DB_INSERT_FAILED, "seedXAccount returned no row");
  if (o.members.length > 0)
    await db
      .insert(xAccountMembers)
      .values(o.members.map((userId) => ({ accountId: row.id, userId })));
  return row.id;
}

export async function seedXConversation(
  db: Db,
  accountId: string,
  o: { encrypted?: boolean; username?: string; teamReadAt?: Date; archivedAt?: Date } = {},
): Promise<string> {
  const key = nextKey();
  const [row] = await db
    .insert(xConversations)
    .values({
      accountId,
      xConversationId: `c-${key}`,
      participantXUserId: `them-${key}`,
      participantUsername: o.username ?? `them${key}`,
      participantName: "Them Person",
      participantAvatarUrl: "https://example.com/them.png",
      encrypted: o.encrypted ?? false,
      teamReadAt: o.teamReadAt ?? null,
      archivedAt: o.archivedAt ?? null,
    })
    .returning({ id: xConversations.id });
  if (!row) throw new AppError(ERROR_IDS.DB_INSERT_FAILED, "seedXConversation returned no row");
  return row.id;
}

export async function seedXMessage(
  db: Db,
  conversationId: string,
  o: {
    direction: "inbound" | "outbound";
    at: Date;
    text?: string;
    hasMedia?: boolean;
    sentByUserId?: string;
  },
): Promise<void> {
  const sentAt = o.at.toISOString();
  await db.execute(sql`INSERT INTO x_messages
    (conversation_id, x_event_id, direction, sender_x_user_id, text, has_media, sent_at, sent_by_user_id)
    VALUES (${conversationId}, ${`e-${nextKey()}`}, ${o.direction}, ${o.direction}, ${o.text ?? "hello"},
      ${o.hasMedia ?? false}, ${sentAt}::timestamptz, ${o.sentByUserId ?? null})`);
  await db.execute(sql`UPDATE x_conversations SET
    last_message_at = GREATEST(last_message_at, ${sentAt}::timestamptz),
    last_inbound_at = CASE WHEN ${o.direction} = 'inbound'
      THEN GREATEST(last_inbound_at, ${sentAt}::timestamptz) ELSE last_inbound_at END
    WHERE id = ${conversationId}`);
}

export async function removeMember(db: Db, accountId: string, userId: string): Promise<void> {
  await db.execute(
    sql`DELETE FROM x_account_members WHERE account_id=${accountId} AND user_id=${userId}`,
  );
}
