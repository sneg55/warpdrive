"use client";
import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { BulkActionBar } from "@/components/data-table/BulkActionBar";
import { BulkDeleteButton } from "@/components/data-table/BulkDeleteButton";
import { ColumnsMenu } from "@/components/data-table/ColumnsMenu";
import { type ColumnSort, useColumnSort } from "@/components/data-table/useColumnSort";
import { useColumns } from "@/components/data-table/useColumns";
import { usePersistColumns } from "@/components/data-table/usePersistColumns";
import { useRowSelection } from "@/components/data-table/useRowSelection";
import { STRINGS } from "@/constants/strings";
import { customFieldColumns } from "@/features/custom-fields/listColumns";
import {
  type CustomFieldRefLabels,
  CustomFieldRefLabelsProvider,
  EMPTY_REF_LABELS,
} from "@/features/custom-fields/refLabelsContext";
import { SavedViewControl } from "@/features/saved-filters/SavedViewControl";
import type { CustomFieldDef } from "@/types/customFields";
import { readCsrfToken } from "@/utils/csrfCookie";
import { deletePersonAction } from "./actions";
import { BulkMergeDialog } from "./BulkMergeDialog";
import { ContactFilterBuilder } from "./ContactFilterBuilder";
import { type ContactFilterDefinition, PERSON_FILTER_CONFIG } from "./contactFilterConfig";
import { PERSON_FILTER_LABELS } from "./contactFilterRows";
import type { PeopleListRow } from "./PeopleTable";
import { PeopleTable } from "./PeopleTable";
import { PEOPLE_COLUMNS } from "./peopleColumns";
import type { PersonSortField } from "./schemas";
import { usePeopleListPaging } from "./usePeopleListPaging";

const LOAD_MORE = "Load more";
const BULK_DELETE_ERROR = "Couldn't delete some people. Please try again.";
const DEFAULT_SORT: ColumnSort<PersonSortField> = { field: "name", dir: "asc" };
const EMPTY_ORG_NAMES: Record<string, string> = {};
const EMPTY_CUSTOM_FIELD_DEFS: CustomFieldDef[] = [];

export interface PeopleListProps {
  rows: PeopleListRow[];
  total: number;
  orgNames?: Record<string, string>;
  initialColumns?: string[];
  customFieldDefs?: CustomFieldDef[];
  baseCurrency: string;
  refLabels?: CustomFieldRefLabels;
}

export function PeopleList({
  rows: initial,
  total: initialTotal,
  orgNames = EMPTY_ORG_NAMES,
  initialColumns,
  customFieldDefs = EMPTY_CUSTOM_FIELD_DEFS,
  baseCurrency,
  refLabels: initialRefLabels = EMPTY_REF_LABELS,
}: PeopleListProps): React.ReactNode {
  const catalog = useMemo(
    () => [...PEOPLE_COLUMNS, ...customFieldColumns(customFieldDefs)],
    [customFieldDefs],
  );
  const columns = useColumns(catalog, initialColumns);
  usePersistColumns("people", columns.order);
  const selection = useRowSelection();
  const clearSelection = selection.clear;
  const { effective, cycle } = useColumnSort<PersonSortField>(DEFAULT_SORT);
  const [filter, setFilter] = useState<ContactFilterDefinition | null>(null);
  const [savedViewId, setSavedViewId] = useState<string | null>(null);
  const [merging, setMerging] = useState(false);
  const { rows, total, refLabels, loading, error, setError, loadMore, reload } =
    usePeopleListPaging({
      initial,
      initialTotal,
      initialRefLabels,
      orgNames,
      sort: effective,
      filter,
    });

  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    clearSelection();
    void reload();
  }, [reload, clearSelection]);

  async function bulkDelete(): Promise<void> {
    const ids = [...selection.selected];
    if (ids.length === 0) return;
    const outcomes = await Promise.all(
      ids.map(async (id) => ({ id, result: await deletePersonAction({ id }, readCsrfToken()) })),
    );
    const failedIds = outcomes.filter((o) => o.result.ok === false).map((o) => o.id);
    selection.clear();
    for (const id of failedIds) selection.toggle(id);
    await reload();
    if (failedIds.length > 0) setError(BULK_DELETE_ERROR);
  }

  if (filter === null && rows.length === 0) {
    return <p className="text-sm text-muted-foreground">{STRINGS.contacts.empty}</p>;
  }

  const visibleIds = rows.map((r) => r.id);
  const selectedRecords = rows
    .filter((r) => selection.isSelected(r.id))
    .map((r) => ({ id: r.id, name: r.name }));
  const mergePair =
    selectedRecords.length === 2
      ? (selectedRecords as [{ id: string; name: string }, { id: string; name: string }])
      : null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-3"></div>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground tabular-nums">
          {STRINGS.contacts.countLabel(rows.length, total)}
        </p>
        <div className="flex items-center gap-2">
          <SavedViewControl
            targetEntity="person"
            allLabel="All people"
            currentDefinition={filter}
            selectedViewId={savedViewId}
            onSelectView={(view) => {
              setSavedViewId(view?.id ?? null);
              setFilter(view?.definition ?? null);
            }}
          />
          <ContactFilterBuilder
            config={PERSON_FILTER_CONFIG}
            fieldLabels={PERSON_FILTER_LABELS}
            activeCount={filter?.conditions.length ?? 0}
            appliedDefinition={filter}
            onApply={(def) => {
              setSavedViewId(null);
              setFilter(def);
            }}
          />
        </div>
      </div>
      {selection.count > 0 && (
        <BulkActionBar count={selection.count} onClear={selection.clear}>
          {mergePair !== null && (
            <button
              type="button"
              onClick={() => setMerging(true)}
              className="rounded-md border px-3 py-1 text-sm hover:bg-accent active:scale-[0.96] transition-transform"
            >
              Merge duplicates
            </button>
          )}
          <BulkDeleteButton
            count={selection.count}
            noun="person"
            nounPlural="people"
            onConfirm={() => void bulkDelete()}
          />
        </BulkActionBar>
      )}
      {merging && mergePair !== null && (
        <BulkMergeDialog
          kind="person"
          records={mergePair}
          onMerged={() => {
            setMerging(false);
            selection.clear();
            void reload();
          }}
          onClose={() => setMerging(false)}
        />
      )}
      <div className="overflow-hidden rounded-lg border bg-card shadow-sm">
        <CustomFieldRefLabelsProvider value={refLabels}>
          <PeopleTable
            rows={rows}
            sort={effective}
            onSort={cycle}
            isSelected={selection.isSelected}
            allSelected={selection.allSelected(visibleIds)}
            onToggleRow={selection.toggle}
            onToggleAll={() => selection.toggleAll(visibleIds)}
            visibleColumns={columns.visibleColumns}
            currency={baseCurrency}
            columnsMenu={
              <ColumnsMenu
                catalog={catalog}
                order={columns.order}
                visibleKeys={columns.visibleKeys}
                onToggle={columns.toggle}
                onReorder={columns.reorder}
              />
            }
          />
        </CustomFieldRefLabelsProvider>
      </div>
      {error !== null && (
        <p role="alert" className="self-center text-sm text-red-600">
          {error}
        </p>
      )}
      {rows.length < total && (
        <button
          type="button"
          disabled={loading}
          onClick={() => void loadMore()}
          className="self-center rounded-md border px-4 py-1.5 text-sm hover:bg-accent disabled:opacity-50 active:not-disabled:scale-[0.96] transition-transform"
        >
          {loading ? "Loading..." : LOAD_MORE}
        </button>
      )}
    </div>
  );
}
