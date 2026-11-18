import { pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";
import { customFieldTarget } from "./customFieldDefs";

export const hiddenBuiltinFields = pgTable(
  "hidden_builtin_fields",
  {
    targetEntity: customFieldTarget("target_entity").notNull(),
    fieldKey: text("field_key").notNull(),
    hiddenAt: timestamp("hidden_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.targetEntity, t.fieldKey] })],
);

export type HiddenBuiltinFieldRow = typeof hiddenBuiltinFields.$inferSelect;
export type NewHiddenBuiltinField = typeof hiddenBuiltinFields.$inferInsert;
