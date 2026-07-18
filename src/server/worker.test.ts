// Integration test for registerAllJobs wiring. Uses a real Postgres container
// (via withTestDb) so the email_accounts SELECT inside registerEmailJobs does not
// throw; an empty table returns 0 rows and 0 enqueues, which is the expected
// behavior on a fresh installation with no connected mailboxes.
//
// The prod db singleton (src/db/client.ts) is redirected to the test container
// via vi.mock so registerEmailJobs's internal SELECT hits a real Postgres with
// the proper schema, not the placeholder URL from vitest.setup.ts.

import { describe, expect, it, vi } from "vitest";
import {
  PGBOSS_QUEUE_EMAIL_SEND,
  PGBOSS_QUEUE_EMAIL_SYNC,
  PGBOSS_QUEUE_FILE_REAPER,
  PGBOSS_QUEUE_RELEASE_CHECK,
} from "@/constants/jobNames";
import { makeTestDb } from "@/test/db";
import { registerAllJobs } from "./worker";

// ---------------------------------------------------------------------------
// Redirect the prod db singleton to the test container.
// This is NOT mocking the DB: it is a real Postgres connection, just pointed at
// the test container instead of the placeholder URL from vitest.setup.ts.
// ---------------------------------------------------------------------------
const testDbHolder: { db: Awaited<ReturnType<typeof makeTestDb>> | null } = { db: null };

vi.mock("@/db/client", () => {
  // Lazily return the live db from the test container. testDbHolder.db is set
  // before any test calls registerEmailJobs, so the module factory can read it.
  return {
    get db() {
      if (testDbHolder.db === null) throw new Error("testDbHolder.db not initialized");
      return testDbHolder.db.db;
    },
    get pool() {
      if (testDbHolder.db === null) throw new Error("testDbHolder.db not initialized");
      return testDbHolder.db.pool;
    },
  };
});

// ---------------------------------------------------------------------------
// Recording fake boss: captures createQueue/work/send/schedule calls for assertion.
// Methods return Promise<void> explicitly (no async keyword) to satisfy
// @typescript-eslint/require-await while still matching the PgBoss interface.
// ---------------------------------------------------------------------------
interface QueueRecord {
  name: string;
}
interface WorkRecord {
  name: string;
}
interface ScheduleRecord {
  name: string;
  cron: string;
}

function makeFakeBoss() {
  const queues: QueueRecord[] = [];
  const workers: WorkRecord[] = [];
  const schedules: ScheduleRecord[] = [];

  return {
    queues,
    workers,
    schedules,
    createQueue(name: string): Promise<void> {
      queues.push({ name });
      return Promise.resolve();
    },
    work(name: string, handler: unknown): Promise<void> {
      void handler;
      workers.push({ name });
      return Promise.resolve();
    },
    send(name: string, data: unknown, opts?: unknown): Promise<void> {
      void name;
      void data;
      void opts;
      // no-op: empty DB means no connected accounts, so this is never called
      return Promise.resolve();
    },
    schedule(name: string, cron: string): Promise<void> {
      schedules.push({ name, cron });
      return Promise.resolve();
    },
  };
}

describe("registerAllJobs", () => {
  it("creates all three queues and schedules the reaper", async () => {
    const h = await makeTestDb();
    testDbHolder.db = h;

    try {
      const fakeBoss = makeFakeBoss();

      await registerAllJobs(fakeBoss as unknown as Parameters<typeof registerAllJobs>[0]);

      const queueNames = fakeBoss.queues.map((q) => q.name);
      expect(queueNames).toContain(PGBOSS_QUEUE_EMAIL_SYNC);
      expect(queueNames).toContain(PGBOSS_QUEUE_EMAIL_SEND);
      expect(queueNames).toContain(PGBOSS_QUEUE_FILE_REAPER);

      const scheduled = fakeBoss.schedules.find((s) => s.name === PGBOSS_QUEUE_FILE_REAPER);
      expect(scheduled).toBeDefined();
      expect(scheduled?.cron).toBe("0 * * * *");

      // The release-check job is enabled in the test env (DISABLE_UPDATE_CHECK unset), so its
      // queue is created and scheduled alongside the reaper.
      expect(queueNames).toContain(PGBOSS_QUEUE_RELEASE_CHECK);
      expect(fakeBoss.schedules.some((s) => s.name === PGBOSS_QUEUE_RELEASE_CHECK)).toBe(true);
    } finally {
      testDbHolder.db = null;
      await h.close();
    }
  });
});
