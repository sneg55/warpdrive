import type { PgBoss } from "pg-boss";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PGBOSS_QUEUE_EMAIL_SYNC } from "@/constants/jobNames";
import { enqueueInitialSync } from "./syncScheduling";

// The boss singleton hangs off globalThis under this symbol (see src/jobs/boss.ts).
const BOSS_KEY = Symbol.for("warpdrive.jobs.boss");
function setBoss(boss: PgBoss | null): void {
  (globalThis as { [BOSS_KEY]?: PgBoss | null })[BOSS_KEY] = boss;
}

afterEach(() => {
  setBoss(null);
});

describe("enqueueInitialSync", () => {
  // Regression: connecting a mailbox while the worker is already running left the mailbox with
  // no sync chain (the boot loop had already run with zero connected accounts), so the inbox
  // never synced. The connect callback must seed the chain itself.
  it("enqueues one sync tick for the account, keyed by accountId so it dedups an existing chain", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    setBoss({ send } as unknown as PgBoss);

    await enqueueInitialSync("acct-123");

    expect(send).toHaveBeenCalledTimes(1);
    const [queue, data, opts] = send.mock.calls[0] as [string, unknown, { singletonKey: string }];
    expect(queue).toBe(PGBOSS_QUEUE_EMAIL_SYNC);
    expect(data).toEqual({ accountId: "acct-123" });
    expect(opts.singletonKey).toBe("acct-123");
  });

  // Tests and one-off scripts never boot a queue; the producer must stay callable there.
  it("no-ops when no boss is set", async () => {
    setBoss(null);
    await expect(enqueueInitialSync("acct-x")).resolves.toBeUndefined();
  });
});
