"use client";
import { useActionError } from "@/components/shell/ActionErrorProvider";
import { Button } from "@/components/ui/Button";
import { STRINGS } from "@/constants/strings";
import { undoImportAction } from "@/features/import/actions";
import type { BatchSummary } from "@/features/import/results";
import { trpc } from "@/lib/trpc-client";
import { readCsrfToken } from "@/utils/csrfCookie";
import {
  SETTINGS_TABLE_CELL,
  SETTINGS_TABLE_HEAD,
  SETTINGS_TABLE_HEADER_CELL,
  SETTINGS_TABLE_ROW,
  SettingsCard,
  SettingsCardBody,
} from "../SettingsSurface";

const IMP = STRINGS.settings.importer;

function RowActions({
  batch,
  onUndo,
}: {
  batch: BatchSummary;
  onUndo: (id: string) => void;
}): React.ReactNode {
  const undoable = batch.status === "completed" || batch.status === "partial";
  return (
    <span className="space-x-3">
      {batch.errorRows > 0 && (
        <a
          href={`/settings/import/${batch.id}/errors.csv`}
          className="text-primary hover:underline"
        >
          {IMP.downloadErrors}
        </a>
      )}
      {batch.undoneAt !== null && <span className="text-muted-foreground">{IMP.undone}</span>}
      {batch.undoneAt === null && undoable && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onUndo(batch.id)}
          className="relative h-auto px-0 py-0 font-normal text-primary hover:bg-transparent hover:underline after:absolute after:left-0 after:top-1/2 after:h-10 after:w-full after:-translate-y-1/2 after:content-['']"
        >
          {IMP.undo}
        </Button>
      )}
    </span>
  );
}

export function ImportHistory(): React.ReactNode {
  const utils = trpc.useUtils();
  const reportError = useActionError();
  const batches = trpc.import.listBatches.useQuery().data ?? [];

  async function onUndo(batchId: string): Promise<void> {
    const r = await undoImportAction(batchId, readCsrfToken());
    if (r.ok) await utils.import.listBatches.invalidate();
    else reportError(r.error.id);
  }

  return (
    <div className="space-y-4">
      {batches.length === 0 ? (
        <SettingsCard>
          <SettingsCardBody>
            <p className="text-sm text-muted-foreground">{IMP.historyEmpty}</p>
          </SettingsCardBody>
        </SettingsCard>
      ) : (
        <SettingsCard className="overflow-x-auto shadow-none">
          <table className="w-full min-w-[720px] text-sm">
            <thead className={SETTINGS_TABLE_HEAD}>
              <tr className="border-b">
                <th className={SETTINGS_TABLE_HEADER_CELL}>{IMP.colFile}</th>
                <th className={SETTINGS_TABLE_HEADER_CELL}>{IMP.colTarget}</th>
                <th className={SETTINGS_TABLE_HEADER_CELL}>{IMP.colStatus}</th>
                <th className={SETTINGS_TABLE_HEADER_CELL}>{IMP.colResult}</th>
                <th className={SETTINGS_TABLE_HEADER_CELL}>{IMP.colActions}</th>
              </tr>
            </thead>
            <tbody>
              {batches.map((b) => (
                <tr key={b.id} className={SETTINGS_TABLE_ROW}>
                  <td className={SETTINGS_TABLE_CELL}>{b.filename}</td>
                  <td className={SETTINGS_TABLE_CELL}>{b.targetEntity}</td>
                  <td className={SETTINGS_TABLE_CELL}>{b.status}</td>
                  <td className={`${SETTINGS_TABLE_CELL} tabular-nums`}>
                    {IMP.resultCounts(b.importedRows, b.errorRows)}
                  </td>
                  <td className={`${SETTINGS_TABLE_CELL} text-right`}>
                    <RowActions batch={b} onUndo={(id) => void onUndo(id)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </SettingsCard>
      )}
    </div>
  );
}
