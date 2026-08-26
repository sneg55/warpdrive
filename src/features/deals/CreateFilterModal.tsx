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
  // Owners on the board, used to offer a value dropdown for the Owner condition field.
  owners?: BoardOwner[];
  // Pipeline stages, used to offer a value dropdown for the Stage condition field.
  stages?: ReadonlyArray<{ id: string; name: string }>;
  // Applies the in-progress conditions to the board behind the modal, without persisting a filter.
  onPreview?: (definition: FilterDefinition) => void;
  // Applies the conditions ad-hoc (kept applied after the modal closes) without persisting a saved
  // filter. This is the PD "Filter" apply: filter now, save-as-view optional.
  onApply?: (definition: FilterDefinition) => void;
  // Reports the persisted filter so the parent can apply + select it by its real id.
  onSave: (saved: {
    id: string;
    name: string;
    isShared: boolean;
    definition: FilterDefinition;
  }) => void;
  // The saved filter the dialog was opened on. Owning it makes Save an update in place; someone
  // else's shared filter can only be forked, which the title and the Save button say.
  savedFilter?: SavedFilterView;
  // Seeds the builder from an ad-hoc definition, so reopening the board's inline filter shows the
  // conditions and the combinator it applied instead of a blank "match all" form.
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
  // Union in what deals actually carry, so a label visible on a card is a label you can filter by.
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
  // An update must not rename the filter, so it starts from the stored name. A fork keeps the
  // condition-derived name so the copy is not indistinguishable from the original.
  const [name, setName] = useState(mode === "update" ? (savedFilter?.name ?? "") : "");
  // Until the user types their own name, the field mirrors a name derived from the conditions.
  const [nameEdited, setNameEdited] = useState(mode === "update");
  const [isShared, setIsShared] = useState(mode === "update" && savedFilter?.isShared === true);
  const [saveError, setSaveError] = useState<ActionErrorContent | null>(null);

  const effectiveName = nameEdited ? name : describeRows(rows, fields, combinator);
  // Caught as the user types, so a value the server would reject never costs a round trip.
  const issue = conditionRowIssue(rows, fields);

  // The filter as currently edited: rows with a real value, minus incomplete ones. Shared by
  // Save (persist) and Preview (apply live without saving).
  function buildDefinition(): FilterDefinition {
    return dealRowsToDefinition(rows, combinator) ?? { combinator, conditions: [] };
  }

  async function save(): Promise<void> {
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
              // The rejected conditions are gone; keeping the old message would misread as current.
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
          disabled={issue !== null}
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
