"use client";
import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  horizontalListSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { useRouter } from "next/navigation";
import type React from "react";
import { useId, useRef, useState } from "react";
import { Input } from "@/components/ui/Input";
import { ERROR_IDS } from "@/constants/errorIds";
import { readCsrfToken } from "@/utils/csrfCookie";
import { applyStageOps } from "./applyStageOps";
import { renamePipelineAction, reorderStagesAction } from "./pipelineEditActions";
import { SortableStageCard } from "./SortableStageCard";
import { diffStages, type StageRow } from "./stageDiff";
import {
  assignCreatedIds,
  buildOrderedStageIds,
  reorderRowsByKey,
  stageOrderChanged,
} from "./stageOrder";

interface InitialStage {
  id: string;
  name: string;
  rottingDays: number | null;
}

interface EditPipelineClientProps {
  pipelineId: string;
  pipelineName: string;
  stages: InitialStage[];
}

// A short human message per error id surfaced by the save. Anything unmapped falls back to the id
// so the user still sees a signal (and we can grep for it).
const ERROR_MESSAGE: Record<string, string> = {
  E_STAGE_002:
    "A stage still holds deals, including won or lost ones. Move every deal (open and closed) out of this stage before deleting it.",
  E_STAGE_003: "A pipeline must keep at least one stage.",
  E_PERM_001: "You do not have permission to edit pipelines.",
  E_AUTH_CSRF: "Your session expired. Reload the page and try again.",
  [ERROR_IDS.UI_ACTION_UNCONFIRMED]:
    "The save did not reach the server, so some changes may not have been applied. Reload the page and try again.",
};

export function EditPipelineClient({
  pipelineId,
  pipelineName,
  stages,
}: EditPipelineClientProps): React.ReactNode {
  const router = useRouter();
  const nameId = useId();
  const originalName = pipelineName;
  const originalIds = stages.map((s) => s.id);
  const originalById = Object.fromEntries(
    stages.map((s) => [s.id, { name: s.name, rottingDays: s.rottingDays }]),
  );

  const [name, setName] = useState(pipelineName);
  const [rows, setRows] = useState<(StageRow & { key: string })[]>(
    stages.map((s) => ({
      key: s.id,
      id: s.id,
      name: s.name,
      rottingDays: s.rottingDays,
    })),
  );
  const [deletedIds, setDeletedIds] = useState<string[]>([]);
  const [pendingReorder, setPendingReorder] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nextKeyRef = useRef(0);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function patchRow(idx: number, patch: Partial<StageRow>): void {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  function removeRow(idx: number): void {
    // Read the row and record its delete id OUTSIDE the setRows updater. React StrictMode
    // double-invokes updaters in dev, so nesting setDeletedIds inside would queue the id twice
    // and the second deleteStageAction would fail with STAGE_NOT_FOUND (PIPELINES-07).
    const row = rows[idx];
    if (row?.id != null) setDeletedIds((d) => [...d, row.id as string]);
    setRows((prev) => prev.filter((_, i) => i !== idx));
  }

  function addRow(): void {
    const key = `new-${nextKeyRef.current}`;
    nextKeyRef.current += 1;
    setRows((prev) => [...prev, { key, id: null, name: "New stage", rottingDays: null }]);
  }

  function onDragEnd(e: DragEndEvent): void {
    const over = e.over;
    if (over === null) return;
    setRows((prev) => reorderRowsByKey(prev, String(e.active.id), String(over.id)));
  }

  async function save(): Promise<void> {
    setSaving(true);
    setError(null);
    const csrf = readCsrfToken();
    const ops = diffStages({ originalById, rows, deletedIds });

    const fail = (id: string): void => setError(ERROR_MESSAGE[id] ?? id);
    try {
      if (name.trim() !== originalName && name.trim() !== "") {
        const r = await renamePipelineAction({ pipelineId, name: name.trim() }, csrf);
        if (!r.ok) return fail(r.error.id);
      }
      const applied = await applyStageOps(pipelineId, ops, csrf);
      setRows((prev) => assignCreatedIds(prev, applied.createdIds));
      const settled = new Set(applied.settledDeletes);
      setDeletedIds((prev) => prev.filter((id) => !settled.has(id)));
      const structuralSettled = applied.createdIds.length > 0 || applied.settledDeletes.length > 0;
      if (structuralSettled) setPendingReorder(true);
      if (!applied.ok) return fail(applied.errorId);
      if (structuralSettled || pendingReorder || stageOrderChanged(originalIds, rows)) {
        const r = await reorderStagesAction(
          { pipelineId, orderedStageIds: buildOrderedStageIds(rows, applied.createdIds) },
          csrf,
        );
        if (!r.ok) {
          setPendingReorder(true);
          return fail(r.error.id);
        }
        setPendingReorder(false);
      }
      router.push(`/pipeline/${pipelineId}`);
      router.refresh();
    } catch {
      fail(ERROR_IDS.UI_ACTION_UNCONFIRMED);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex h-full flex-col">
      <div className="mb-4 flex items-center gap-3">
        <div className="flex-1 text-sm">
          <label htmlFor={nameId} className="mb-1 block font-medium">
            Pipeline name
          </label>
          <Input
            id={nameId}
            aria-label="Pipeline name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="max-w-md"
          />
        </div>
        <div className="flex items-center gap-2 self-end">
          <button
            type="button"
            onClick={() => router.push(`/pipeline/${pipelineId}`)}
            className="rounded-md border px-3 py-1.5 text-sm transition-transform hover:bg-accent active:scale-[0.96]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="rounded-md bg-action px-3 py-1.5 text-sm font-medium text-action-foreground transition-transform hover:bg-action/90 active:scale-[0.96] disabled:opacity-60"
          >
            {saving ? "Saving..." : "Save changes"}
          </button>
        </div>
      </div>

      {error !== null && (
        <p
          role="alert"
          className="mb-3 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700 text-pretty"
        >
          {error}
        </p>
      )}

      <div className="flex flex-1 gap-3 overflow-x-auto pb-4">
        <DndContext id={`pipeline-edit-${pipelineId}`} sensors={sensors} onDragEnd={onDragEnd}>
          <SortableContext items={rows.map((r) => r.key)} strategy={horizontalListSortingStrategy}>
            {rows.map((row, idx) => (
              <SortableStageCard
                key={row.key}
                sortId={row.key}
                row={row}
                index={idx}
                canDelete={rows.length > 1}
                onChange={(patch) => patchRow(idx, patch)}
                onDelete={() => removeRow(idx)}
              />
            ))}
          </SortableContext>
        </DndContext>
        <button
          type="button"
          onClick={addRow}
          className="flex w-64 shrink-0 items-center justify-center rounded-lg border border-dashed text-sm font-medium text-muted-foreground transition-transform hover:bg-accent hover:text-foreground active:scale-[0.96]"
        >
          + Add stage
        </button>
      </div>
    </div>
  );
}
