import { sql } from "drizzle-orm";
import { boolean, check, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";

export const intercomSearchBackfill = pgTable(
  "intercom_search_backfill",
  {
    id: boolean("id").primaryKey().default(true),
    cursorDealId: uuid("cursor_deal_id"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [check("intercom_search_backfill_singleton", sql`${t.id} = true`)],
);
