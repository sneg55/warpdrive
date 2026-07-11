import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./identity";

// Append-only audit trail of field-level changes on any entity.
// Hard-delete only (no updatedAt / deletedAt): entries are never mutated.
// Polymorphic via (entity_type, entity_id), same pattern as notes.
export const changeLogs = pgTable(
  "change_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    field: text("field").notNull(),
    oldValue: jsonb("old_value").$type<unknown>(),
    newValue: jsonb("new_value").$type<unknown>(),
    // actor_id is nullable: a system-driven change has no human actor.
    actorId: uuid("actor_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Entity timeline lookups, newest-first ordering supported by created_at.
    index("change_logs_entity_idx").on(t.entityType, t.entityId, t.createdAt),
  ],
);

export type ChangeLogRow = typeof changeLogs.$inferSelect;
export type NewChangeLog = typeof changeLogs.$inferInsert;
