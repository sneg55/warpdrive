"use client";
import type React from "react";
import { useState } from "react";
import { type ConditionRow, ConditionRows } from "@/components/filters/ConditionRows";
import { type ActionErrorContent, actionErrorContent } from "@/components/shell/actionError";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { mergeLabelOptions } from "@/features/labels/mergeLabelOptions";
import type { FilterDefinition } from "@/features/saved-filters/schemas";
import {
  createSavedFilterAction,
  updateSavedFilterAction,
} from "@/features/saved-filters/serverActions";
import { trpc } from "@/lib/trpc-client";
import { readCsrfToken } from "@/utils/csrfCookie";
import type { BoardOwner } from "./boardFilter";
import { CreateFilterModalFooter } from "./CreateFilterModalFooter";
import { CreateFilterModalNameRow } from "./CreateFilterModalNameRow";
import { filterSaveCopy, filterSaveMode } from "./createFilterModalCopy";
import { blankConditionRow, dealFilterFields, OP_LABELS } from "./dealFilterCatalog";
import { conditionRowIssue, dealRowsToDefinition, definitionToRows } from "./dealFilterRows";
import { describeRows } from "./describeFilter";
import type { SavedFilterView } from "./savedFilterView";

interface CreateFilterModalProps {
  onClose: () => void;
  owners?: BoardOwner[];
  stages?: ReadonlyArray<{ id: string; name: string }>;
  onPreview?: (definition: FilterDefinition) => void;
  onApply?: (definition: FilterDefinition) => void;
  onSave: (saved: {
    id: string;
    name: string;
    isShared: boolean;
    definition: FilterDefinition;
  }) => void;
  savedFilter?: SavedFilterView;
  initialDefinition?: FilterDefinition;
}

export function CreateFilterModal({
  onClose,
  owners = [],
  stages = [],
  onPreview,
  onApply,
  onSave,
  savedFilter,
  initialDefinition,
}: CreateFilterModalProps): React.ReactNode {
  const mode = filterSaveMode(savedFilter);
  const copy = filterSaveCopy(mode);
  const seedDefinition = savedFilter?.definition ?? initialDefinition;
  const catalogNames = (trpc.labels.listByTarget.useQuery({ target: "deal" }).data ?? []).map(
    (l) => l.name,
  );
  const appliedNames = trpc.labels.appliedNames.useQuery({ target: "deal" }).data ?? [];
  const fields = dealFilterFields({
    owners: owners.map((o) => ({ id: o.ownerId, name: o.name })),
    stages,
    labelOptions: mergeLabelOptions(catalogNames, appliedNames),
  });

  const [rows, setRows] = useState<ConditionRow[]>(() =>
    seedDefinition === undefined ? [blankConditionRow(fields)] : definitionToRows(seedDefinition),
  );
  const [combinator, setCombinator] = useState<"and" | "or">(seedDefinition?.combinator ?? "and");
  const [name, setName] = useState(mode === "update" ? (savedFilter?.name ?? "") : "");
  const [nameEdited, setNameEdited] = useState(mode === "update");
  const [isShared, setIsShared] = useState(mode === "update" && savedFilter?.isShared === true);
  const [saveError, setSaveError] = useState<ActionErrorContent | null>(null);
  const [saving, setSaving] = useState(false);

  const effectiveName = nameEdited ? name : describeRows(rows, fields, combinator);
  const issue = conditionRowIssue(rows, fields);

  function buildDefinition(): FilterDefinition {
    return dealRowsToDefinition(rows, combinator) ?? { combinator, conditions: [] };
  }

  async function save(): Promise<void> {
    if (saving) return;
    setSaving(true);
    try {
      await persist();
    } finally {
      setSaving(false);
    }
  }

  async function persist(): Promise<void> {
    const definition = buildDefinition();
    const filterName = effectiveName.trim() === "" ? "Untitled filter" : effectiveName.trim();
    if (mode === "update" && savedFilter !== undefined) {
      const res = await updateSavedFilterAction(
        savedFilter.id,
        { name: filterName, definition, isShared },
        readCsrfToken(),
      );
      if (!res.ok) {
        setSaveError(actionErrorContent(res.error.id));
        return;
      }
      onSave({ id: savedFilter.id, name: filterName, isShared, definition });
      return;
    }
    const res = await createSavedFilterAction(
      { name: filterName, targetEntity: "deal", definition, isShared },
      readCsrfToken(),
    );
    if (!res.ok) {
      setSaveError(actionErrorContent(res.error.id));
      return;
    }
    onSave({ id: res.value.id, name: filterName, isShared, definition });
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent
        aria-describedby={undefined}
        className="max-w-2xl gap-0 overflow-hidden bg-card p-0"
      >
        <DialogHeader className="border-b px-5 py-3">
          <DialogTitle className="text-base font-semibold">{copy.title}</DialogTitle>
        </DialogHeader>
        <div className="max-h-[70vh] space-y-2 overflow-y-auto px-5 py-4">
          {copy.note !== null ? <p className="text-sm text-muted-foreground">{copy.note}</p> : null}
          <ConditionRows
            fields={fields}
            opLabels={OP_LABELS}
            rows={rows}
            onRowsChange={(next) => {
              setRows(next);
              setSaveError(null);
            }}
            combinator={combinator}
            onCombinatorChange={setCombinator}
          />
          {issue !== null ? <p className="text-sm text-red-600">{issue}</p> : null}
          {saveError !== null ? (
            <div className="text-sm text-red-600">
              <p className="font-medium">{saveError.title}</p>
              <p>{saveError.body}</p>
            </div>
          ) : null}
          <CreateFilterModalNameRow
            name={effectiveName}
            onNameChange={(next) => {
              setNameEdited(true);
              setName(next);
            }}
            isShared={isShared}
            onSharedChange={setIsShared}
          />
        </div>
        <CreateFilterModalFooter
          disabled={issue !== null || saving}
          onPreview={onPreview === undefined ? undefined : () => onPreview(buildDefinition())}
          onCancel={onClose}
          onApply={
            onApply === undefined
              ? undefined
              : () => {
                  onApply(buildDefinition());
                  onClose();
                }
          }
          onSave={() => void save()}
          saveLabel={copy.saveLabel}
        />
      </DialogContent>
    </Dialog>
  );
}
