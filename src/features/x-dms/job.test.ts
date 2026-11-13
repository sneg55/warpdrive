import type { PgBoss } from "pg-boss";
import { describe, expect, it, vi } from "vitest";
import { PGBOSS_QUEUE_X_SYNC } from "@/constants/jobNames";
import { X_SYNC_CRON } from "@/constants/xDms";
import { handleXSyncRun, registerXSyncJob } from "./job";
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
    expect(boss.queues).toEqual([{ name: PGBOSS_QUEUE_X_SYNC, options: { policy: "exclusive" } }]);
    expect(boss.workers).toEqual([PGBOSS_QUEUE_X_SYNC]);
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
