import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

export const intercomContacts = pgTable(
  "intercom_contacts",
  {
    id: text("id").primaryKey(),
    email: text("email"),
    role: text("role"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("intercom_contacts_email_lowercase", sql`${t.email} = lower(btrim(${t.email}))`),
    index("intercom_contacts_email_idx").on(t.email),
  ],
);

export const intercomConversations = pgTable("intercom_conversations", {
  id: text("id").primaryKey(),
  title: text("title"),
  state: text("state").notNull(),
  snippet: text("snippet"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  lastPartAt: timestamp("last_part_at", { withTimezone: true }).notNull(),
  messageCount: integer("message_count").notNull(),
  lastReplierName: text("last_replier_name"),
  lastReplierType: text("last_replier_type"),
});

export const intercomConversationParts = pgTable(
  "intercom_conversation_parts",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => intercomConversations.id, { onDelete: "cascade" }),
    partType: text("part_type").notNull(),
    authorType: text("author_type"),
    authorName: text("author_name"),
    bodyHtml: text("body_html").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  },
  (t) => [index("intercom_parts_conversation_idx").on(t.conversationId, t.createdAt)],
);

export const intercomConversationContacts = pgTable(
  "intercom_conversation_contacts",
  {
    conversationId: text("conversation_id")
      .notNull()
      .references(() => intercomConversations.id, { onDelete: "cascade" }),
    contactId: text("contact_id").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.conversationId, t.contactId] }),
    index("intercom_conversation_contacts_contact_idx").on(t.contactId),
  ],
);

export const intercomSyncState = pgTable(
  "intercom_sync_state",
  {
    id: boolean("id").primaryKey().default(true),
    cursorUpdatedAt: bigint("cursor_updated_at", { mode: "number" }).notNull(),
    stalledRuns: integer("stalled_runs").notNull().default(0),
    resumeUpdatedAfter: bigint("resume_updated_after", { mode: "number" }),
    resumeStartingAfter: text("resume_starting_after"),
    resumeHeld: boolean("resume_held").notNull().default(false),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("intercom_sync_state_singleton", sql`${t.id} = true`)],
);

export type IntercomConversationRow = typeof intercomConversations.$inferInsert;
export type IntercomPartRow = typeof intercomConversationParts.$inferInsert;
