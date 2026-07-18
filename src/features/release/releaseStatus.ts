import type { Db } from "@/db/client";
import { appReleaseStatus } from "@/db/schema";
import type { ReleaseInfo, ReleaseRow } from "./types";

// The singleton row's primary key value (CHECK enforces id = true).
const SINGLETON_ID = true;

// Read the cached release row, or null if the cron job has not populated it yet.
export async function readReleaseStatus(db: Db): Promise<ReleaseRow | null> {
  const rows = await db.select().from(appReleaseStatus).limit(1);
  const row = rows[0];
  if (row === undefined) return null;
  return {
    latestTag: row.latestTag,
    releaseUrl: row.releaseUrl,
    releaseNotes: row.releaseNotes,
    fetchedAt: row.fetchedAt,
  };
}

// Upsert the single cache row, stamping fetched_at to now(). On-conflict on the singleton PK
// keeps exactly one row and lets each refresh overwrite the last.
export async function upsertReleaseStatus(db: Db, info: ReleaseInfo): Promise<void> {
  const now = new Date();
  await db
    .insert(appReleaseStatus)
    .values({
      id: SINGLETON_ID,
      latestTag: info.latestTag,
      releaseUrl: info.releaseUrl,
      releaseNotes: info.releaseNotes,
      fetchedAt: now,
    })
    .onConflictDoUpdate({
      target: appReleaseStatus.id,
      set: {
        latestTag: info.latestTag,
        releaseUrl: info.releaseUrl,
        releaseNotes: info.releaseNotes,
        fetchedAt: now,
      },
    });
}
