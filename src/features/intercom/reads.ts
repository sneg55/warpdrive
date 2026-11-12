import { sql } from "drizzle-orm";
import { INTERCOM_TIMELINE_LIMIT } from "@/constants/intercom";
import type { Db } from "@/db/client";
import type { PermSetUser } from "@/features/permissions/effective";
import { conversationMatchesPersonEmails, personEmailsCte } from "./personMatch";
import { visiblePersonsForScope } from "./scopePersons";
import type { SupportConversationSummary, SupportScope } from "./supportTypes";

interface SummaryRow {
  id: string;
  title: string | null;
  snippet: string | null;
  state: string;
  message_count: number;
  last_replier_name: string | null;
  last_replier_type: string | null;
  last_part_at: Date | string;
}

function toSummary(r: SummaryRow): SupportConversationSummary {
  return {
    id: r.id,
    title: r.title,
    snippet: r.snippet,
    state: r.state,
    messageCount: Number(r.message_count),
    lastReplierName: r.last_replier_name,
    lastReplierType: r.last_replier_type,
    lastPartAt: new Date(r.last_part_at).toISOString(),
  };
}

export async function listSupportConversations(
  db: Db,
  actor: PermSetUser,
  scope: SupportScope,
  signal: AbortSignal,
): Promise<SupportConversationSummary[]> {
  const personIds = await visiblePersonsForScope(db, actor, scope, signal);
  if (personIds.length === 0) return [];
  const rows = (
    await db.execute(sql`
      WITH ${personEmailsCte(personIds)}
      SELECT c.id, c.title, c.snippet, c.state, c.message_count, c.last_replier_name,
        c.last_replier_type, c.last_part_at
      FROM intercom_conversations c
      WHERE c.message_count > 0 AND ${conversationMatchesPersonEmails(sql`c.id`)}
      ORDER BY c.last_part_at DESC
      LIMIT ${INTERCOM_TIMELINE_LIMIT}
    `)
  ).rows as unknown as SummaryRow[];
  signal.throwIfAborted();
  return rows.map(toSummary);
}
