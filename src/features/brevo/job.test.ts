import type { PgBoss } from "pg-boss";
import { describe, expect, it } from "vitest";
import { BREVO_BASE_URL, BREVO_SYNC_CRON } from "@/constants/brevo";
import { PGBOSS_QUEUE_BREVO_SYNC } from "@/constants/jobNames";
import { registerBrevoSyncJob } from "./job";
import { brevoSettings } from "./settings";

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

describe("brevoSettings", () => {
  it("is null when no key is configured or the key is blank", () => {
    expect(brevoSettings({ BREVO_API_KEY: "" })).toBeNull();
    expect(brevoSettings({ BREVO_API_KEY: "   " })).toBeNull();
  });

  it("carries the trimmed key and the Brevo base url", () => {
    expect(brevoSettings({ BREVO_API_KEY: " k " })).toEqual({
      apiKey: "k",
      baseUrl: BREVO_BASE_URL,
    });
  });
});

describe("registerBrevoSyncJob", () => {
  it("registers nothing when the key is unset", async () => {
    const boss = fakeBoss();
    await registerBrevoSyncJob(boss as unknown as PgBoss, null);
    expect(boss.queues).toHaveLength(0);
    expect(boss.workers).toHaveLength(0);
    expect(boss.schedules).toHaveLength(0);
    expect(boss.sends).toHaveLength(0);
  });

  it("creates an exclusive queue, a worker, the 30 minute cron and a boot run when configured", async () => {
    const boss = fakeBoss();
    await registerBrevoSyncJob(boss as unknown as PgBoss, {
      apiKey: "k",
      baseUrl: BREVO_BASE_URL,
    });
    expect(boss.queues).toEqual([
      { name: PGBOSS_QUEUE_BREVO_SYNC, options: { policy: "exclusive" } },
    ]);
    expect(boss.workers).toEqual([PGBOSS_QUEUE_BREVO_SYNC]);
    expect(boss.schedules).toEqual([{ name: PGBOSS_QUEUE_BREVO_SYNC, cron: BREVO_SYNC_CRON }]);
    expect(boss.sends).toEqual([PGBOSS_QUEUE_BREVO_SYNC]);
    expect(BREVO_SYNC_CRON).toBe("*/30 * * * *");
  });
});
