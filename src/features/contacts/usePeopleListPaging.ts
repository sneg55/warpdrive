"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ColumnSort } from "@/components/data-table/useColumnSort";
import {
  type CustomFieldRefLabels,
  mergeRefLabels,
} from "@/features/custom-fields/refLabelsContext";
import { trpc } from "@/lib/trpc-client";
import type { ContactFilterDefinition } from "./contactFilterConfig";
import { type PeopleListRow, type RawPersonRow, toRow } from "./PeopleTable";
import type { PersonSortField } from "./schemas";

const PAGE_SIZE = 50;
const LOAD_MORE_ERROR = "Couldn't load more people. Please try again.";
const RELOAD_ERROR = "Couldn't load people. Please try again.";

export interface PeopleListPaging {
  rows: PeopleListRow[];
  total: number;
  refLabels: CustomFieldRefLabels;
  loading: boolean;
  error: string | null;
  setError: (error: string | null) => void;
  loadMore: () => Promise<void>;
  reload: () => Promise<void>;
}

export function usePeopleListPaging(opts: {
  initial: PeopleListRow[];
  initialTotal: number;
  initialRefLabels: CustomFieldRefLabels;
  orgNames: Record<string, string>;
  sort: ColumnSort<PersonSortField>;
  filter: ContactFilterDefinition | null;
}): PeopleListPaging {
  const { initial, initialTotal, initialRefLabels, orgNames, sort, filter } = opts;
  const utils = trpc.useUtils();
  const utilsRef = useRef(utils);
  useEffect(() => {
    utilsRef.current = utils;
  });
  const [rows, setRows] = useState<PeopleListRow[]>(initial);
  const [total, setTotal] = useState(initialTotal);
  const [refLabels, setRefLabels] = useState<CustomFieldRefLabels>(initialRefLabels);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPage = useCallback(
    async (
      offset: number,
    ): Promise<{ rows: PeopleListRow[]; total: number; refLabels: CustomFieldRefLabels }> => {
      const page = await utilsRef.current.client.contacts.listPeople.query({
        offset,
        limit: PAGE_SIZE,
        sort,
        filter: filter ?? undefined,
      });
      return {
        rows: page.rows.map((r) => toRow(r as RawPersonRow, orgNames)),
        total: page.total,
        refLabels: page.refLabels,
      };
    },
    [sort, orgNames, filter],
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

  return { rows, total, refLabels, loading, error, setError, loadMore, reload };
}
