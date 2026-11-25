import { BREVO_SYNC_START_BUDGET_MS } from "@/constants/brevo";
import { type AppError, ERROR_IDS } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import { err, ok, type Result } from "@/types/result";
import { syncCatalog } from "./catalog";
import { markAttempt, type PickedEmail, pickEmails } from "./emailRepo";
import { type EmailOutcome, syncEmail } from "./emailSync";
import { trackEmails } from "./track";
import type { BrevoClient } from "./types";

export interface SyncDeps {
  db: Db;
  client: BrevoClient;
  nowMs: () => number;
  startBudgetMs?: number;
  catalogPageSize?: number;
}

export interface SyncReport {
  catalogPages: number;
  attempted: number;
  refreshed: number;
  notFound: number;
  failed: number;
  stoppedForBudget: boolean;
}

function logUnauthorized(error: AppError): void {
  console.error("brevo rejected the credentials", { id: error.id, message: error.message });
}

function tally(
  report: SyncReport,
  outcome: Result<EmailOutcome, AppError>,
  email: string,
): AppError | null {
  if (outcome.ok) {
    if (outcome.value === "notFound") report.notFound += 1;
    else report.refreshed += 1;
    return null;
  }
  if (outcome.error.id === ERROR_IDS.BREVO_UNAUTHORIZED) return outcome.error;
  report.failed += 1;
  console.warn("brevo email sync failed", {
    id: outcome.error.id,
    email,
    message: outcome.error.message,
  });
  return null;
}

function newReport(): SyncReport {
  return {
    catalogPages: 0,
    attempted: 0,
    refreshed: 0,
    notFound: 0,
    failed: 0,
    stoppedForBudget: false,
  };
}

async function syncBatch(
  deps: SyncDeps,
  batch: PickedEmail[],
  report: SyncReport,
  runStartedMs: number,
  signal: AbortSignal,
): Promise<Result<"done" | "budget", AppError>> {
  const budgetMs = deps.startBudgetMs ?? BREVO_SYNC_START_BUDGET_MS;
  for (const picked of batch) {
    signal.throwIfAborted();
    if (deps.nowMs() - runStartedMs >= budgetMs) return ok("budget");
    await markAttempt(deps.db, picked.email, new Date(deps.nowMs()));
    report.attempted += 1;
    const fatal = tally(report, await syncEmail(deps, picked, signal), picked.email);
    if (fatal !== null) return err(fatal);
  }
  return ok("done");
}

export async function runBrevoSync(
  deps: SyncDeps,
  signal: AbortSignal,
): Promise<Result<SyncReport, AppError>> {
  const runStartedMs = deps.nowMs();
  const report = newReport();
  await trackEmails(deps.db, signal);
  const catalog = await syncCatalog(
    { db: deps.db, client: deps.client, pageSize: deps.catalogPageSize },
    signal,
  );
  if (!catalog.ok) {
    logUnauthorized(catalog.error);
    return err(catalog.error);
  }
  report.catalogPages = catalog.value.pages;
  for (;;) {
    const batch = await pickEmails(deps.db, deps.nowMs(), runStartedMs, signal);
    if (batch.length === 0) return ok(report);
    const done = await syncBatch(deps, batch, report, runStartedMs, signal);
    if (!done.ok) {
      logUnauthorized(done.error);
      return done;
    }
    if (done.value === "budget") {
      report.stoppedForBudget = true;
      return ok(report);
    }
  }
}
