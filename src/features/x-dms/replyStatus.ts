import { sql } from "drizzle-orm";

export const xReplyStatusProjection = sql`(
  SELECT CASE WHEN latest.direction = 'outbound'
    THEN jsonb_build_object('kind', 'replied', 'byName', NULLIF(split_part(u.name, ' ', 1), ''))
    ELSE jsonb_build_object('kind', 'unanswered', 'overdueAfterHours', a.overdue_after_hours,
      'waitingSince', (SELECT min(waiting.sent_at) FROM x_messages waiting
        WHERE waiting.conversation_id = c.id AND waiting.direction = 'inbound'
        AND (waiting.sent_at, waiting.id) > ALL (
          SELECT sent.sent_at, sent.id FROM x_messages sent
          WHERE sent.conversation_id = c.id AND sent.direction = 'outbound'
        ))) END
  FROM x_messages latest LEFT JOIN users u ON u.id = latest.sent_by_user_id
  WHERE latest.conversation_id = c.id
  ORDER BY latest.sent_at DESC, latest.id DESC LIMIT 1
) AS reply_status`;
