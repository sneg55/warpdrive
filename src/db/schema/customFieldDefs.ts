import { sql } from "drizzle-orm";
import {
  boolean,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { CUSTOM_FIELD_TARGETS, CUSTOM_FIELD_TYPES } from "@/constants/customFieldTypes";
import type { CustomFieldOption } from "@/types/customFields";

export const customFieldType = pgEnum("custom_field_type", CUSTOM_FIELD_TYPES);
export const customFieldTarget = pgEnum("custom_field_target", CUSTOM_FIELD_TARGETS);

export const customFieldDefs = pgTable(
  "custom_field_defs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    targetEntity: customFieldTarget("target_entity").notNull(),
    type: customFieldType("type").notNull(),
    name: text("name").notNull(),
    // Stable machine key; unique per target_entity (data-model section 10).
    key: text("key").notNull(),
    options: jsonb("options").$type<CustomFieldOption[]>().notNull().default(sql`'[]'::jsonb`),
    isRequired: boolean("is_required").notNull().default(false),
    // Add-form flags: isImportant makes the field visible and required during entity creation;
    // showInAddForm makes it visible but optional. Both default false so existing defs keep today's
    // placement until an admin opts in.
    isImportant: boolean("is_important").notNull().default(false),
    showInAddForm: boolean("show_in_add_form").notNull().default(false),
    order: integer("order").notNull().default(0),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [unique("cf_def_target_key_unique").on(t.targetEntity, t.key)],
);

export type CustomFieldDefRow = typeof customFieldDefs.$inferSelect;
export type NewCustomFieldDef = typeof customFieldDefs.$inferInsert;
