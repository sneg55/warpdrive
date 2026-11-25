import { describe, expect, it, vi } from "vitest";
import {
  PGBOSS_QUEUE_BREVO_SYNC,
  PGBOSS_QUEUE_EMAIL_SEND,
  PGBOSS_QUEUE_EMAIL_SYNC,
  PGBOSS_QUEUE_FILE_REAPER,
  PGBOSS_QUEUE_INTERCOM_DEAL_SEARCH,
  PGBOSS_QUEUE_INTERCOM_DEAL_SEARCH_BACKFILL,
  PGBOSS_QUEUE_INTERCOM_SYNC,
  PGBOSS_QUEUE_RELEASE_CHECK,
} from "@/constants/jobNames";
import { emailAccounts } from "@/db/schema";
import { seedUser } from "@/db/testing/factories";
import { makeTestDb } from "@/test/db";
import { registerAllJobs } from "./worker";

const testDbHolder: { db: Awaited<ReturnType<typeof makeTestDb>> | null } = { db: null };

vi.mock("@/db/client", () => {
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
interface SendRecord {
  name: string;
  data: unknown;
}

function makeFakeBoss() {
  const queues: QueueRecord[] = [];
  const workers: WorkRecord[] = [];
  const schedules: ScheduleRecord[] = [];
  const sends: SendRecord[] = [];

  return {
    queues,
    workers,
    schedules,
    sends,
    createQueue(name: string): Promise<void> {
      queues.push({ name });
      return Promise.resolve();
    },
    work(name: string, handler: unknown): Promise<void> {
      void handler;
      workers.push({ name });
      return Promise.resolve();
    },
    send(name: string, data: unknown): Promise<void> {
      sends.push({ name, data });
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

      expect(queueNames).toContain(PGBOSS_QUEUE_RELEASE_CHECK);
      expect(fakeBoss.schedules.some((s) => s.name === PGBOSS_QUEUE_RELEASE_CHECK)).toBe(true);

      expect(queueNames).toContain(PGBOSS_QUEUE_INTERCOM_DEAL_SEARCH);
      expect(queueNames).toContain(PGBOSS_QUEUE_INTERCOM_DEAL_SEARCH_BACKFILL);
      expect(queueNames).not.toContain(PGBOSS_QUEUE_INTERCOM_SYNC);
      expect(fakeBoss.schedules.some((s) => s.name === PGBOSS_QUEUE_INTERCOM_SYNC)).toBe(false);
      expect(queueNames).not.toContain(PGBOSS_QUEUE_BREVO_SYNC);
      expect(fakeBoss.schedules.some((s) => s.name === PGBOSS_QUEUE_BREVO_SYNC)).toBe(false);
    } finally {
      testDbHolder.db = null;
      await h.close();
    }
  });

  it("enqueues a sync tick for every mailbox that is not disconnected, errored ones included", async () => {
    const h = await makeTestDb();
    testDbHolder.db = h;

    try {
      const erroredOwner = await seedUser(h.db);
      const disconnectedOwner = await seedUser(h.db);
      const [errored] = await h.db
        .insert(emailAccounts)
        .values({ userId: erroredOwner.id, emailAddress: "errored@example.com", status: "error" })
        .returning();
      await h.db.insert(emailAccounts).values({
        userId: disconnectedOwner.id,
        emailAddress: "off@example.com",
        status: "disconnected",
      });
      const fakeBoss = makeFakeBoss();

      await registerAllJobs(fakeBoss as unknown as Parameters<typeof registerAllJobs>[0]);

      const syncSends = fakeBoss.sends.filter((s) => s.name === PGBOSS_QUEUE_EMAIL_SYNC);
      expect(syncSends).toEqual([
        { name: PGBOSS_QUEUE_EMAIL_SYNC, data: { accountId: errored?.id } },
      ]);
    } finally {
      testDbHolder.db = null;
      await h.close();
    }
  });
});
