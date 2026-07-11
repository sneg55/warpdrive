import { integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const lostReasons = pgTable("lost_reasons", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  // Column named "order" in the DB; quoted in DDL to avoid reserved-word clash.
  order: integer("order").notNull().default(0),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type LostReason = typeof lostReasons.$inferSelect;
