import type { PgBoss } from "pg-boss";

// Settable, nullable singleton. A process that boots pg-boss (the worker, and in
// production the web process) calls setBoss after boss.start(). Any process that
// never sets it (tests, scripts) gets null from getBoss(), and reminder scheduling
// no-ops rather than throwing. This is what keeps DB-only tests free of a live queue.
//
// The instance hangs off globalThis rather than a module-scoped `let` because the bundler
// compiles this module once per layer: instrumentation.ts writes to its copy while the import,
// email, and reminder producers read from a different copy. Module state does not cross that
// boundary, so a plain `let` leaves every producer reading null forever, and enqueueBatchJob's
// null-guard then drops jobs silently. The process is the real scope of this singleton, so say so.
const KEY = Symbol.for("warpdrive.jobs.boss");

type BossGlobal = { [KEY]?: PgBoss | null };

export function setBoss(boss: PgBoss): void {
  (globalThis as BossGlobal)[KEY] = boss;
}

export function getBoss(): PgBoss | null {
  return (globalThis as BossGlobal)[KEY] ?? null;
}
