import { sql } from "drizzle-orm";
import { boolean, check, pgTable, text, timestamp } from "drizzle-orm/pg-core";

export const appReleaseStatus = pgTable(
  "app_release_status",
  {
    id: boolean("id").primaryKey().default(true),
    latestTag: text("latest_tag"),
    releaseUrl: text("release_url"),
    releaseNotes: text("release_notes"),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("app_release_status_singleton", sql`${t.id} = true`)],
);

export type AppReleaseStatus = typeof appReleaseStatus.$inferSelect;
