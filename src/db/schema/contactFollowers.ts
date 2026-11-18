import { pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./identity";

export const contactFollowers = pgTable(
  "contact_followers",
  {
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.entityType, t.entityId, t.userId] })],
);

export type ContactFollower = typeof contactFollowers.$inferSelect;
export type NewContactFollower = typeof contactFollowers.$inferInsert;
