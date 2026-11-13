import {
  boolean,
  customType,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { TEAM_MAILBOX_OVERDUE_HOURS } from "@/constants/teamMailbox";
import { X_ACCOUNT_STATUS, X_MESSAGE_DIRECTION } from "@/constants/xDms";
import { sessions, users } from "./identity";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });

export const xAccountStatus = pgEnum("x_account_status", X_ACCOUNT_STATUS);
export const xMessageDirection = pgEnum("x_message_direction", X_MESSAGE_DIRECTION);

export const xAccounts = pgTable("x_accounts", {
  id: uuid("id").defaultRandom().primaryKey(),
  xUserId: text("x_user_id").notNull().unique(),
  username: text("username").notNull(),
  displayName: text("display_name").notNull(),
  avatarUrl: text("avatar_url"),
  refreshTokenEnc: bytea("refresh_token_enc"),
  accessTokenEnc: bytea("access_token_enc"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
  scopes: jsonb("scopes").notNull().default("[]"),
  status: xAccountStatus("status").notNull().default("connected"),
  overdueAfterHours: integer("overdue_after_hours").notNull().default(TEAM_MAILBOX_OVERDUE_HOURS),
  connectedByUserId: uuid("connected_by_user_id").references(() => users.id),
  lastSyncAt: timestamp("last_sync_at", { withTimezone: true }),
  lastErrorId: text("last_error_id"),
  conversationsSyncedAt: timestamp("conversations_synced_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const xAccountMembers = pgTable(
  "x_account_members",
  {
    accountId: uuid("account_id")
      .notNull()
      .references(() => xAccounts.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.accountId, t.userId] })],
);

export const xConversations = pgTable(
  "x_conversations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => xAccounts.id, { onDelete: "cascade" }),
    xConversationId: text("x_conversation_id").notNull(),
    participantXUserId: text("participant_x_user_id").notNull(),
    participantUsername: text("participant_username"),
    participantName: text("participant_name"),
    participantAvatarUrl: text("participant_avatar_url"),
    encrypted: boolean("encrypted").notNull().default(false),
    newestEventId: text("newest_event_id"),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true }),
    lastInboundAt: timestamp("last_inbound_at", { withTimezone: true }),
    teamReadAt: timestamp("team_read_at", { withTimezone: true }),
    teamReadByUserId: uuid("team_read_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    xUnread: boolean("x_unread").notNull().default(false),
    isTrusted: boolean("is_trusted"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    unique("x_conversations_account_conversation_uq").on(t.accountId, t.xConversationId),
    index("x_conversations_account_last_message_idx").on(t.accountId, t.lastMessageAt.desc()),
  ],
);

export const xMessages = pgTable(
  "x_messages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => xConversations.id, { onDelete: "cascade" }),
    xEventId: text("x_event_id").notNull(),
    direction: xMessageDirection("direction").notNull(),
    senderXUserId: text("sender_x_user_id").notNull(),
    text: text("text").notNull(),
    hasMedia: boolean("has_media").notNull().default(false),
    sentAt: timestamp("sent_at", { withTimezone: true }).notNull(),
    sentByUserId: uuid("sent_by_user_id").references(() => users.id, { onDelete: "set null" }),
  },
  (t) => [unique("x_messages_conversation_event_uq").on(t.conversationId, t.xEventId)],
);

export const xOAuthIntents = pgTable("x_oauth_intents", {
  state: text("state").primaryKey(),
  sessionId: uuid("session_id")
    .notNull()
    .references(() => sessions.id, { onDelete: "cascade" }),
  codeVerifier: text("code_verifier").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export type XAccount = typeof xAccounts.$inferSelect;
export type XConversation = typeof xConversations.$inferSelect;
export type XMessage = typeof xMessages.$inferSelect;
