import { expect, test, vi } from "vitest";
import { SYNC_CADENCE_SECONDS } from "@/constants/email";
import { EMAIL_JOB_RETRY_LIMIT, PGBOSS_QUEUE_EMAIL_SYNC } from "@/constants/jobNames";
import { reEnqueueSync } from "./syncReEnqueue";

type Send = (
  queue: string,
  data: { accountId: string },
  options: Record<string, unknown>,
) => Promise<string | null>;

function boss(): { send: ReturnType<typeof vi.fn<Send>> } {
  return { send: vi.fn<Send>(() => Promise.resolve("job-1")) };
}
function counter(pending: number): { pendingTicks: (id: string) => Promise<number> } {
  return { pendingTicks: () => Promise.resolve(pending) };
}

test("queues the next tick when nothing is waiting for this mailbox", async () => {
  const b = boss();
  await reEnqueueSync(b, "acc-1", counter(0).pendingTicks);
  expect(b.send).toHaveBeenCalledWith(
    PGBOSS_QUEUE_EMAIL_SYNC,
    { accountId: "acc-1" },
    expect.objectContaining({
      startAfter: SYNC_CADENCE_SECONDS,
      singletonKey: "acc-1",
      retryLimit: EMAIL_JOB_RETRY_LIMIT,
      retryBackoff: true,
    }),
  );
});

test("queues nothing when a tick for this mailbox is already waiting", async () => {
  const b = boss();
  await reEnqueueSync(b, "acc-1", counter(1).pendingTicks);
  expect(b.send).not.toHaveBeenCalled();
});
