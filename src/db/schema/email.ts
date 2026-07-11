import { sql } from "drizzle-orm";
import {
  boolean,
  customType,
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
import {
  EMAIL_ACCOUNT_STATUS,
  EMAIL_MESSAGE_DIRECTION,
  EMAIL_SEND_STATUS,
  EMAIL_TRACKING_EVENT_TYPE,
  EMAIL_VISIBILITY,
} from "@/constants/email";
import { citext, users } from "./identity";

// bytea for encrypted OAuth tokens (ops spec); never plaintext, never logged.
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

export const emailAccountStatus = pgEnum("email_account_status", EMAIL_ACCOUNT_STATUS);
export const emailMessageDirection = pgEnum("email_message_direction", EMAIL_MESSAGE_DIRECTION);
export const emailSendStatus = pgEnum("email_send_status", EMAIL_SEND_STATUS);
export const emailVisibility = pgEnum("email_visibility", EMAIL_VISIBILITY);
export const emailTrackingEventType = pgEnum(
  "email_tracking_event_type",
  EMAIL_TRACKING_EVENT_TYPE,
);

// Per-user Gmail OAuth connection. Tokens stored as encrypted bytea, never plaintext.
export const emailAccounts = pgTable("email_accounts", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id)
    .unique(),
  emailAddress: citext("email_address").notNull().unique(),
  refreshTokenEnc: bytea("refresh_token_enc"),
  scopes: jsonb("scopes").notNull().default("[]"),
  lastHistoryId: text("last_history_id"),
  watchExpiresAt: timestamp("watch_expires_at", { withTimezone: true }),
  status: emailAccountStatus("status").notNull().default("connected"),
  lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
  lastErrorId: text("last_error_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Composite UNIQUE (id, account_id) anchors child composite FKs to the same mailbox.
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
    // Lead-scoped thread link (Leads Inbox email timeline). Untyped uuid, mirroring dealId.
    leadId: uuid("lead_id"),
    personId: uuid("person_id"),
    visibility: emailVisibility("visibility").notNull().default("private"),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    // Local CRM archive flag (D2). Null = active (shows in Inbox); non-null = archived
    // (shows in Archive). No Gmail label write. Filtered by the partial index below.
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    // Deleted-to-Gmail-Trash flag (P4). Non-null once the thread has been moved to Gmail Trash
    // (either from the reader Delete action or observed via a synced TRASH label). Excluded from
    // every local folder read so a trashed thread leaves all views. Unlike archivedAt this DOES
    // mirror a real Gmail move (threads/{id}/trash).
    trashedAt: timestamp("trashed_at", { withTimezone: true }),
    // Reader follow-up controls (B1), local only (no Gmail label write). Nullable status:
    // null means unset, distinct from the explicit "none" constant value.
    followUpStatus: text("follow_up_status"),
    labels: text("labels").array().notNull().default(sql`'{}'`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("uq_thread_acct_gmail").on(t.accountId, t.gmailThreadId),
    // Composite target so children can pin messages/attempts to the SAME mailbox.
    unique("uq_thread_id_acct").on(t.id, t.accountId),
    // Partial index backs the not-archived Inbox read (WHERE archived_at IS NULL).
    index("email_threads_not_archived_idx")
      .on(t.accountId, t.lastMessageAt)
      .where(sql`archived_at IS NULL`),
  ],
);

// Composite FK (thread_id, account_id) -> emailThreads prevents cross-mailbox body exposure.
export const emailMessages = pgTable(
  "email_messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    threadId: uuid("thread_id").notNull(),
    accountId: uuid("account_id").notNull(),
    gmailMessageId: text("gmail_message_id").notNull(),
    direction: emailMessageDirection("direction").notNull(),
    fromEmail: citext("from_email").notNull(),
    // Sender display name parsed from the From header ("Scrape.do Team"), null for a bare address.
    // The list row + reader show this and fall back to from_email when absent.
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

// Outbound idempotency / outbox. A row exists before the Gmail send call.
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
    // Composite FK pins a reply attempt to the same mailbox as the thread.
    foreignKey({
      columns: [t.threadId, t.accountId],
      foreignColumns: [emailThreads.id, emailThreads.accountId],
      name: "fk_attempt_thread_same_mailbox",
    }),
  ],
);

// Tracking tokens minted before MIME build; anchored to send_attempt, not message.
export const emailTrackingTokens = pgTable(
  "email_tracking_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    token: text("token").notNull().unique(),
    sendAttemptId: uuid("send_attempt_id")
      .notNull()
      .references(() => emailSendAttempts.id, { onDelete: "cascade" }),
    messageId: uuid("message_id").references(() => emailMessages.id),
    recipient: citext("recipient").notNull(),
    kind: emailTrackingEventType("kind").notNull(),
    targetUrl: text("target_url"),
    disabled: boolean("disabled").notNull().default(false),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("ett_send_attempt_idx").on(t.sendAttemptId),
    index("ett_message_idx").on(t.messageId),
  ],
);

// One row per actual open/click hit. token_id FK cascades on token delete.
export const emailTrackingEvents = pgTable(
  "email_tracking_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    tokenId: uuid("token_id")
      .notNull()
      .references(() => emailTrackingTokens.id, { onDelete: "cascade" }),
    messageId: uuid("message_id")
      .notNull()
      .references(() => emailMessages.id),
    eventType: emailTrackingEventType("event_type").notNull(),
    recipient: citext("recipient").notNull(),
    targetUrl: text("target_url"),
    userAgent: text("user_agent"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("ete_message_occurred_idx").on(t.messageId, t.occurredAt)],
);

export type EmailAccount = typeof emailAccounts.$inferSelect;
export type NewEmailAccount = typeof emailAccounts.$inferInsert;
export type EmailThread = typeof emailThreads.$inferSelect;
export type EmailMessage = typeof emailMessages.$inferSelect;
export type EmailSendAttempt = typeof emailSendAttempts.$inferSelect;
