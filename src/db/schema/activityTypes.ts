import { boolean, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

// Activity type catalog (data-model section 7). The 6 system rows are seeded
// in the migration; is_system marks rows users may not delete.
export const activityTypes = pgTable("activity_types", {
  id: uuid("id").primaryKey().defaultRandom(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  icon: text("icon"),
  isSystem: boolean("is_system").notNull().default(false),
  order: integer("order").notNull().default(0),
  // Soft enable/disable: archived types are hidden from the create-activity picker but
  // never hard-deleted, since existing activities reference the row via type_id.
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ActivityType = typeof activityTypes.$inferSelect;
export type NewActivityType = typeof activityTypes.$inferInsert;
