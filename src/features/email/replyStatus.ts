import { sql } from "drizzle-orm";

export type TeamReplyStatus =
  | { kind: "unanswered"; waitingSince: string; overdueAfterHours: number }
  | { kind: "replied"; byName: string | null };

export const replyStatusProjection = sql`CASE WHEN a.kind='team' THEN (
  SELECT CASE WHEN latest.direction='outbound'
    THEN jsonb_build_object('kind', 'replied', 'byName', NULLIF(split_part(u.name, ' ', 1), ''))
    ELSE jsonb_build_object('kind', 'unanswered', 'overdueAfterHours', a.overdue_after_hours,
      'waitingSince', (SELECT min(COALESCE(waiting.sent_at, waiting.created_at)) FROM email_messages waiting
        WHERE waiting.thread_id=t.id AND waiting.direction='inbound'
        AND (COALESCE(waiting.sent_at, waiting.created_at), waiting.created_at, waiting.id) > ALL (
          SELECT COALESCE(sent.sent_at, sent.created_at), sent.created_at, sent.id FROM email_messages sent
          WHERE sent.thread_id=t.id AND sent.direction='outbound'
        ))) END
  FROM email_messages latest LEFT JOIN users u ON u.id=latest.sent_by_user_id
  WHERE latest.thread_id=t.id
  ORDER BY COALESCE(latest.sent_at, latest.created_at) DESC, latest.created_at DESC, latest.id DESC LIMIT 1
) ELSE NULL END AS reply_status`;
