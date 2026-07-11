import { index, jsonb, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { NOTIFICATION_TYPES } from "@/constants/notificationTypes";
import { users } from "./identity";

export const notificationType = pgEnum("notification_type", NOTIFICATION_TYPES);

// In-app notifications. The notifications FEATURE (read/mark, realtime) is Phase 5;
// only the table is created now so the Phase 3 reminder job can persist rows.
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    type: notificationType("type").notNull(),
    // Polymorphic target (no FK): entityType names the table, entityId the row.
    entityType: text("entity_type"),
    entityId: uuid("entity_id"),
    actorId: uuid("actor_id").references(() => users.id),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    readAt: timestamp("read_at", { withTimezone: true }),
    // Set once the email-notification job has successfully sent for this row. Read at the
    // top of the job so a pg-boss at-least-once retry cannot send a duplicate email (F36).
    emailSentAt: timestamp("email_sent_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Index: unread badge + inbox filtering by recipient.
    index("notifications_user_read_idx").on(t.userId, t.readAt),
    // Index: recipient inbox ordered by recency.
    index("notifications_user_created_idx").on(t.userId, t.createdAt),
  ],
);

export type Notification = typeof notifications.$inferSelect;
