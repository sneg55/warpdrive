"use client";
import { keepPreviousData } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import { LEADS_PAGE_LIMIT } from "@/constants/leads";
import {
  type CustomFieldRefLabels,
  EMPTY_REF_LABELS,
  mergeRefLabels,
} from "@/features/custom-fields/refLabelsContext";
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
  condition: LeadConditionInput | null;
}

export interface UseLeadListResult {
  rows: LeadRow[];
  total: number;
  refLabels: CustomFieldRefLabels;
  isLoading: boolean;
  canLoadMore: boolean;
  loadMore: () => void;
  refetch: () => Promise<void>;
}

export function useLeadList(params: UseLeadListParams): UseLeadListResult {
  const utils = trpc.useUtils();
  const [offset, setOffset] = useState(0);
  const [rows, setRows] = useState<LeadRow[]>([]);
  const [refLabels, setRefLabels] = useState<CustomFieldRefLabels>(EMPTY_REF_LABELS);
  const merged = useRef<Map<number, number>>(new Map());

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
    { placeholderData: keepPreviousData },
  );

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
  const stamp = listQ.dataUpdatedAt;
  useEffect(() => {
    const data = listQ.data;
    if (data === undefined) return;
    if (lastKey.current !== resetKey) {
      lastKey.current = resetKey;
      merged.current = new Map();
      if (offset !== 0) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setOffset(0);
        return;
      }
    }
    if (isPlaceholder) return;
    if (offset === 0) {
      merged.current = new Map([[0, stamp]]);
      setRows(data.rows);
      setRefLabels(data.refLabels);
      return;
    }
    if (merged.current.has(offset)) {
      if (merged.current.get(offset) === stamp) return;
      merged.current = new Map();

      setOffset(0);
      return;
    }
    merged.current.set(offset, stamp);
    setRows((prev) => [...prev, ...data.rows]);
    setRefLabels((prev) => mergeRefLabels(prev, data.refLabels));
  }, [listQ.data, isPlaceholder, stamp, offset, resetKey]);

  const total = listQ.data?.total ?? 0;

  const loadMore = useCallback(() => {
    setOffset((prev) => prev + LEADS_PAGE_LIMIT);
  }, []);

  const refetch = useCallback(async () => {
    merged.current = new Map();
    setRows([]);
    setRefLabels(EMPTY_REF_LABELS);
    setOffset(0);
    await utils.lead.list.invalidate();
  }, [utils]);

  return {
    rows,
    total,
    refLabels,
    isLoading: listQ.isLoading === true,
    canLoadMore: rows.length < total,
    loadMore,
    refetch,
  };
}
