import { eq, sql } from "drizzle-orm";
import {
  BREVO_NOT_FOUND_RETRY_MS,
  BREVO_PICK_BATCH,
  BREVO_REFRESH_INTERVAL_MS,
} from "@/constants/brevo";
import type { Db } from "@/db/client";
import { brevoTrackedEmails } from "@/db/schema";

export interface PickedEmail {
  email: string;
  coveredThrough: string | null;
}

interface PickRow {
  email: string;
  covered_through: string | null;
}

export async function pickEmails(
  db: Db,
  nowMs: number,
  runStartedMs: number,
  signal: AbortSignal,
): Promise<PickedEmail[]> {
  signal.throwIfAborted();
  const refreshedBefore = new Date(nowMs - BREVO_REFRESH_INTERVAL_MS);
  const notFoundBefore = new Date(nowMs - BREVO_NOT_FOUND_RETRY_MS);
  const attemptedBefore = new Date(runStartedMs);
  const rows = (
    await db.execute(sql`
      SELECT email, covered_through::text AS covered_through
      FROM brevo_tracked_emails
      WHERE active
        AND (last_refreshed_at IS NULL OR last_refreshed_at < ${refreshedBefore})
        AND (not_found_at IS NULL OR not_found_at < ${notFoundBefore})
        AND (last_attempt_at IS NULL OR last_attempt_at < ${attemptedBefore})
      ORDER BY last_attempt_at ASC NULLS FIRST, email ASC
      LIMIT ${BREVO_PICK_BATCH}`)
  ).rows as unknown as PickRow[];
  signal.throwIfAborted();
  return rows.map((r) => ({ email: r.email, coveredThrough: r.covered_through }));
}

export async function markAttempt(db: Db, email: string, at: Date): Promise<void> {
  await db
    .update(brevoTrackedEmails)
    .set({ lastAttemptAt: at })
    .where(eq(brevoTrackedEmails.email, email));
}

export async function markNotFound(db: Db, email: string, at: Date): Promise<void> {
  await db
    .update(brevoTrackedEmails)
    .set({ notFoundAt: at })
    .where(eq(brevoTrackedEmails.email, email));
}

export async function markRefreshed(db: Db, email: string, at: Date): Promise<void> {
  await db
    .update(brevoTrackedEmails)
    .set({ lastRefreshedAt: at, notFoundAt: null })
    .where(eq(brevoTrackedEmails.email, email));
}
