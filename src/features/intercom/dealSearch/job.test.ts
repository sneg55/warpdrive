import type { Job, PgBoss } from "pg-boss";
import { describe, expect, it, vi } from "vitest";
import {
  INTERCOM_DEAL_SEARCH_BACKFILL_EXPIRE_SECONDS,
  INTERCOM_DEAL_SEARCH_BACKFILL_RUN_TIMEOUT_MS,
  INTERCOM_DEAL_SEARCH_RUN_TIMEOUT_MS,
  INTERCOM_DEAL_SEARCH_SWEEP_CRON,
} from "@/constants/intercom";
import {
  PGBOSS_QUEUE_INTERCOM_DEAL_SEARCH,
  PGBOSS_QUEUE_INTERCOM_DEAL_SEARCH_BACKFILL,
  PGBOSS_QUEUE_INTERCOM_DEAL_SEARCH_SWEEP,
} from "@/constants/jobNames";
import { intercomSearchBackfill } from "@/db/schema";
import { withTestDb } from "@/db/testing";
import { seedWorld } from "@/features/search/search.test-helpers";
import { advanceCheckpoint, completeCheckpoint, runDealSearchBackfill } from "./backfill";
import {
  captureDealSearchQueue,
  conversationFor,
  linkedDeal,
  MAYA_EMAIL,
  searchRows,
} from "./dealSearch.test-helpers";
import {
  DEAL_SEARCH_REFRESH_QUEUE_OPTIONS,
  handleDealSearchBackfill,
  handleDealSearchRefresh,
  handleDealSearchSweep,
  registerDealSearchJobs,
} from "./job";
import { refreshDealIntercomSearch } from "./refresh";

const signal = () => new AbortController().signal;

describe("handleDealSearchRefresh", () => {
  it("refreshes every deal in the batch and ignores malformed jobs", async () => {
    await withTestDb(async (db) => {
      const w = await seedWorld(db);
      const a = await linkedDeal(db, w);
      const b = await linkedDeal(db, w, "b@acme.com");
      await conversationFor(db, "c1", MAYA_EMAIL, { title: "A" });
      await conversationFor(db, "c2", "b@acme.com", { title: "B" });
      const jobs = [
        { data: { dealId: a.dealId }, signal: signal() },
        { data: { dealId: b.dealId }, signal: signal() },
        { data: { nope: true }, signal: signal() },
      ] as Job<unknown>[];
      await handleDealSearchRefresh(db, jobs);
      expect(await searchRows(db, a.dealId)).toHaveLength(2);
      expect(await searchRows(db, b.dealId)).toHaveLength(2);
    });
  });
});

describe("job signals", () => {
  it("stops a refresh whose job signal is aborted and writes nothing", async () => {
    await withTestDb(async (db) => {
      const w = await seedWorld(db);
      const a = await linkedDeal(db, w);
      await conversationFor(db, "c1", MAYA_EMAIL, { title: "A" });
      const expired = new AbortController();
      expired.abort();
      const jobs = [{ data: { dealId: a.dealId }, signal: expired.signal }] as Job<unknown>[];
      await expect(handleDealSearchRefresh(db, jobs)).rejects.toThrow();
      expect(await searchRows(db, a.dealId)).toEqual([]);
    });
  });

  it("stops a backfill when the job signal aborts and leaves a resumable checkpoint", async () => {
    await withTestDb(async (db) => {
      const w = await seedWorld(db);
      await linkedDeal(db, w);
      await linkedDeal(db, w, "b@acme.com");
      await linkedDeal(db, w, "c@acme.com");
      const job = new AbortController();
      await expect(
        handleDealSearchBackfill(
          db,
          { signal: job.signal },
          { pageSize: 1, afterPage: () => job.abort() },
        ),
      ).rejects.toThrow();
      const [state] = await db.select().from(intercomSearchBackfill);
      expect(state?.cursorDealId).not.toBeNull();
      expect(state?.completedAt).toBeNull();
      await handleDealSearchBackfill(db, { signal: new AbortController().signal }, { pageSize: 1 });
      const [done] = await db.select().from(intercomSearchBackfill);
      expect(done?.completedAt).not.toBeNull();
    });
  });
});

describe("advanceCheckpoint", () => {
  it("only moves the cursor forward and never reopens a completed run", async () => {
    await withTestDb(async (db) => {
      const low = "00000000-0000-4000-8000-000000000001";
      const high = "00000000-0000-4000-8000-000000000009";
      await advanceCheckpoint(db, high, signal());
      await advanceCheckpoint(db, low, signal());
      const [state] = await db.select().from(intercomSearchBackfill);
      expect(state?.cursorDealId).toBe(high);
      await completeCheckpoint(db, high, signal());
      await advanceCheckpoint(db, "00000000-0000-4000-8000-0000000000ff", signal());
      const [after] = await db.select().from(intercomSearchBackfill);
      expect(after?.cursorDealId).toBe(high);
      expect(after?.completedAt).not.toBeNull();
    });
  });
});

describe("handleDealSearchSweep", () => {
  it("re-enqueues every deal with linked Intercom contacts", async () => {
    await withTestDb(async (db) => {
      const w = await seedWorld(db);
      const a = await linkedDeal(db, w);
      await linkedDeal(db, w, "unmatched@acme.com");
      await conversationFor(db, "c1", MAYA_EMAIL);
      const q = captureDealSearchQueue();
      try {
        await handleDealSearchSweep(db, { signal: signal() });
        expect(q.queued()).toEqual([a.dealId]);
      } finally {
        q.release();
      }
    });
  });
});

describe("runDealSearchBackfill", () => {
  it("fills every deal across pages and records completion", async () => {
    await withTestDb(async (db) => {
      const w = await seedWorld(db);
      const a = await linkedDeal(db, w);
      const b = await linkedDeal(db, w, "b@acme.com");
      const c = await linkedDeal(db, w, "c@acme.com");
      await conversationFor(db, "c1", MAYA_EMAIL, { title: "A" });
      await conversationFor(db, "c2", "b@acme.com", { title: "B" });
      await conversationFor(db, "c3", "c@acme.com", { title: "C" });
      await runDealSearchBackfill(db, signal(), 2);
      for (const d of [a, b, c]) expect(await searchRows(db, d.dealId)).toHaveLength(2);
      const [state] = await db.select().from(intercomSearchBackfill);
      expect(state?.completedAt).not.toBeNull();
    });
  });

  it("resumes after the checkpoint instead of starting over", async () => {
    await withTestDb(async (db) => {
      const w = await seedWorld(db);
      const deals3 = [
        await linkedDeal(db, w),
        await linkedDeal(db, w, "b@acme.com"),
        await linkedDeal(db, w, "c@acme.com"),
      ].sort((x, y) => x.dealId.localeCompare(y.dealId));
      await conversationFor(db, "c1", MAYA_EMAIL, { title: "A" });
      await conversationFor(db, "c2", "b@acme.com", { title: "B" });
      await conversationFor(db, "c3", "c@acme.com", { title: "C" });
      await db.insert(intercomSearchBackfill).values({ cursorDealId: deals3[0]?.dealId });
      await runDealSearchBackfill(db, signal(), 1);
      expect(await searchRows(db, deals3[0]?.dealId ?? "")).toHaveLength(0);
      expect(await searchRows(db, deals3[1]?.dealId ?? "")).toHaveLength(2);
      expect(await searchRows(db, deals3[2]?.dealId ?? "")).toHaveLength(2);
    });
  });

  it("keeps the checkpoint of a run that was cut short and not complete", async () => {
    await withTestDb(async (db) => {
      const w = await seedWorld(db);
      await linkedDeal(db, w);
      await linkedDeal(db, w, "b@acme.com");
      const controller = new AbortController();
      const pages: number[] = [];
      await expect(
        runDealSearchBackfill(db, controller.signal, 1, () => {
          pages.push(1);
          controller.abort();
        }),
      ).rejects.toThrow();
      const [state] = await db.select().from(intercomSearchBackfill);
      expect(pages).toHaveLength(1);
      expect(state?.cursorDealId).not.toBeNull();
      expect(state?.completedAt).toBeNull();
    });
  });
});

function fakeBoss() {
  const work = vi.fn();
  const boss = {
    createQueue: vi.fn(() => Promise.resolve()),
    work,
    send: vi.fn(() => Promise.resolve("job")),
    schedule: vi.fn(() => Promise.resolve()),
  };
  return { boss, work, asBoss: boss as unknown as PgBoss };
}

describe("registerDealSearchJobs", () => {
  it("creates queues without a dedupe policy and with expiry covering each run budget", async () => {
    await withTestDb(async (db) => {
      const f = fakeBoss();
      await registerDealSearchJobs(f.asBoss, db);
      expect(f.boss.createQueue).toHaveBeenCalledWith(
        PGBOSS_QUEUE_INTERCOM_DEAL_SEARCH,
        DEAL_SEARCH_REFRESH_QUEUE_OPTIONS,
      );
      expect(DEAL_SEARCH_REFRESH_QUEUE_OPTIONS.policy).toBe("standard");
      expect(DEAL_SEARCH_REFRESH_QUEUE_OPTIONS.expireInSeconds * 1000).toBeGreaterThan(
        INTERCOM_DEAL_SEARCH_RUN_TIMEOUT_MS,
      );
      expect(f.boss.createQueue).toHaveBeenCalledWith(PGBOSS_QUEUE_INTERCOM_DEAL_SEARCH_BACKFILL, {
        policy: "exclusive",
        expireInSeconds: INTERCOM_DEAL_SEARCH_BACKFILL_EXPIRE_SECONDS,
      });
      expect(INTERCOM_DEAL_SEARCH_BACKFILL_EXPIRE_SECONDS * 1000).toBeGreaterThan(
        INTERCOM_DEAL_SEARCH_BACKFILL_RUN_TIMEOUT_MS,
      );
      expect(f.work.mock.calls.map((c) => c[0])).toEqual([
        PGBOSS_QUEUE_INTERCOM_DEAL_SEARCH,
        PGBOSS_QUEUE_INTERCOM_DEAL_SEARCH_BACKFILL,
        PGBOSS_QUEUE_INTERCOM_DEAL_SEARCH_SWEEP,
      ]);
      expect(f.boss.schedule).toHaveBeenCalledWith(
        PGBOSS_QUEUE_INTERCOM_DEAL_SEARCH_SWEEP,
        INTERCOM_DEAL_SEARCH_SWEEP_CRON,
      );
    });
  });

  it("enqueues the backfill until a run has completed, whatever else is in the table", async () => {
    await withTestDb(async (db) => {
      const w = await seedWorld(db);
      const { dealId } = await linkedDeal(db, w);
      await conversationFor(db, "c1", MAYA_EMAIL, { title: "A" });
      await refreshDealIntercomSearch(db, [dealId], signal());
      const f = fakeBoss();
      await registerDealSearchJobs(f.asBoss, db);
      expect(f.boss.send).toHaveBeenCalledWith(
        PGBOSS_QUEUE_INTERCOM_DEAL_SEARCH_BACKFILL,
        {},
        { singletonKey: "all" },
      );
    });
  });

  it("does not enqueue the backfill again once a run has completed", async () => {
    await withTestDb(async (db) => {
      const w = await seedWorld(db);
      await linkedDeal(db, w);
      await runDealSearchBackfill(db, signal());
      const f = fakeBoss();
      await registerDealSearchJobs(f.asBoss, db);
      expect(f.boss.send).not.toHaveBeenCalled();
    });
  });
});
