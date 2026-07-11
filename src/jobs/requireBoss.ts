import type { PgBoss } from "pg-boss";
import { env } from "@/config/env";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import { getBoss } from "./boss";

// The gate every job PRODUCER should call instead of getBoss() directly.
//
// A null boss means two very different things depending on where we are. In tests and one-off
// scripts nobody boots a queue, and producers must stay callable, so null is a legitimate no-op.
// In production a null boss is a wiring bug: instrumentation.ts failed to publish the boss, and
// every enqueue after that is silently discarded while the caller still reports success. That is
// exactly how a broken CSV import looked healthy for three days (the batch sat at "uploaded" and
// the wizard polled forever). Make the production case throw so it surfaces at the caller.
//
// Lives apart from boss.ts because instrumentation.ts imports that module on the edge runtime,
// where the node-only env module must not be pulled in.
export function requireBoss(): PgBoss | null {
  const boss = getBoss();
  if (boss !== null) return boss;
  if (env.NODE_ENV === "production") {
    throw new AppError(
      ERROR_IDS.JOBS_BOSS_MISSING,
      "no pg-boss in this process; the job would be silently dropped",
      {},
    );
  }
  return null;
}
