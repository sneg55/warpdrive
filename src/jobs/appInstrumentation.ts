import type { PgBoss } from "pg-boss";

// Injectable deps so the wiring is unit-testable without a live queue. The Next app process boots
// pg-boss here purely as a PRODUCER: it must publish a live boss so `getBoss()` stops returning
// null (otherwise email send, activity reminders, and import enqueues silently no-op in the web
// process). Job handlers are intentionally NOT registered here; they belong to the dedicated
// `worker` service, so registering them in the app too would double-process every job.
// The nodejs-runtime guard lives in the caller (instrumentation.register), which must decide
// whether to boot BEFORE importing the node-only env module; this stays runtime-agnostic.
export type StartAppBossDeps = {
  createBoss: () => PgBoss;
  setBoss: (boss: PgBoss) => void;
};

export async function startAppBoss(deps: StartAppBossDeps): Promise<PgBoss> {
  const boss = deps.createBoss();
  await boss.start();
  // Publish only after start resolves so producers never see an unstarted boss.
  deps.setBoss(boss);
  return boss;
}
