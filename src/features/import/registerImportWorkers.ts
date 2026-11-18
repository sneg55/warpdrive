import type { PgBoss } from "pg-boss";
import { registerImportCommitWorker } from "./commitJob";
import { registerImportPrepareWorker } from "./prepareJob";
import { registerImportUndoWorker } from "./undoJob";
import { registerImportValidateWorker } from "./validateJob";

export async function registerImportWorkers(boss: PgBoss): Promise<void> {
  await registerImportPrepareWorker(boss);
  await registerImportValidateWorker(boss);
  await registerImportCommitWorker(boss);
  await registerImportUndoWorker(boss);
}
