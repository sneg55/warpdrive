import { boolean, pgTable, primaryKey, uuid } from "drizzle-orm/pg-core";
import { users } from "./identity";
import { notificationType } from "./notifications";

export const notificationPreferences = pgTable(
  "notification_preferences",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    type: notificationType("type").notNull(),
    inApp: boolean("in_app").notNull().default(true),
    email: boolean("email").notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.userId, t.type] })],
);

export type NotificationPreference = typeof notificationPreferences.$inferSelect;
