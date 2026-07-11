import { bigint, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { emailMessages } from "./email";

// Inbound attachment metadata captured during Gmail sync. Bytes are NOT stored;
// they are fetched lazily from Gmail on download via gmail_attachment_id.
export const emailMessageAttachments = pgTable("email_message_attachments", {
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
});

export type EmailMessageAttachment = typeof emailMessageAttachments.$inferSelect;
