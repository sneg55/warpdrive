import { sql } from "drizzle-orm";

export const unreadPredicate = sql`CASE WHEN a.kind = 'team'
  THEN t.last_inbound_at IS NOT NULL AND (t.team_read_at IS NULL OR t.team_read_at < t.last_inbound_at)
  ELSE r.read_at IS NULL OR (t.last_message_at IS NOT NULL AND r.read_at < t.last_message_at)
END`;
