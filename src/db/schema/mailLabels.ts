import { integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { labelColorEnum } from "./system";

// User-managed mail label catalog (inbox parity U6). Distinct from the company `labels` catalog:
// that one is admin-gated and keyed by a `label_target` enum whose ALTER cannot be seeded in the
// same migration transaction. Mail labels are inbox-personal (any user creates them inline), and a
// thread references a catalog row by its stable `key`, stored in `email_threads.labels[]`. The
// built-in keys equal the historic tokens (important/to_do/later) so the existing inbox label
// filter keeps matching unchanged.
export const mailLabels = pgTable("mail_labels", {
  id: uuid("id").defaultRandom().primaryKey(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  color: labelColorEnum("color").notNull(),
  order: integer("order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type MailLabelRow = typeof mailLabels.$inferSelect;
