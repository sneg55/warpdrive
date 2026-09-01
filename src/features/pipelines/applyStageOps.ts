import { ERROR_IDS } from "@/constants/errorIds";
import { createStageAction, deleteStageAction, updateStageAction } from "./pipelineEditActions";
import type { StageOps } from "./stageDiff";

interface StageOpsProgress {
  createdIds: string[];
  settledDeletes: string[];
}

export type ApplyStageOpsResult =
  | ({ ok: true } & StageOpsProgress)
  | ({ ok: false; errorId: string } & StageOpsProgress);

export async function applyStageOps(
  pipelineId: string,
  ops: StageOps,
  csrf: string | null,
): Promise<ApplyStageOpsResult> {
  const createdIds: string[] = [];
  const settledDeletes: string[] = [];
  const failed = (errorId: string): ApplyStageOpsResult => ({
    ok: false,
    errorId,
    createdIds,
    settledDeletes,
  });
  try {
    for (const stageId of ops.deletes) {
      const r = await deleteStageAction({ stageId }, csrf);
      if (!r.ok) return failed(r.error.id);
      settledDeletes.push(stageId);
    }
    for (const c of ops.creates) {
      const r = await createStageAction({ pipelineId, ...c }, csrf);
      if (!r.ok) return failed(r.error.id);
      createdIds.push(r.value.id);
    }
    for (const u of ops.updates) {
      const r = await updateStageAction(u, csrf);
      if (!r.ok) return failed(r.error.id);
    }
  } catch {
    return failed(ERROR_IDS.UI_ACTION_UNCONFIRMED);
  }
  return { ok: true, createdIds, settledDeletes };
}
