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
import { DEFAULT_BASE_CURRENCY } from "@/constants/currency";
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
// Stable module reference: passed as useColumnSort's fallback, so `effective` only changes
// reference when the sort state itself changes (not on every PeopleList re-render).
const DEFAULT_SORT: ColumnSort<PersonSortField> = { field: "name", dir: "asc" };
// Stable default for the orgNames prop: a `= {}` default parameter allocates a NEW object on
// every call, which would make fetchPage's useCallback (and the sort-change effect that
// depends on it) re-fire on every render instead of only on a real sort change.
const EMPTY_ORG_NAMES: Record<string, string> = {};
const EMPTY_CUSTOM_FIELD_DEFS: CustomFieldDef[] = [];

export interface PeopleListProps {
  rows: PeopleListRow[];
  total: number;
  // Org id -> name for resolving appended rows. Server seeds this from the visible org set;
  // orgs beyond that set (the separate 500-org resolution cap) simply stay unnamed.
  orgNames?: Record<string, string>;
  // Seeded from user_preferences.ui.peopleView (server); falls back to catalog defaults.
  initialColumns?: string[];
  customFieldDefs?: CustomFieldDef[];
  baseCurrency?: string;
  refLabels?: CustomFieldRefLabels;
}

// People list for the Contacts nav. Client-side "Load more" pages through the rest of the
// visible set via contacts.listPeople; the first page is seeded server-side. Row selection,
// column sort, and bulk delete adopt the shared Wave 1 data-table hooks (see LeadsInbox for
// the same pattern applied to leads).
export function PeopleList({
  rows: initial,
  total: initialTotal,
  orgNames = EMPTY_ORG_NAMES,
  initialColumns,
  customFieldDefs = EMPTY_CUSTOM_FIELD_DEFS,
  baseCurrency = DEFAULT_BASE_CURRENCY,
  refLabels: initialRefLabels = EMPTY_REF_LABELS,
}: PeopleListProps): React.ReactNode {
  const catalog = useMemo(
    () => [...PEOPLE_COLUMNS, ...customFieldColumns(customFieldDefs)],
    [customFieldDefs],
  );
  const columns = useColumns(catalog, initialColumns);
  usePersistColumns("people", columns.order);
  const selection = useRowSelection();
  // Depend on the stable callback, not the selection object, which is recreated every render.
  const clearSelection = selection.clear;
  const { effective, cycle } = useColumnSort<PersonSortField>(DEFAULT_SORT);
  // Server-side condition filter. A change re-queries page 0 (fetchPage depends on it, and the
  // sort/filter-change effect reloads on that dependency).
  const [filter, setFilter] = useState<ContactFilterDefinition | null>(null);
  // The saved view the filter came from, so the picker can show which one is applied.
  const [savedViewId, setSavedViewId] = useState<string | null>(null);
  // Whether the pair-merge dialog is open (only reachable with exactly two rows selected).
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

  // Re-query the first page under the new sort. Skip the initial mount: the first page is
  // already seeded server-side under the default sort, so firing here too would double-fetch.
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
    // Don't silently drop failures: clear only the ids that actually deleted, keep the
    // failed ones selected (so the user sees exactly what still needs attention).
    selection.clear();
    for (const id of failedIds) selection.toggle(id);
    // reload() manages `error` itself (clears it, then sets RELOAD_ERROR on its own
    // failure), so set the bulk-delete error AFTER it settles or reload would wipe it out.
    await reload();
    if (failedIds.length > 0) setError(BULK_DELETE_ERROR);
  }

  // Only the truly-empty list (no filter) shows the bare empty state. With a filter active, keep the
  // toolbar rendered so the user can always clear/adjust the filter that produced zero matches.
  if (filter === null && rows.length === 0) {
    return <p className="text-sm text-muted-foreground">{STRINGS.contacts.empty}</p>;
  }

  const visibleIds = rows.map((r) => r.id);
  // The two records to merge when exactly two are selected (Pipedrive merges pairs). The tuple cast
  // is guarded by the length check, so both entries are present.
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
              // An ad-hoc edit is no longer the saved view, so the picker stops claiming it is.
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
