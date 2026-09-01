"use client";

import { useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Button } from "@/components/ui/Button";
import { Select, type SelectOption } from "@/components/ui/Select";
import { BULK_ARCHIVE_DESCRIPTION, bulkArchiveTitle } from "./bulkArchiveCopy";
import { BULK_MOVE_DESCRIPTION, bulkMoveTitle } from "./bulkMoveCopy";

interface BulkBarStage {
  id: string;
  name: string;
}

interface DealListBulkBarProps {
  count: number;
  stages: BulkBarStage[];
  onConfirmStage: (toStageId: string) => Promise<void>;
  onConfirmArchive?: () => Promise<void>;
}

export function DealListBulkBar(props: DealListBulkBarProps): React.ReactNode {
  const { count, stages, onConfirmStage, onConfirmArchive } = props;
  const [pendingStageId, setPendingStageId] = useState<string | null>(null);
  const [archivePending, setArchivePending] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const stageName = (id: string): string => stages.find((s) => s.id === id)?.name ?? "";

  return (
    <>
      <div
        role="toolbar"
        aria-label="Bulk actions"
        className="flex items-center gap-3 border-b bg-accent px-4 py-2"
      >
        <span className="text-sm font-medium tabular-nums text-accent-foreground">
          {count} selected
        </span>
        <Select
          ariaLabel="Move to stage"
          value=""
          onChange={(v) => setPendingStageId(v === "" ? null : v)}
          placeholder="Move to stage..."
          options={stages.map<SelectOption>((s) => ({ value: s.id, label: s.name }))}
        />
        {onConfirmArchive ? (
          <Button
            variant="outline"
            size="sm"
            disabled={archiving}
            onClick={() => setArchivePending(true)}
          >
            Archive
          </Button>
        ) : null}
      </div>

      {pendingStageId !== null && (
        <ConfirmDialog
          open
          onOpenChange={(next) => {
            if (!next) setPendingStageId(null);
          }}
          title={bulkMoveTitle(count, stageName(pendingStageId))}
          description={BULK_MOVE_DESCRIPTION}
          confirmLabel="Move deals"
          onConfirm={() => {
            const toStageId = pendingStageId;
            setPendingStageId(null);
            void onConfirmStage(toStageId);
          }}
        />
      )}

      {archivePending && onConfirmArchive ? (
        <ConfirmDialog
          open
          onOpenChange={(next) => {
            if (!next) setArchivePending(false);
          }}
          title={bulkArchiveTitle(count)}
          description={BULK_ARCHIVE_DESCRIPTION}
          confirmLabel="Archive deals"
          onConfirm={() => {
            setArchivePending(false);
            setArchiving(true);
            void onConfirmArchive().finally(() => setArchiving(false));
          }}
        />
      ) : null}
    </>
  );
}
