import { index, pgEnum, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { MENTION_SOURCES } from "@/constants/mentions";
import { users } from "./identity";

export const mentionSourceEnum = pgEnum("mention_source", MENTION_SOURCES);

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
  (t) => [index("mentions_mentioned_user_idx").on(t.mentionedUserId)],
);

export type Mention = typeof mentions.$inferSelect;
