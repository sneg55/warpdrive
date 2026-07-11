"use client";
import { keepPreviousData } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { LEADS_PAGE_LIMIT } from "@/constants/leads";
import { trpc } from "@/lib/trpc-client";
import type { LeadRow } from "../leadRepo";
import type { LeadConditionInput, LeadNextActivityBucket } from "../schemas";
import type { LeadSort } from "./useLeadSort";

export interface UseLeadListParams {
  filter: "inbox" | "archived";
  sort: LeadSort;
  ownerIds: string[];
  labelKeys: string[];
  nextActivity: LeadNextActivityBucket | null;
  // Ad-hoc inline condition builder (additive to the structured owner/label/next-activity filters).
  condition: LeadConditionInput | null;
}

export interface UseLeadListResult {
  rows: LeadRow[];
  total: number;
  canLoadMore: boolean;
  loadMore: () => void;
  // Reset to the first page and re-fetch fresh. Used after a mutation (archive, convert,
  // bulk edit): accumulated later pages would otherwise show stale rows.
  refetch: () => Promise<void>;
}

// Paged leads read with "Load more" accumulation. The lead.list procedure supports offset, so
// each page fetches at a growing offset and appends to the rows already loaded, rather than the
// single 200-row page LeadsInbox was capped to.
export function useLeadList(params: UseLeadListParams): UseLeadListResult {
  const utils = trpc.useUtils();
  const [offset, setOffset] = useState(0);
  const [rows, setRows] = useState<LeadRow[]>([]);
  // Offsets already merged into `rows`. Guards against a re-render with a fresh query-data
  // reference re-appending a page that is already present.
  const merged = useRef<Set<number>>(new Set());

  const listQ = trpc.lead.list.useQuery(
    {
      filter: params.filter,
      offset,
      limit: LEADS_PAGE_LIMIT,
      sort: params.sort,
      filters: {
        ownerIds: params.ownerIds.length > 0 ? params.ownerIds : undefined,
        labelKeys: params.labelKeys.length > 0 ? params.labelKeys : undefined,
        nextActivity: params.nextActivity ?? undefined,
        condition: params.condition ?? undefined,
      },
    },
    // Keep the current page's data (and its `total`) while an offset bump re-keys the query and the
    // next page loads. Without this, listQ.data is undefined mid-fetch, so total collapses to 0 and
    // the header briefly flips to "0 leads" / canLoadMore false until the page arrives.
    { placeholderData: keepPreviousData },
  );

  // Signature of every query input EXCEPT offset. When it changes (filter, sort, or a structured
  // filter), pagination restarts from the first page.
  const resetKey = JSON.stringify({
    filter: params.filter,
    sort: params.sort,
    ownerIds: params.ownerIds,
    labelKeys: params.labelKeys,
    nextActivity: params.nextActivity,
    condition: params.condition,
  });
  const lastKey = useRef(resetKey);

  const isPlaceholder = listQ.isPlaceholderData;
  useEffect(() => {
    const data = listQ.data;
    if (data === undefined) return;
    // A non-offset input changed: restart paging. If we are past page one, rewind to offset 0 and
    // let the re-keyed query re-run this effect with the first page; otherwise replace in place.
    if (lastKey.current !== resetKey) {
      lastKey.current = resetKey;
      merged.current = new Set();
      if (offset !== 0) {
        // A paging state machine reacting to fetched data, not state derived from props. Rewinding
        // re-keys the query so the effect re-runs with the first page.
        // eslint-disable-next-line react-hooks/set-state-in-effect -- rewind driven by fetched data
        setOffset(0);
        return;
      }
    }
    // While the next page loads, keepPreviousData surfaces the PREVIOUS page's rows as listQ.data.
    // Merging them here would both duplicate those rows and mark this offset as merged, so the real
    // page would then be skipped. Wait for the actual page (isPlaceholderData === false).
    if (isPlaceholder) return;
    if (merged.current.has(offset)) return;
    merged.current.add(offset);
    setRows((prev) => (offset === 0 ? data.rows : [...prev, ...data.rows]));
  }, [listQ.data, isPlaceholder, offset, resetKey]);

  const total = listQ.data?.total ?? 0;

  const loadMore = useCallback(() => {
    setOffset((prev) => prev + LEADS_PAGE_LIMIT);
  }, []);

  const refetch = useCallback(async () => {
    merged.current = new Set();
    setRows([]);
    setOffset(0);
    await utils.lead.list.invalidate();
  }, [utils]);

  return { rows, total, canLoadMore: rows.length < total, loadMore, refetch };
}
