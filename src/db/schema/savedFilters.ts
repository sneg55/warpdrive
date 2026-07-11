import { sql } from "drizzle-orm";
import { boolean, index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./identity";

export const savedFilters = pgTable(
  "saved_filters",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    targetEntity: text("target_entity").notNull(),
    definition: jsonb("definition").notNull().default(sql`'{}'::jsonb`),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id),
    isShared: boolean("is_shared").notNull().default(false),
    favorite: boolean("favorite").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("saved_filters_owner_idx").on(t.ownerId)],
);

export type SavedFilter = typeof savedFilters.$inferSelect;
