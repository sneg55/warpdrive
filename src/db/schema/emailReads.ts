import { pgTable, primaryKey, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./identity";

// Per-owner read state for an email thread. A shared thread has multiple co-viewers,
// each tracking their own read_at (unlike the single owner-scoped archived_at column).
// Unread = no row here, or read_at < the thread's last_message_at.
export const emailThreadReads = pgTable(
  "email_thread_reads",
  {
    threadId: uuid("thread_id").notNull(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    readAt: timestamp("read_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.threadId, t.userId] })],
);
