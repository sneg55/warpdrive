"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { ColumnsMenu } from "@/components/data-table/ColumnsMenu";
import { useColumns } from "@/components/data-table/useColumns";
import { usePersistColumns } from "@/components/data-table/usePersistColumns";
import { useActionError } from "@/components/shell/ActionErrorProvider";
import type { FilterDefinition } from "@/features/saved-filters/schemas";
import { trpc } from "@/lib/trpc-client";
import { readCsrfToken } from "@/utils/csrfCookie";
import { archiveDealAction } from "./archiveActions";
import { BoardFilterControl } from "./BoardFilterControl";
import { BoardSortControl } from "./BoardSortControl";
import { BoardToolbar } from "./BoardToolbar";
import { distinctBoardOwners, matchesOwnerFilter } from "./boardFilter";
import {
  type BoardSortKey,
  DEFAULT_SORT_DIRECTION,
  DEFAULT_SORT_KEY,
  type SortDirection,
  sortBoardCards,
} from "./boardSort";
import { bulkStageAction } from "./bulkStageAction";
import { DealFilterBuilder } from "./DealFilterBuilder";
import type { DealListProps, DealListRow } from "./DealList";
import { DealList } from "./DealList";
import { DEAL_LIST_COLUMNS } from "./dealListColumns";
import type { BoardCard } from "./dealRepo";
import { NewDealButton } from "./NewDealButton";
import type { SavedFilterView } from "./savedFilterView";

// Stable empty array: a new [] each render would churn the useMemo dependencies below.
const EMPTY_ROWS: never[] = [];

type PipelineOption = { id: string; name: string; stages: Array<{ id: string; name: string }> };

type InitialData = Omit<
  DealListProps,
  "onBulkStage" | "onUnarchive" | "visibleColumns" | "columnsMenu"
> & {
  pipelines: PipelineOption[];
  baseCurrency?: string;
  // Seeded from user_preferences.ui.dealsListView (server); falls back to catalog defaults.
  initialColumns?: string[];
};

interface DealListClientProps {
  initial: InitialData;
  // "archived" swaps the view switcher to the Archive tab and swaps the bulk stage move for
  // a per-row Unarchive control; the default list keeps its move-to-stage bulk action.
  variant?: "list" | "archived";
}

export interface DealListFooter {
  total: number;
  totalValue: string;
  filtered: boolean;
}

// Decide what the list footer reports. With no client-side (owner) filter active the footer must
// reflect the server's true pipeline totals, which can exceed the loaded page and which the server
// already scopes to any active saved filter. With a client-side filter active it reflects only the
// narrowed subset and is flagged so the UI can label the count as filtered rather than the whole set.
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

// Sort mirrors the board: sortBoardCards wants BoardCard (updatedAt: Date), but list rows carry
// a serialised ISO string over the server boundary. Widen updatedAt to a Date for the compare,
// then reorder the original rows by the sorted ids so the rendered rows keep their string shape.
function sortRows(rows: DealListRow[], key: BoardSortKey, dir: SortDirection): DealListRow[] {
  const asCards: BoardCard[] = rows.map((r) => ({ ...r, updatedAt: new Date(r.updatedAt) }));
  const rowById = new Map(rows.map((r) => [r.id, r]));
  return sortBoardCards(asCards, key, dir).flatMap((c) => {
    const r = rowById.get(c.id);
    return r ? [r] : [];
  });
}

// Client wrapper that owns the list-view sort/filter/owner state (mirroring Board.tsx) and the
// bulk-stage / unarchive handlers. DealList itself stays a pure presentational component.
export function DealListClient({
  initial,
  variant = "list",
}: DealListClientProps): React.ReactNode {
  const { pipelineId, stages, pipelines, baseCurrency } = initial;
  const router = useRouter();
  const reportError = useActionError();
  const utils = trpc.useUtils();
  const [selectedOwnerId, setSelectedOwnerId] = useState<string | null>(null);
  const [savedFilter, setSavedFilter] = useState<SavedFilterView | null>(null);
  // Ad-hoc inline condition builder (additive to the saved-view menu). When active it takes
  // precedence over the saved filter for the server read (the read path accepts one definition).
  const [inlineDefinition, setInlineDefinition] = useState<FilterDefinition | null>(null);
  const [sortKey, setSortKey] = useState<BoardSortKey>(DEFAULT_SORT_KEY);
  const [sortDirection, setSortDirection] = useState<SortDirection>(DEFAULT_SORT_DIRECTION);
  const columns = useColumns(DEAL_LIST_COLUMNS, initial.initialColumns);
  usePersistColumns("dealsList", columns.order);

  // Live rows: seeded by the SSR page as initialData ONLY for the unfiltered key. A saved or inline
  // filter narrows the read server-side, so those keys must actually fetch: seeding them with the
  // SSR (unfiltered) rows would let staleTime serve stale, unfiltered data for a filtered view.
  // keepPreviousData keeps the prior rows on screen while the filtered fetch runs (no flash of empty).
  const isUnfiltered = savedFilter === null && inlineDefinition === null;
  const listQuery = useQuery({
    queryKey: [
      "deal-list",
      pipelineId,
      variant,
      savedFilter?.id ?? "none",
      inlineDefinition ?? "none",
    ],
    queryFn: async (): Promise<{ rows: DealListRow[]; total: number; totalValue: string }> => {
      const res = await utils.client.deal.list.query({
        pipelineId,
        offset: 0,
        limit: 500,
        archived: variant === "archived" ? true : undefined,
        definition: inlineDefinition ?? savedFilter?.definition,
      });
      return {
        rows: res.rows.map((r) => ({ ...r, updatedAt: r.updatedAt.toISOString() })),
        total: res.total,
        totalValue: res.totalValue,
      };
    },
    initialData: isUnfiltered
      ? { rows: initial.rows, total: initial.total, totalValue: initial.totalValue }
      : undefined,
    placeholderData: keepPreviousData,
    staleTime: 5_000,
  });
  // Undefined only for the first render of a filtered key before its fetch resolves (initialData is
  // withheld for filtered keys); fall back to empty rows / server totals until the data arrives.
  const data = listQuery.data;
  // Stable identity while data is absent, so the useMemos below do not rebuild every render.
  const rows = data?.rows ?? EMPTY_ROWS;

  const owners = useMemo(() => distinctBoardOwners(rows), [rows]);
  const shownRows = useMemo(() => {
    const filtered = rows.filter((r) => matchesOwnerFilter(r, selectedOwnerId));
    return sortRows(filtered, sortKey, sortDirection);
  }, [rows, selectedOwnerId, sortKey, sortDirection]);

  // The client-side owner filter is the only thing that narrows the loaded rows past what the server
  // already returned (the saved filter is applied server-side, so listQuery.data.total already
  // reflects it). When that owner filter is off, the footer should show the server's true totals;
  // when it is on, it shows the narrowed subset and is labelled so the count is not read as the whole
  // pipeline. Value tracks the same set as the count so the two numbers never disagree.
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

  const handleBulkStage = useCallback(
    async (dealIds: string[], toStageId: string): Promise<boolean> => {
      const r = await bulkStageAction({ dealIds, toStageId }, readCsrfToken());
      if (!r.ok) {
        reportError(r.error.id);
        return false;
      }
      router.refresh();
      return true;
    },
    [router, reportError],
  );

  const handleUnarchive = useCallback(
    (dealId: string): void => {
      void archiveDealAction({ dealId, archived: false }, readCsrfToken()).then((r) => {
        if (r.ok) router.refresh();
        else reportError(r.error.id);
      });
    },
    [router, reportError],
  );

  return (
    <>
      <BoardToolbar
        pipelineId={pipelineId}
        pipelines={pipelines}
        totalValue={footer.totalValue}
        dealCount={footer.total}
        activeView={variant}
        createSlot={
          <NewDealButton
            pipelineId={pipelineId}
            pipelines={pipelines}
            baseCurrency={baseCurrency}
          />
        }
        sortSlot={
          <BoardSortControl
            sortKey={sortKey}
            direction={sortDirection}
            onKeyChange={setSortKey}
            onToggleDirection={() => setSortDirection((d) => (d === "asc" ? "desc" : "asc"))}
          />
        }
        filterSlot={
          <>
            <DealFilterBuilder
              stages={stages}
              activeCount={inlineDefinition?.conditions.length ?? 0}
              onApply={setInlineDefinition}
            />
            <BoardFilterControl
              owners={owners}
              selectedOwnerId={selectedOwnerId}
              onSelectOwner={setSelectedOwnerId}
              selectedFilterId={savedFilter?.id ?? null}
              onSelectFilter={setSavedFilter}
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
      <DealList
        pipelineId={pipelineId}
        rows={shownRows}
        total={footer.total}
        totalValue={footer.totalValue}
        stages={stages}
        onBulkStage={handleBulkStage}
        onUnarchive={variant === "archived" ? handleUnarchive : undefined}
        visibleColumns={columns.visibleColumns}
        columnsMenu={
          <ColumnsMenu
            catalog={DEAL_LIST_COLUMNS}
            order={columns.order}
            visibleKeys={columns.visibleKeys}
            onToggle={columns.toggle}
            onReorder={columns.reorder}
          />
        }
      />
    </>
  );
}
