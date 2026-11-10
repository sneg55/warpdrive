import { boolean, index, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { EMAIL_TRACKING_EVENT_TYPE } from "@/constants/email";
import { emailMessages, emailSendAttempts } from "./email";
import { citext } from "./identity";
export const emailTrackingEventType = pgEnum(
  "email_tracking_event_type",
  EMAIL_TRACKING_EVENT_TYPE,
);

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
