import type { PgBoss } from "pg-boss";
import { registerImportCommitWorker } from "./commitJob";
import { registerImportPrepareWorker } from "./prepareJob";
import { registerImportUndoWorker } from "./undoJob";
import { registerImportValidateWorker } from "./validateJob";

// Register every import job worker (prepare -> validate -> commit, plus undo) on a boss. Shared by
// the dedicated `worker` service and the dev in-process boot (instrumentation.ts) so the two paths
// consume the exact same queue set and can never drift. Without a live consumer an uploaded CSV
// hangs at status "uploaded" forever (0 imported, 0 errors).
export async function registerImportWorkers(boss: PgBoss): Promise<void> {
  await registerImportPrepareWorker(boss);
  await registerImportValidateWorker(boss);
  await registerImportCommitWorker(boss);
  await registerImportUndoWorker(boss);
}
