import { sql } from "drizzle-orm";
import {
  boolean,
  foreignKey,
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { EMAIL_MESSAGE_DIRECTION, EMAIL_SEND_STATUS, EMAIL_VISIBILITY } from "@/constants/email";
import { emailAccounts } from "./emailAccounts";

export type { EmailAccount, NewEmailAccount } from "./emailAccounts";
export { emailAccountStatus, emailAccounts } from "./emailAccounts";

import { citext, users } from "./identity";

export const emailMessageDirection = pgEnum("email_message_direction", EMAIL_MESSAGE_DIRECTION);
export const emailSendStatus = pgEnum("email_send_status", EMAIL_SEND_STATUS);
export const emailVisibility = pgEnum("email_visibility", EMAIL_VISIBILITY);
export const emailThreads = pgTable(
  "email_threads",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    gmailThreadId: text("gmail_thread_id").notNull(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => emailAccounts.id),
    subject: text("subject"),
    dealId: uuid("deal_id"),
    leadId: uuid("lead_id"),
    personId: uuid("person_id"),
    visibility: emailVisibility("visibility").notNull().default("private"),
    lastInboundAt: timestamp("last_inbound_at", { withTimezone: true }),
    teamReadAt: timestamp("team_read_at", { withTimezone: true }),
    teamReadByUserId: uuid("team_read_by_user_id").references(() => users.id),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    trashedAt: timestamp("trashed_at", { withTimezone: true }),
    followUpStatus: text("follow_up_status"),
    labels: text("labels").array().notNull().default(sql`'{}'`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("uq_thread_acct_gmail").on(t.accountId, t.gmailThreadId),
    unique("uq_thread_id_acct").on(t.id, t.accountId),
    index("email_threads_not_archived_idx")
      .on(t.accountId, t.lastMessageAt)
      .where(sql`archived_at IS NULL`),
  ],
);

export const emailMessages = pgTable(
  "email_messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    threadId: uuid("thread_id").notNull(),
    accountId: uuid("account_id").notNull(),
    gmailMessageId: text("gmail_message_id").notNull(),
    sentByUserId: uuid("sent_by_user_id").references(() => users.id),
    direction: emailMessageDirection("direction").notNull(),
    fromEmail: citext("from_email").notNull(),
    fromName: text("from_name"),
    toEmails: jsonb("to_emails").notNull().default("[]"),
    ccEmails: jsonb("cc_emails").notNull().default("[]"),
    subject: text("subject"),
    snippet: text("snippet"),
    bodyHtml: text("body_html"),
    bodyText: text("body_text"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    trackingEnabled: boolean("tracking_enabled").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("uq_msg_acct_gmail").on(t.accountId, t.gmailMessageId),
    foreignKey({
      columns: [t.threadId, t.accountId],
      foreignColumns: [emailThreads.id, emailThreads.accountId],
      name: "fk_msg_thread_same_mailbox",
    }).onDelete("cascade"),
  ],
);

export const emailSendAttempts = pgTable(
  "email_send_attempts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    idempotencyKey: uuid("idempotency_key").notNull(),
    messageIdHeader: text("message_id_header").notNull(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => emailAccounts.id),
    threadId: uuid("thread_id"),
    payload: jsonb("payload").notNull(),
    status: emailSendStatus("status").notNull().default("pending"),
    claimToken: uuid("claim_token"),
    claimedAt: timestamp("claimed_at", { withTimezone: true }),
    sendStartedAt: timestamp("send_started_at", { withTimezone: true }),
    gmailMessageId: text("gmail_message_id"),
    errorId: text("error_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
  },
  (t) => [
    unique("uq_attempt_acct_key").on(t.accountId, t.idempotencyKey),
    unique("uq_attempt_msgid").on(t.messageIdHeader),
    foreignKey({
      columns: [t.threadId, t.accountId],
      foreignColumns: [emailThreads.id, emailThreads.accountId],
      name: "fk_attempt_thread_same_mailbox",
    }),
  ],
);

export type EmailThread = typeof emailThreads.$inferSelect;
export type EmailMessage = typeof emailMessages.$inferSelect;
export type EmailSendAttempt = typeof emailSendAttempts.$inferSelect;

export { emailTrackingEvents, emailTrackingEventType, emailTrackingTokens } from "./emailTracking";
