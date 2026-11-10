import { foreignKey, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { emailAccounts, emailThreads, emailVisibility } from "./email";

import { users } from "./identity";

export const emailDrafts = pgTable(
  "email_drafts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => emailAccounts.id),
    authorUserId: uuid("author_user_id").references(() => users.id),
    threadId: uuid("thread_id"),
    subject: text("subject"),
    bodyHtml: text("body_html"),
    toEmails: jsonb("to_emails").notNull().default("[]"),
    ccEmails: jsonb("cc_emails").notNull().default("[]"),
    visibility: emailVisibility("visibility").notNull().default("shared"),
    linkDealId: uuid("link_deal_id"),
    linkPersonId: uuid("link_person_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.threadId, t.accountId],
      foreignColumns: [emailThreads.id, emailThreads.accountId],
      name: "fk_draft_thread_same_mailbox",
    }).onDelete("cascade"),
  ],
);

export type EmailDraft = typeof emailDrafts.$inferSelect;
export type NewEmailDraft = typeof emailDrafts.$inferInsert;
