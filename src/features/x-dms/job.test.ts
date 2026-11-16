import type { PgBoss } from "pg-boss";
import { describe, expect, it, vi } from "vitest";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import { PGBOSS_QUEUE_X_CHAT_BACKFILL, PGBOSS_QUEUE_X_SYNC } from "@/constants/jobNames";
import { X_SYNC_CRON } from "@/constants/xDms";
import { err, ok } from "@/types/result";
import { handleXChatBackfillRun, handleXSyncRun, registerXSyncJob } from "./job";
import type { SyncDeps } from "./sync";

function fakeBoss() {
  const queues: { name: string; options: unknown }[] = [];
  const workers: string[] = [];
  const schedules: { name: string; cron: string }[] = [];
  const sends: { name: string; data: unknown }[] = [];
  return {
    queues,
    workers,
    schedules,
    sends,
    createQueue(name: string, options?: unknown): Promise<void> {
      queues.push({ name, options });
      return Promise.resolve();
    },
    work(name: string): Promise<void> {
      workers.push(name);
      return Promise.resolve();
    },
    schedule(name: string, cron: string): Promise<void> {
      schedules.push({ name, cron });
      return Promise.resolve();
    },
    send(name: string, data: unknown): Promise<void> {
      sends.push({ name, data });
      return Promise.resolve();
    },
  };
}

const settings = { clientId: "id", clientSecret: "secret", redirectUri: "http://x/cb" };

describe("registerXSyncJob", () => {
  it("registers nothing when disabled", async () => {
    const boss = fakeBoss();
    await registerXSyncJob(boss as unknown as PgBoss, null);
    expect(boss.queues).toHaveLength(0);
    expect(boss.workers).toHaveLength(0);
    expect(boss.schedules).toHaveLength(0);
    expect(boss.sends).toHaveLength(0);
  });

  it("schedules x.sync on its cron and sends one initial job", async () => {
    const boss = fakeBoss();
    await registerXSyncJob(boss as unknown as PgBoss, settings);
    expect(boss.queues).toEqual([
      { name: PGBOSS_QUEUE_X_SYNC, options: { policy: "exclusive" } },
      { name: PGBOSS_QUEUE_X_CHAT_BACKFILL, options: { policy: "exclusive" } },
    ]);
    expect(boss.workers).toEqual([PGBOSS_QUEUE_X_SYNC, PGBOSS_QUEUE_X_CHAT_BACKFILL]);
    expect(boss.schedules).toEqual([{ name: PGBOSS_QUEUE_X_SYNC, cron: X_SYNC_CRON }]);
    expect(boss.sends).toEqual([{ name: PGBOSS_QUEUE_X_SYNC, data: {} }]);
  });
});

describe("handleXSyncRun", () => {
  const deps = {} as SyncDeps;

  it("resolves when the run is aborted mid-flight", async () => {
    const signal = AbortSignal.abort();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const run = vi.fn(() => Promise.reject(signal.reason as Error));
    await expect(handleXSyncRun(deps, signal, run)).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it("rethrows failures that are not aborts", async () => {
    const run = vi.fn(() => Promise.reject(new Error("boom")));
    await expect(handleXSyncRun(deps, new AbortController().signal, run)).rejects.toThrow("boom");
  });
});

describe("handleXChatBackfillRun", () => {
  const deps = {} as SyncDeps;
  const job = { data: { accountId: "account-1" } };

  it("runs the backfill for the job's account", async () => {
    const run = vi.fn(() => Promise.resolve(ok({ conversations: 2, keysCreated: 1 })));
    await handleXChatBackfillRun(deps, job, new AbortController().signal, run);
    expect(run.mock.calls[0]?.slice(0, 2)).toEqual([deps, "account-1"]);
  });

  it("resolves on an error result so the next sync run retries it", async () => {
    const run = vi.fn(() =>
      Promise.resolve(err(new AppError(ERROR_IDS.X_RATE_LIMITED, "fake rate limit"))),
    );
    await expect(
      handleXChatBackfillRun(deps, job, new AbortController().signal, run),
    ).resolves.toBeUndefined();
  });

  it("resolves when the run hits its time limit", async () => {
    const signal = AbortSignal.abort();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const run = vi.fn(() => Promise.reject(signal.reason as Error));
    await expect(handleXChatBackfillRun(deps, job, signal, run)).resolves.toBeUndefined();
    expect(warn.mock.calls).toEqual([
      ["x backfill: run hit its time limit", { accountId: "account-1" }],
    ]);
    warn.mockRestore();
  });

  it("ignores a job without an account id", async () => {
    const run = vi.fn(() => Promise.resolve(ok({ conversations: 0, keysCreated: 0 })));
    await handleXChatBackfillRun(deps, { data: {} }, new AbortController().signal, run);
    expect(run).not.toHaveBeenCalled();
  });
});
