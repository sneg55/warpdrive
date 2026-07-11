import { IMPORT_PROGRESS_MIN_STEP } from "@/constants/importStatus";
import { wsChannel } from "@/constants/wsChannels";
import { publishEvent } from "@/server/notify";
import type { DbOrTx } from "@/server/realtime/channelVersions";
import type { PublishedEvent } from "@/server/ws/payload";

export type ImportPhase = "prepare" | "validate" | "commit" | "undo";

export interface ProgressArgs {
  batchId: string;
  phase: ImportPhase;
  processed: number;
  total: number;
  status: string;
}

// One event per max(total/50, floor) rows keeps a 50k-row phase to ~50 notifications.
export function progressStep(total: number): number {
  return Math.max(Math.floor(total / 50), IMPORT_PROGRESS_MIN_STEP);
}

// Emit on the final row unconditionally so the terminal count is never dropped.
export function shouldEmit(processed: number, total: number, lastEmitted: number): boolean {
  if (processed >= total) return true;
  return processed - lastEmitted >= progressStep(total);
}

export function importProgressEvent(args: ProgressArgs): PublishedEvent {
  return {
    v: 1,
    channel: wsChannel.importBatch(args.batchId),
    ts: new Date().toISOString(),
    actorId: null,
    type: "import_progress",
    data: {
      batchId: args.batchId,
      phase: args.phase,
      processed: args.processed,
      total: args.total,
      status: args.status,
    },
  };
}

export async function publishImportProgress(
  tx: DbOrTx,
  args: ProgressArgs,
  signal: AbortSignal,
): Promise<void> {
  await publishEvent(tx, importProgressEvent(args), signal);
}
