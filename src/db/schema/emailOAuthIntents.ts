import { integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { sessions } from "./identity";

export const emailOAuthIntents = pgTable("email_oauth_intents", {
  state: text("state").primaryKey(),
  sessionId: uuid("session_id")
    .notNull()
    .references(() => sessions.id, { onDelete: "cascade" }),
  backfillDays: integer("backfill_days").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});
