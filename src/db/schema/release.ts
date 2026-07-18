import { sql } from "drizzle-orm";
import { boolean, check, pgTable, text, timestamp } from "drizzle-orm/pg-core";

// Singleton cache of the latest GitHub release, refreshed by the release-check cron job and read
// by the version.get query. Exactly one row, guarded by CHECK (id = true) like `settings`. Nulls
// are allowed because a partial/malformed release may lack a tag, url, or body; fetched_at stamps
// the last successful refresh.
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
