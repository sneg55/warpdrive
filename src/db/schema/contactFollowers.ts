import { pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./identity";

// Polymorphic follow: entityId has no FK (can point at persons or organizations, same
// entity_type/entity_id shape as notes.ts and changeLogs.ts). userId cascades on delete so a
// removed user's follows do not dangle. Self-scoped, per-user opt-in (mirrors dealFollowers.ts).
export const contactFollowers = pgTable(
  "contact_followers",
  {
    entityType: text("entity_type").notNull(), // "person" | "organization"
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
