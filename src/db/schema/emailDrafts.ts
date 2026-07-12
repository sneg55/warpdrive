import { foreignKey, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { emailAccounts, emailThreads, emailVisibility } from "./email";

// Autosave drafts (D1). Owned by the mailbox (account_id -> email_accounts). A reply
// draft carries a thread_id; a new-message draft leaves it null. The composite FK pins a
// reply draft to the SAME mailbox as the thread (mirrors email_messages), and is not
// enforced when thread_id is null (Postgres skips composite FKs with any null column).
export const emailDrafts = pgTable(
  "email_drafts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => emailAccounts.id),
    threadId: uuid("thread_id"),
    subject: text("subject"),
    bodyHtml: text("body_html"),
    toEmails: jsonb("to_emails").notNull().default("[]"),
    ccEmails: jsonb("cc_emails").notNull().default("[]"),
    // Compose privacy in progress (C1). Defaults to "shared" (the composer's default) so a private
    // selection survives autosave + resume instead of silently reverting to shared (codex P1).
    visibility: emailVisibility("visibility").notNull().default("shared"),
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
