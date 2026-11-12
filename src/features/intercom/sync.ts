import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import {
  INTERCOM_BACKFILL_DAYS,
  INTERCOM_CONTACT_CACHE_TTL_MS,
  INTERCOM_CURSOR_OVERLAP_SECONDS,
  INTERCOM_MAX_PAGES_PER_RUN,
  INTERCOM_MAX_STALLED_RUNS,
  INTERCOM_SEARCH_PER_PAGE,
} from "@/constants/intercom";
import type * as schema from "@/db/schema";
import { uniqueBy } from "./batch";
import { refreshStaleContacts } from "./contactRefresh";
import { fetchPageItems, type ItemOutcome } from "./fetchItems";
import { isTransientIntercomError } from "./intercomClient";
import type { SyncState } from "./repo";
import { readSyncState, type SearchResume, writePage, writeRunEnd } from "./repo";
import type { IntercomClient, SearchItem } from "./types";

type Db = NodePgDatabase<typeof schema>;

const SECONDS_PER_DAY = 86_400;

export interface SyncDeps {
  db: Db;
  client: IntercomClient;
  nowMs: () => number;
  perPage?: number;
  maxPages?: number;
}

export interface SyncReport {
  pages: number;
  written: number;
  failed: number;
  cursor: number;
  heldAt: number | null;
}

interface RunContext {
  deps: SyncDeps;
  honorRetries: boolean;
  contactFreshSince: Date;
  updatedAfter: number;
  signal: AbortSignal;
}

function retryFloor(outcomes: ItemOutcome[]): number | null {
  const floors = outcomes.flatMap((o) => (o.kind === "failed" && o.retry ? [o.updatedAt - 1] : []));
  return floors.length === 0 ? null : Math.min(...floors);
}

function pageMax(items: SearchItem[]): number {
  return items.reduce((max, i) => Math.max(max, i.updatedAt), 0);
}

async function syncPage(
  ctx: RunContext,
  items: SearchItem[],
  nextCursor: string | null,
  report: SyncReport,
): Promise<void> {
  const outcomes = await fetchPageItems(ctx.deps, items, ctx.contactFreshSince, ctx.signal);
  const floor = ctx.honorRetries ? retryFloor(outcomes) : null;
  if (floor !== null) report.heldAt = Math.min(floor, report.heldAt ?? floor);
  report.cursor = report.heldAt ?? Math.max(report.cursor, pageMax(items));
  const ok = outcomes.flatMap((o) => (o.kind === "ok" ? [o] : []));
  const resume: SearchResume | null =
    nextCursor === null
      ? null
      : { updatedAfter: ctx.updatedAfter, startingAfter: nextCursor, held: report.heldAt !== null };
  await writePage(
    ctx.deps.db,
    {
      conversations: ok.map((o) => o.stored),
      deletedIds: outcomes.flatMap((o) => (o.kind === "gone" ? [o.id] : [])),
      contacts: ok.flatMap((o) => o.contacts),
      cursor: report.cursor,
      resume,
      fetchedAt: new Date(ctx.deps.nowMs()),
    },
    ctx.signal,
  );
  report.written += ok.length;
  report.failed += outcomes.filter((o) => o.kind === "failed").length;
}

function startOf(state: SyncState | null, nowS: number) {
  const cursor = state?.cursor ?? nowS - INTERCOM_BACKFILL_DAYS * SECONDS_PER_DAY;
  const stalledRuns = state?.stalledRuns ?? 0;
  const honorRetries = stalledRuns < INTERCOM_MAX_STALLED_RUNS;
  const resume = state?.resume ?? null;
  return {
    cursor,
    honorRetries,
    resume,
    updatedAfter: resume?.updatedAfter ?? Math.max(0, cursor - INTERCOM_CURSOR_OVERLAP_SECONDS),
    heldAt: resume?.held === true && honorRetries ? cursor : null,
  };
}

export async function runIntercomSync(deps: SyncDeps, signal: AbortSignal): Promise<SyncReport> {
  const state = await readSyncState(deps.db, signal);
  const start = startOf(state, Math.floor(deps.nowMs() / 1000));
  const ctx: RunContext = {
    deps,
    honorRetries: start.honorRetries,
    contactFreshSince: new Date(deps.nowMs() - INTERCOM_CONTACT_CACHE_TTL_MS),
    updatedAfter: start.updatedAfter,
    signal,
  };
  const report: SyncReport = {
    pages: 0,
    written: 0,
    failed: 0,
    cursor: start.cursor,
    heldAt: start.heldAt,
  };
  let startingAfter = start.resume?.startingAfter ?? null;
  let finished = false;
  let searchFailed = false;

  while (!finished && report.pages < (deps.maxPages ?? INTERCOM_MAX_PAGES_PER_RUN)) {
    const page = await deps.client.searchConversations(
      {
        updatedAfter: ctx.updatedAfter,
        startingAfter,
        perPage: deps.perPage ?? INTERCOM_SEARCH_PER_PAGE,
      },
      signal,
    );
    if (!page.ok) {
      console.error(`${page.error.id} intercom sync: search failed`, page.error.context);
      finished = startingAfter !== null && !isTransientIntercomError(page.error);
      searchFailed = true;
      break;
    }
    const items = uniqueBy(page.value.items, (i) => i.id);
    if (items.length > 0) await syncPage(ctx, items, page.value.nextCursor, report);
    report.pages += 1;
    finished = page.value.nextCursor === null;
    startingAfter = page.value.nextCursor;
  }
  if (state !== null || report.pages > 0) {
    const previous = state?.stalledRuns ?? 0;
    const stalledRuns = report.heldAt === null ? 0 : finished ? previous + 1 : previous;
    await writeRunEnd(deps.db, { stalledRuns, clearResume: finished }, signal);
  }
  if (!searchFailed) {
    await refreshStaleContacts(deps, ctx.contactFreshSince, new Date(deps.nowMs()), signal);
  }
  return report;
}
