import { sql } from "drizzle-orm";
import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./identity";

// One row per user. Typed columns hold the stable scalar prefs (timezone, density);
// the `ui` jsonb bag absorbs open-ended per-feature UI state (collapsed header blocks,
// saved-view display prefs) so a new UI toggle never needs a migration. Each `ui` key
// is Zod-validated on read (see features/identity/preferencesSchema.ts); the column is
// never trusted raw.
export const userPreferences = pgTable("user_preferences", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  timezone: text("timezone"),
  density: text("density").notNull().default("comfortable"),
  ui: jsonb("ui").notNull().default(sql`'{}'::jsonb`),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export type UserPreferenceRow = typeof userPreferences.$inferSelect;
