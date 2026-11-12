import type { PgBoss } from "pg-boss";
import { describe, expect, it } from "vitest";
import { INTERCOM_REGION_HOSTS, INTERCOM_SYNC_CRON } from "@/constants/intercom";
import { PGBOSS_QUEUE_INTERCOM_SYNC } from "@/constants/jobNames";
import { registerIntercomSyncJob } from "./job";
import { intercomSettings } from "./settings";

function fakeBoss() {
  const queues: { name: string; options: unknown }[] = [];
  const workers: string[] = [];
  const schedules: { name: string; cron: string }[] = [];
  const sends: string[] = [];
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
    send(name: string): Promise<void> {
      sends.push(name);
      return Promise.resolve();
    },
  };
}

describe("intercomSettings", () => {
  it("is null when no token is configured", () => {
    expect(intercomSettings({ INTERCOM_ACCESS_TOKEN: "", INTERCOM_REGION: "eu" })).toBeNull();
  });

  it("maps the region to its API host", () => {
    expect(intercomSettings({ INTERCOM_ACCESS_TOKEN: "t", INTERCOM_REGION: "au" })).toEqual({
      token: "t",
      baseUrl: INTERCOM_REGION_HOSTS.au,
    });
  });
});

describe("registerIntercomSyncJob", () => {
  it("registers nothing when the token is unset", async () => {
    const boss = fakeBoss();
    await registerIntercomSyncJob(boss as unknown as PgBoss, null);
    expect(boss.queues).toHaveLength(0);
    expect(boss.workers).toHaveLength(0);
    expect(boss.schedules).toHaveLength(0);
    expect(boss.sends).toHaveLength(0);
  });

  it("creates an exclusive queue, a worker and the cron when configured", async () => {
    const boss = fakeBoss();
    await registerIntercomSyncJob(boss as unknown as PgBoss, {
      token: "t",
      baseUrl: INTERCOM_REGION_HOSTS.us,
    });
    expect(boss.queues).toEqual([
      { name: PGBOSS_QUEUE_INTERCOM_SYNC, options: { policy: "exclusive" } },
    ]);
    expect(boss.workers).toEqual([PGBOSS_QUEUE_INTERCOM_SYNC]);
    expect(boss.schedules).toEqual([
      { name: PGBOSS_QUEUE_INTERCOM_SYNC, cron: INTERCOM_SYNC_CRON },
    ]);
    expect(boss.sends).toEqual([PGBOSS_QUEUE_INTERCOM_SYNC]);
  });
});
