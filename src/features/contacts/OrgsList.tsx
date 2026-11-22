"use client";
import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  mergeRefLabels,
} from "@/features/custom-fields/refLabelsContext";
import { trpc } from "@/lib/trpc-client";
import type { CustomFieldDef } from "@/types/customFields";
import { readCsrfToken } from "@/utils/csrfCookie";
import { deleteOrgAction } from "./actions";
import { BulkMergeDialog } from "./BulkMergeDialog";
import type { ContactFilterDefinition } from "./contactFilterConfig";
import { OrgsListToolbar } from "./OrgsListToolbar";
import { type OrgsListRow, OrgsTable } from "./OrgsTable";
import { ORG_COLUMNS } from "./orgColumns";
import type { OrgSortField } from "./schemas";

const PAGE_SIZE = 50;
const LOAD_MORE = "Load more";
const LOAD_MORE_ERROR = "Couldn't load more organizations. Please try again.";
const RELOAD_ERROR = "Couldn't load organizations. Please try again.";
const BULK_DELETE_ERROR = "Couldn't delete some organizations. Please try again.";
const DEFAULT_SORT: ColumnSort<OrgSortField> = { field: "name", dir: "asc" };

export interface OrgsListProps {
  rows: OrgsListRow[];
  total: number;
  initialColumns?: string[];
  customFieldDefs?: CustomFieldDef[];
  baseCurrency: string;
  refLabels?: CustomFieldRefLabels;
}

export function OrgsList({
  rows: initial,
  total: initialTotal,
  initialColumns,
  customFieldDefs = [],
  baseCurrency,
  refLabels: initialRefLabels = EMPTY_REF_LABELS,
}: OrgsListProps): React.ReactNode {
  const catalog = useMemo(
    () => [...ORG_COLUMNS, ...customFieldColumns(customFieldDefs)],
    [customFieldDefs],
  );
  const columns = useColumns(catalog, initialColumns);
  usePersistColumns("orgs", columns.order);
  const utils = trpc.useUtils();
  const utilsRef = useRef(utils);
  useEffect(() => {
    utilsRef.current = utils;
  });
  const [rows, setRows] = useState<OrgsListRow[]>(initial);
  const [total, setTotal] = useState(initialTotal);
  const [refLabels, setRefLabels] = useState(initialRefLabels);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selection = useRowSelection();
  const clearSelection = selection.clear;
  const { effective, cycle } = useColumnSort<OrgSortField>(DEFAULT_SORT);
  const [filter, setFilter] = useState<ContactFilterDefinition | null>(null);
  const [savedViewId, setSavedViewId] = useState<string | null>(null);
  const [merging, setMerging] = useState(false);

  const fetchPage = useCallback(
    async (
      offset: number,
    ): Promise<{ rows: OrgsListRow[]; total: number; refLabels: CustomFieldRefLabels }> => {
      const page = await utilsRef.current.client.contacts.listOrgs.query({
        offset,
        limit: PAGE_SIZE,
        sort: effective,
        filter: filter ?? undefined,
      });
      return {
        rows: page.rows.map((r) => ({
          id: r.id,
          name: r.name,
          address: r.address,
          customFields: r.customFields,
          peopleCount: r.peopleCount,
          closedDeals: r.closedDeals,
          openDeals: r.openDeals,
        })),
        total: page.total,
        refLabels: page.refLabels,
      };
    },
    [effective, filter],
  );

  const loadMore = useCallback(async (): Promise<void> => {
    setLoading(true);
    setError(null);
    try {
      const page = await fetchPage(rows.length);
      setRows((prev) => [...prev, ...page.rows]);
      setTotal(page.total);
      setRefLabels((prev) => mergeRefLabels(prev, page.refLabels));
    } catch {
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
      setRefLabels(page.refLabels);
    } catch {
      setError(RELOAD_ERROR);
    } finally {
      setLoading(false);
    }
  }, [fetchPage]);

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
      ids.map(async (id) => ({ id, result: await deleteOrgAction({ id }, readCsrfToken()) })),
    );
    const failedIds = outcomes.filter((o) => o.result.ok === false).map((o) => o.id);
    selection.clear();
    for (const id of failedIds) selection.toggle(id);
    await reload();
    if (failedIds.length > 0) setError(BULK_DELETE_ERROR);
  }

  if (filter === null && rows.length === 0) {
    return <p className="text-sm text-muted-foreground">{STRINGS.contacts.orgsEmpty}</p>;
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
        <OrgsListToolbar
          filter={filter}
          savedViewId={savedViewId}
          onSelectView={(view) => {
            setSavedViewId(view?.id ?? null);
            setFilter(view?.definition ?? null);
          }}
          onApplyFilter={(def) => {
            setSavedViewId(null);
            setFilter(def);
          }}
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
          <BulkDeleteButton
            count={selection.count}
            noun="organization"
            nounPlural="organizations"
            onConfirm={() => void bulkDelete()}
          />
        </BulkActionBar>
      )}
      {merging && mergePair !== null && (
        <BulkMergeDialog
          kind="org"
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
          <OrgsTable
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
