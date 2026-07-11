import { boolean, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./identity";

// Email templates: sanitized rich-text with merge fields. Stored XSS surface:
// sanitized on both save and render (scripts/on*/form/dangerous URLs stripped).
export const emailTemplates = pgTable("email_templates", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  subject: text("subject"),
  bodyHtml: text("body_html").notNull(),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => users.id),
  // is_shared requires the filter.share capability (permissions spec).
  isShared: boolean("is_shared").notNull().default(false),
  // Manual display order for the owner's own templates in the settings list. NULL sorts last
  // (created-order fallback); reorderTemplates sets it to the drag index. See authoring.ts.
  sortOrder: integer("sort_order"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Signatures: sanitized rich-text appended to outgoing mail.
// is_default is app-enforced (one per user); the DB does not enforce uniqueness
// here so concurrent updates cannot deadlock the index.
export const signatures = pgTable("signatures", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id),
  name: text("name").notNull(),
  bodyHtml: text("body_html").notNull(),
  isDefault: boolean("is_default").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type EmailTemplate = typeof emailTemplates.$inferSelect;
export type NewEmailTemplate = typeof emailTemplates.$inferInsert;
export type Signature = typeof signatures.$inferSelect;
export type NewSignature = typeof signatures.$inferInsert;
