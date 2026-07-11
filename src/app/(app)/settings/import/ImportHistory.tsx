"use client";
import { useActionError } from "@/components/shell/ActionErrorProvider";
import { STRINGS } from "@/constants/strings";
import { undoImportAction } from "@/features/import/actions";
import type { BatchSummary } from "@/features/import/results";
import { trpc } from "@/lib/trpc-client";
import { readCsrfToken } from "@/utils/csrfCookie";

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
        <button
          type="button"
          onClick={() => onUndo(batch.id)}
          className="text-primary hover:underline"
        >
          {IMP.undo}
        </button>
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
        <p className="text-sm text-muted-foreground">{IMP.historyEmpty}</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="py-1 font-medium">{IMP.colFile}</th>
              <th className="font-medium">{IMP.colTarget}</th>
              <th className="font-medium">{IMP.colStatus}</th>
              <th className="font-medium">{IMP.colResult}</th>
              <th className="font-medium">{IMP.colActions}</th>
            </tr>
          </thead>
          <tbody>
            {batches.map((b) => (
              <tr key={b.id} className="border-t">
                <td className="py-1">{b.filename}</td>
                <td>{b.targetEntity}</td>
                <td>{b.status}</td>
                <td className="tabular-nums">{IMP.resultCounts(b.importedRows, b.errorRows)}</td>
                <td className="text-right">
                  <RowActions batch={b} onUndo={(id) => void onUndo(id)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
