import { sql } from "drizzle-orm";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import { INTERCOM_SOURCE_PART_TYPE, INTERCOM_VISIBLE_PART_TYPES } from "@/constants/intercom";
import type { Db } from "@/db/client";
import { sanitizeInboundHtml } from "@/features/email/sanitizeHtml";
import type { PermSetUser } from "@/features/permissions/effective";
import { err, ok, type Result } from "@/types/result";
import { conversationMatchesPersonEmails, personEmailsCte } from "./personMatch";
import { visiblePersonsForScope } from "./scopePersons";
import type { SupportConversationPart, SupportScope } from "./supportTypes";

interface PartRow {
  id: string;
  part_type: string;
  author_type: string | null;
  author_name: string | null;
  created_at: Date | string;
  body_html: string;
}

const RENDERED_PART_TYPES = [INTERCOM_SOURCE_PART_TYPE, ...INTERCOM_VISIBLE_PART_TYPES];

async function belongsToScope(
  db: Db,
  actor: PermSetUser,
  conversationId: string,
  scope: SupportScope,
  signal: AbortSignal,
): Promise<boolean> {
  const personIds = await visiblePersonsForScope(db, actor, scope, signal);
  if (personIds.length === 0) return false;
  const rows = (
    await db.execute(sql`
      WITH ${personEmailsCte(personIds)}
      SELECT 1 AS hit WHERE ${conversationMatchesPersonEmails(sql`${conversationId}`)}
    `)
  ).rows;
  signal.throwIfAborted();
  return rows.length > 0;
}

export async function getSupportConversationParts(
  db: Db,
  actor: PermSetUser,
  args: { conversationId: string; scope: SupportScope; allowRemote: boolean },
  signal: AbortSignal,
): Promise<Result<SupportConversationPart[], AppError>> {
  if (!(await belongsToScope(db, actor, args.conversationId, args.scope, signal))) {
    return err(
      new AppError(ERROR_IDS.INTERCOM_CONVERSATION_DENIED, "support conversation not visible", {
        conversationId: args.conversationId,
      }),
    );
  }
  const types = sql.join(
    RENDERED_PART_TYPES.map((t) => sql`${t}`),
    sql`, `,
  );
  const rows = (
    await db.execute(sql`
      SELECT id, part_type, author_type, author_name, created_at, body_html
      FROM intercom_conversation_parts
      WHERE conversation_id = ${args.conversationId} AND part_type IN (${types})
      ORDER BY created_at ASC, id ASC
    `)
  ).rows as unknown as PartRow[];
  signal.throwIfAborted();
  return ok(
    rows.map((r) => ({
      id: r.id,
      partType: r.part_type,
      authorType: r.author_type,
      authorName: r.author_name,
      createdAt: new Date(r.created_at).toISOString(),
      bodyHtml: sanitizeInboundHtml(r.body_html, { allowRemote: args.allowRemote }),
    })),
  );
}
