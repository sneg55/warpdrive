"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { ColumnsMenu } from "@/components/data-table/ColumnsMenu";
import type { ColumnDef } from "@/components/data-table/columnModel";
import { useColumns } from "@/components/data-table/useColumns";
import { usePersistColumns } from "@/components/data-table/usePersistColumns";
import { customFieldColumns } from "@/features/custom-fields/listColumns";
import {
  type CustomFieldRefLabels,
  CustomFieldRefLabelsProvider,
  EMPTY_REF_LABELS,
} from "@/features/custom-fields/refLabelsContext";
import type { CustomFieldSortKey } from "@/features/custom-fields/sortKey";
import { hasDateCondition } from "@/features/saved-filters/filterFields";
import type { FilterDefinition } from "@/features/saved-filters/schemas";
import { trpc } from "@/lib/trpc-client";
import type { CustomFieldDef } from "@/types/customFields";
import { BoardFilterControl } from "./BoardFilterControl";
import { BoardSortControl } from "./BoardSortControl";
import { BoardToolbar } from "./BoardToolbar";
import { distinctBoardOwners, matchesOwnerFilter } from "./boardFilter";
import { DEFAULT_SORT_DIRECTION, DEFAULT_SORT_KEY, type SortDirection } from "./boardSort";
import { type BoardViewState, boardViewDefinition, DEFAULT_BOARD_VIEW } from "./boardView";
import { DealFilterBuilder } from "./DealFilterBuilder";
import type { DealListProps } from "./DealList";
import { DealList } from "./DealList";
import { DealsEmpty } from "./DealsEmpty";
import { DEAL_LIST_COLUMNS } from "./dealListColumns";
import { DEAL_LIST_QUERY_ROOT } from "./dealListQueryKey";
import { type DealListSortKey, sortRows } from "./dealListSort";
import { fetchDealListRows } from "./fetchDealListRows";
import { NewDealButton } from "./NewDealButton";
import { useBoardView } from "./useBoardView";
import { useDealListActions } from "./useDealListActions";
import { useDealListRefLabels } from "./useDealListRefLabels";

const EMPTY_ROWS: never[] = [];

type PipelineOption = { id: string; name: string; stages: Array<{ id: string; name: string }> };

type InitialData = Omit<
  DealListProps,
  "onBulkStage" | "onBulkArchive" | "onUnarchive" | "visibleColumns" | "columnsMenu" | "currency"
> & {
  pipelines: PipelineOption[];
  baseCurrency: string;
  initialColumns?: string[];
  customFieldDefs?: CustomFieldDef[];
  refLabels?: CustomFieldRefLabels;
  canManagePipelines?: boolean;
  initialView?: BoardViewState;
  fromDrillDown?: boolean;
  unfilteredTotal?: number;
};

interface DealListClientProps {
  initial: InitialData;
  variant?: "list" | "archived";
}

export interface DealListFooter {
  total: number;
  totalValue: string;
  filtered: boolean;
}

export function resolveDealListFooter(args: {
  filtered: boolean;
  serverTotal: number;
  serverTotalValue: string;
  filteredCount: number;
  filteredValue: string;
}): DealListFooter {
  return args.filtered
    ? { total: args.filteredCount, totalValue: args.filteredValue, filtered: true }
    : { total: args.serverTotal, totalValue: args.serverTotalValue, filtered: false };
}

function sameDefinition(a: FilterDefinition | undefined, b: FilterDefinition | undefined): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

export function DealListClient({
  initial,
  variant = "list",
}: DealListClientProps): React.ReactNode {
  const { pipelineId, stages, pipelines, baseCurrency } = initial;
  const currency = baseCurrency;
  const actions = useDealListActions();
  const utils = trpc.useUtils();
  const view = useBoardView(initial.initialView, { fromDrillDown: initial.fromDrillDown });
  const { ownerId: selectedOwnerId, savedFilter, conditions: inlineDefinition } = view;
  const {
    setOwnerId: setSelectedOwnerId,
    setSavedFilter,
    setConditions: setInlineDefinition,
  } = view;
  const activeDefinition = inlineDefinition ?? savedFilter?.definition;
  const [sortKey, setSortKey] = useState<DealListSortKey>(DEFAULT_SORT_KEY);
  const [sortDirection, setSortDirection] = useState<SortDirection>(DEFAULT_SORT_DIRECTION);
  const catalog = useMemo<(ColumnDef & { sortField?: CustomFieldSortKey })[]>(
    () => [...DEAL_LIST_COLUMNS, ...customFieldColumns(initial.customFieldDefs ?? [])],
    [initial.customFieldDefs],
  );
  const extraSortOptions = useMemo(
    () =>
      catalog.flatMap((c) =>
        c.customField !== undefined && c.sortField !== undefined
          ? [{ key: c.sortField, label: c.header }]
          : [],
      ),
    [catalog],
  );
  const columns = useColumns(catalog, initial.initialColumns);
  usePersistColumns("dealsList", columns.order);

  const isUnfiltered = activeDefinition === undefined;
  const seededForThisView = sameDefinition(
    activeDefinition,
    boardViewDefinition(initial.initialView ?? DEFAULT_BOARD_VIEW),
  );
  const listQuery = useQuery({
    queryKey: [DEAL_LIST_QUERY_ROOT, pipelineId, variant, activeDefinition ?? "none"],
    queryFn: () =>
      fetchDealListRows(utils, {
        pipelineId,
        archived: variant === "archived",
        definition: activeDefinition,
      }),
    initialData: seededForThisView
      ? {
          rows: initial.rows,
          total: initial.total,
          totalValue: initial.totalValue,
          refLabels: initial.refLabels ?? EMPTY_REF_LABELS,
        }
      : undefined,
    initialDataUpdatedAt:
      hasDateCondition(activeDefinition) || initial.rows.length < initial.total ? 0 : undefined,
    placeholderData: keepPreviousData,
    staleTime: 5_000,
  });
  const data = listQuery.data;
  const rows = data?.rows ?? EMPTY_ROWS;
  const refLabels = useDealListRefLabels(
    initial.refLabels,
    data?.refLabels,
    listQuery.isPlaceholderData,
  );

  const owners = useMemo(() => distinctBoardOwners(rows), [rows]);
  const shownRows = useMemo(() => {
    const filtered = rows.filter((r) => matchesOwnerFilter(r, selectedOwnerId));
    return sortRows(filtered, sortKey, sortDirection, initial.customFieldDefs ?? []);
  }, [rows, selectedOwnerId, sortKey, sortDirection, initial.customFieldDefs]);

  const clientFiltered = selectedOwnerId !== null;
  const shownTotalValue = useMemo(
    () => String(shownRows.reduce((s, r) => s + (r.value !== null ? Number(r.value) : 0), 0)),
    [shownRows],
  );
  const footer = resolveDealListFooter({
    filtered: clientFiltered,
    serverTotal: data?.total ?? 0,
    serverTotalValue: data?.totalValue ?? "0",
    filteredCount: shownRows.length,
    filteredValue: shownTotalValue,
  });

  const anyFilter = clientFiltered || savedFilter !== null || inlineDefinition !== null;
  const unfilteredTotal = isUnfiltered
    ? (data?.total ?? initial.total)
    : (initial.unfilteredTotal ?? initial.total);
  const emptiedByFilter = anyFilter && unfilteredTotal > 0;
  const addDeal = (
    <NewDealButton pipelineId={pipelineId} pipelines={pipelines} baseCurrency={baseCurrency} />
  );

  const clearFilters = view.clearFilters;

  return (
    <>
      <BoardToolbar
        pipelineId={pipelineId}
        pipelines={pipelines}
        totalValue={footer.totalValue}
        dealCount={footer.total}
        currency={currency}
        activeView={variant}
        canManagePipelines={initial.canManagePipelines}
        createSlot={addDeal}
        sortSlot={
          <BoardSortControl<DealListSortKey>
            sortKey={sortKey}
            direction={sortDirection}
            onKeyChange={setSortKey}
            onToggleDirection={() => setSortDirection((d) => (d === "asc" ? "desc" : "asc"))}
            extraOptions={extraSortOptions}
          />
        }
        filterSlot={
          <>
            <DealFilterBuilder
              stages={stages}
              activeCount={inlineDefinition?.conditions.length ?? 0}
              appliedDefinition={inlineDefinition}
              onApply={setInlineDefinition}
            />
            <BoardFilterControl
              owners={owners}
              stages={stages}
              selectedOwnerId={selectedOwnerId}
              onSelectOwner={setSelectedOwnerId}
              selectedFilterId={savedFilter?.id ?? null}
              appliedFilter={savedFilter}
              onSelectFilter={setSavedFilter}
              appliedDefinition={inlineDefinition}
              onApplyDefinition={setInlineDefinition}
              triggerLabel="Saved filters"
            />
          </>
        }
      />
      {footer.filtered ? (
        <p
          role="status"
          aria-label="filtered count"
          className="px-1 py-2 text-sm text-muted-foreground"
        >
          Showing {footer.total} filtered {footer.total === 1 ? "deal" : "deals"}
        </p>
      ) : null}
      <CustomFieldRefLabelsProvider value={refLabels}>
        <DealList
          pipelineId={pipelineId}
          rows={shownRows}
          total={footer.total}
          totalValue={footer.totalValue}
          stages={stages}
          currency={currency}
          onBulkStage={actions.bulkStage}
          onBulkArchive={variant === "archived" ? undefined : actions.bulkArchive}
          onUnarchive={variant === "archived" ? actions.unarchive : undefined}
          filtered={emptiedByFilter}
          empty={
            data === undefined ? undefined : (
              <DealsEmpty
                variant={variant}
                pipelineId={pipelineId}
                filtered={emptiedByFilter}
                onClearFilters={clearFilters}
                addSlot={addDeal}
              />
            )
          }
          visibleColumns={columns.visibleColumns}
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
    </>
  );
}
