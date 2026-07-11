"use client";
import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { BulkActionBar } from "@/components/data-table/BulkActionBar";
import { ColumnsMenu } from "@/components/data-table/ColumnsMenu";
import { type ColumnSort, useColumnSort } from "@/components/data-table/useColumnSort";
import { useColumns } from "@/components/data-table/useColumns";
import { usePersistColumns } from "@/components/data-table/usePersistColumns";
import { useRowSelection } from "@/components/data-table/useRowSelection";
import { STRINGS } from "@/constants/strings";
import { trpc } from "@/lib/trpc-client";
import { readCsrfToken } from "@/utils/csrfCookie";
import { deletePersonAction } from "./actions";
import { BulkMergeDialog } from "./BulkMergeDialog";
import { ContactFilterBuilder } from "./ContactFilterBuilder";
import { type ContactFilterDefinition, PERSON_FILTER_CONFIG } from "./contactFilterConfig";
import { PERSON_FILTER_LABELS } from "./contactFilterRows";
import { type PeopleListRow, PeopleTable, type RawPersonRow, toRow } from "./PeopleTable";
import { PEOPLE_COLUMNS } from "./peopleColumns";
import type { PersonSortField } from "./schemas";

const PAGE_SIZE = 50;
const LOAD_MORE = "Load more";
const LOAD_MORE_ERROR = "Couldn't load more people. Please try again.";
const RELOAD_ERROR = "Couldn't load people. Please try again.";
const BULK_DELETE_ERROR = "Couldn't delete some people. Please try again.";
// Stable module reference: passed as useColumnSort's fallback, so `effective` only changes
// reference when the sort state itself changes (not on every PeopleList re-render).
const DEFAULT_SORT: ColumnSort<PersonSortField> = { field: "name", dir: "asc" };
// Stable default for the orgNames prop: a `= {}` default parameter allocates a NEW object on
// every call, which would make fetchPage's useCallback (and the sort-change effect that
// depends on it) re-fire on every render instead of only on a real sort change.
const EMPTY_ORG_NAMES: Record<string, string> = {};

export type { PeopleListRow };

export interface PeopleListProps {
  rows: PeopleListRow[];
  total: number;
  // Org id -> name for resolving appended rows. Server seeds this from the visible org set;
  // orgs beyond that set (the separate 500-org resolution cap) simply stay unnamed.
  orgNames?: Record<string, string>;
  // Seeded from user_preferences.ui.peopleView (server); falls back to catalog defaults.
  initialColumns?: string[];
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
}: PeopleListProps): React.ReactNode {
  const columns = useColumns(PEOPLE_COLUMNS, initialColumns);
  usePersistColumns("people", columns.order);
  const utils = trpc.useUtils();
  // A ref, not a dependency: trpc.useUtils() is documented as stable, but reading through a ref
  // means fetchPage's identity can't be knocked loose by a caller (e.g. a test double) that
  // returns a fresh object per render, which would otherwise cascade into reload/the sort-change
  // effect and re-fire on every render.
  const utilsRef = useRef(utils);
  // Written in an effect, not during render: ref writes during render are unsafe under concurrent
  // rendering. fetchPage only reads utilsRef inside callbacks, which always run after commit.
  useEffect(() => {
    utilsRef.current = utils;
  });
  const [rows, setRows] = useState<PeopleListRow[]>(initial);
  const [total, setTotal] = useState(initialTotal);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selection = useRowSelection();
  // Depend on the stable callback, not the selection object, which is recreated every render.
  const clearSelection = selection.clear;
  const { effective, cycle } = useColumnSort<PersonSortField>(DEFAULT_SORT);
  // Server-side condition filter. A change re-queries page 0 (fetchPage depends on it, and the
  // sort/filter-change effect reloads on that dependency).
  const [filter, setFilter] = useState<ContactFilterDefinition | null>(null);
  // Whether the pair-merge dialog is open (only reachable with exactly two rows selected).
  const [merging, setMerging] = useState(false);

  const fetchPage = useCallback(
    async (offset: number): Promise<{ rows: PeopleListRow[]; total: number }> => {
      const page = await utilsRef.current.client.contacts.listPeople.query({
        offset,
        limit: PAGE_SIZE,
        sort: effective,
        filter: filter ?? undefined,
      });
      return {
        rows: page.rows.map((r) => toRow(r as RawPersonRow, orgNames)),
        total: page.total,
      };
    },
    [effective, orgNames, filter],
  );

  const loadMore = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const page = await fetchPage(rows.length);
      setRows((prev) => [...prev, ...page.rows]);
      setTotal(page.total);
    } catch {
      // The list query has a server-side AbortSignal.timeout, so rejection is realistic.
      // Surface it inline and leave the button enabled to retry rather than swallow it.
      setError(LOAD_MORE_ERROR);
    } finally {
      setLoading(false);
    }
  }, [fetchPage, rows.length]);

  const reload = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const page = await fetchPage(0);
      setRows(page.rows);
      setTotal(page.total);
    } catch {
      setError(RELOAD_ERROR);
    } finally {
      setLoading(false);
    }
  }, [fetchPage]);

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
        <ContactFilterBuilder
          config={PERSON_FILTER_CONFIG}
          fieldLabels={PERSON_FILTER_LABELS}
          activeCount={filter?.conditions.length ?? 0}
          onApply={setFilter}
        />
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
          <button
            type="button"
            onClick={() => void bulkDelete()}
            className="rounded-md border px-3 py-1 text-sm hover:bg-accent active:scale-[0.96] transition-transform"
          >
            Delete
          </button>
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
        <PeopleTable
          rows={rows}
          sort={effective}
          onSort={cycle}
          isSelected={selection.isSelected}
          allSelected={selection.allSelected(visibleIds)}
          onToggleRow={selection.toggle}
          onToggleAll={() => selection.toggleAll(visibleIds)}
          visibleColumns={columns.visibleColumns}
          columnsMenu={
            <ColumnsMenu
              catalog={PEOPLE_COLUMNS}
              order={columns.order}
              visibleKeys={columns.visibleKeys}
              onToggle={columns.toggle}
              onReorder={columns.reorder}
            />
          }
        />
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
