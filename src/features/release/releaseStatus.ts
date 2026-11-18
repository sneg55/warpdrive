import type { Db } from "@/db/client";
import { appReleaseStatus } from "@/db/schema";
import type { ReleaseInfo, ReleaseRow } from "./types";

const SINGLETON_ID = true;

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
