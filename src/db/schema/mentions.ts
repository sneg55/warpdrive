import { index, pgEnum, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { MENTION_SOURCES } from "@/constants/mentions";
import { users } from "./identity";

export const mentionSourceEnum = pgEnum("mention_source", MENTION_SOURCES);

// @-mentions extracted from notes/comments. Polymorphic source (no FK): source
// names the kind, sourceId the row. Drives mention notifications in Phase 5.
export const mentions = pgTable(
  "mentions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    source: mentionSourceEnum("source").notNull(),
    sourceId: uuid("source_id").notNull(),
    mentionedUserId: uuid("mentioned_user_id")
      .notNull()
      .references(() => users.id),
    authorId: uuid("author_id")
      .notNull()
      .references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  // Index: fetch a user's mentions for their notification inbox.
  (t) => [index("mentions_mentioned_user_idx").on(t.mentionedUserId)],
);

export type Mention = typeof mentions.$inferSelect;
