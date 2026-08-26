import { boolean, pgTable, primaryKey, uuid } from "drizzle-orm/pg-core";
import { users } from "./identity";
import { notificationType } from "./notifications";

// Per-user, per-type delivery channel toggles. Composite PK (user_id, type) so a
// user has at most one preference row per notification type. Reuses the existing
// notification_type enum from ./notifications (do not redeclare it).
//
// The column defaults below are unreachable in app code: setPreference always writes both
// columns, and an absent row falls back to DEFAULT_EMAIL_BY_TYPE, which varies per type and
// so cannot be expressed as a single column default.
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
