import type { PgBoss } from "pg-boss";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PGBOSS_QUEUE_RELEASE_CHECK } from "@/constants/jobNames";
import { withTestDb } from "@/db/testing";
import { RELEASE_CHECK_CRON } from "./constants";
import { refreshReleaseCache, registerReleaseCheckJob } from "./job";
import { readReleaseStatus, upsertReleaseStatus } from "./releaseStatus";

const sig = (): AbortSignal => new AbortController().signal;

afterEach(() => {
  vi.unstubAllGlobals();
});

function fakeBoss() {
  const queues: string[] = [];
  const schedules: { name: string; cron: string }[] = [];
  const sends: string[] = [];
  return {
    queues,
    schedules,
    sends,
    createQueue(name: string): Promise<void> {
      queues.push(name);
      return Promise.resolve();
    },
    work(name: string, handler: unknown): Promise<void> {
      void name;
      void handler;
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

describe("refreshReleaseCache", () => {
  it("caches the latest release on a successful fetch", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(Response.json({ tag_name: "v1.5.0", body: "notes" }))),
    );
    await withTestDb(async (db) => {
      await refreshReleaseCache(db, sig());
      const row = await readReleaseStatus(db);
      expect(row?.latestTag).toBe("v1.5.0");
      expect(row?.releaseNotes).toBe("notes");
    });
  });

  it("leaves the last-good row intact when the fetch fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve(new Response("boom", { status: 500 }))),
    );
    await withTestDb(async (db) => {
      await upsertReleaseStatus(db, { latestTag: "v1.4.0", releaseUrl: null, releaseNotes: null });
      await refreshReleaseCache(db, sig());
      const row = await readReleaseStatus(db);
      expect(row?.latestTag).toBe("v1.4.0");
    });
  });
});

describe("registerReleaseCheckJob", () => {
  it("creates the queue, schedules the cron, and kicks an immediate run when enabled", async () => {
    const boss = fakeBoss();
    await registerReleaseCheckJob(boss as unknown as PgBoss, false);
    expect(boss.queues).toContain(PGBOSS_QUEUE_RELEASE_CHECK);
    expect(boss.schedules).toContainEqual({
      name: PGBOSS_QUEUE_RELEASE_CHECK,
      cron: RELEASE_CHECK_CRON,
    });
    expect(boss.sends).toContain(PGBOSS_QUEUE_RELEASE_CHECK);
  });

  it("registers nothing when the update check is disabled", async () => {
    const boss = fakeBoss();
    await registerReleaseCheckJob(boss as unknown as PgBoss, true);
    expect(boss.queues).toHaveLength(0);
    expect(boss.schedules).toHaveLength(0);
    expect(boss.sends).toHaveLength(0);
  });
});
