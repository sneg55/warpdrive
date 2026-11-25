import { sql } from "drizzle-orm";
import type { AppError } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import { brevoTrackedEmails } from "@/db/schema";
import { err, ok, type Result } from "@/types/result";
import { markNotFound, markRefreshed, type PickedEmail } from "./emailRepo";
import { foldStats, upsertCampaignRows } from "./mergeWindow";
import type { BrevoClient, CampaignStatsOutcome } from "./types";
import {
  coveredThroughAfter,
  type DateWindow,
  planWindows,
  startDateFor,
  utcDate,
} from "./windows";

export type EmailOutcome = "refreshed" | "notFound";

export interface EmailSyncDeps {
  db: Db;
  client: BrevoClient;
  nowMs: () => number;
}

async function commitWindow(
  db: Db,
  email: string,
  found: Extract<CampaignStatsOutcome, { found: true }>,
  coveredThrough: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    await upsertCampaignRows(tx, foldStats(email, found.stats));
    await tx
      .update(brevoTrackedEmails)
      .set({
        coveredThrough: sql`GREATEST(${brevoTrackedEmails.coveredThrough}, ${coveredThrough}::date)`,
      })
      .where(sql`${brevoTrackedEmails.email} = ${email}`);
  });
}

async function walkWindows(
  deps: EmailSyncDeps,
  email: string,
  windows: DateWindow[],
  today: string,
  signal: AbortSignal,
): Promise<Result<EmailOutcome, AppError>> {
  for (const window of windows) {
    signal.throwIfAborted();
    const fetched = await deps.client.campaignStats(email, window, signal);
    if (!fetched.ok) return err(fetched.error);
    if (!fetched.value.found) {
      await markNotFound(deps.db, email, new Date(deps.nowMs()));
      return ok("notFound");
    }
    await commitWindow(deps.db, email, fetched.value, coveredThroughAfter(window.endDate, today));
  }
  await markRefreshed(deps.db, email, new Date(deps.nowMs()));
  return ok("refreshed");
}

export async function syncEmail(
  deps: EmailSyncDeps,
  picked: PickedEmail,
  signal: AbortSignal,
): Promise<Result<EmailOutcome, AppError>> {
  const today = utcDate(deps.nowMs());
  const windows = planWindows(startDateFor(picked.coveredThrough, today), today);
  return walkWindows(deps, picked.email, windows, today, signal);
}
