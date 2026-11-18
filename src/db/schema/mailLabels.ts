import { integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { labelColorEnum } from "./system";

export const mailLabels = pgTable("mail_labels", {
  id: uuid("id").defaultRandom().primaryKey(),
  key: text("key").notNull().unique(),
  name: text("name").notNull(),
  color: labelColorEnum("color").notNull(),
  order: integer("order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type MailLabelRow = typeof mailLabels.$inferSelect;
