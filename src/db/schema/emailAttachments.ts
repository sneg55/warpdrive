import { bigint, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { emailMessages } from "./email";

export const emailMessageAttachments = pgTable(
  "email_message_attachments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    messageId: uuid("message_id")
      .notNull()
      .references(() => emailMessages.id, { onDelete: "cascade" }),
    accountId: uuid("account_id").notNull(),
    gmailAttachmentId: text("gmail_attachment_id").notNull(),
    filename: text("filename").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("email_message_attachments_message_idx").on(t.messageId)],
);

export type EmailMessageAttachment = typeof emailMessageAttachments.$inferSelect;
