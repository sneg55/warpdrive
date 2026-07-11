import { pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";
import { customFieldTarget } from "./customFieldDefs";

// Built-in fields are code-defined (see src/constants/builtinFields.ts), not rows. This table
// stores only the hidden OVERRIDES: a row's presence means "this built-in field is hidden".
// Unhide = delete the row. Single-tenant, so no workspace scoping column.
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
