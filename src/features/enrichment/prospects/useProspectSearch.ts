"use client";

import { useCallback, useMemo, useState } from "react";
import type { ProviderId, ProviderOutcome } from "../providers/types";
import type { ProspectFiltersValue } from "./ProspectFilters";
import { prospectSearchProviderDefault } from "./providerDefault";
import type { BadgedProspect } from "./types";
import type { ProspectSelection } from "./useProspectSelection";

export interface ProspectSearch {
  filters: ProspectFiltersValue;
  setFilters: (next: ProspectFiltersValue) => void;
  page: number;
  searched: boolean;
  generation: number;
  hasMore: boolean;
  outcome: ProviderOutcome | null;
  profiles: BadgedProspect[];
  byRef: ReadonlyMap<string, BadgedProspect>;
  absorbPage: (
    pageResult: readonly BadgedProspect[],
    more: boolean,
    outcome: ProviderOutcome,
  ) => void;
  search: () => void;
  loadMore: () => void;
  reset: () => void;
}

export function useProspectSearch(
  providers: readonly ProviderId[],
  selection: ProspectSelection,
): ProspectSearch {
  const [filters, setFiltersState] = useState<ProspectFiltersValue>(() => ({
    provider: prospectSearchProviderDefault(providers),
    title: "",
    seniorities: [],
  }));
  const [page, setPage] = useState(1);
  const [searched, setSearched] = useState(false);
  const [generation, setGeneration] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [outcome, setOutcome] = useState<ProviderOutcome | null>(null);
  const [profiles, setProfiles] = useState<BadgedProspect[]>([]);

  const byRef = useMemo(() => {
    const map = new Map<string, BadgedProspect>();
    for (const profile of profiles) map.set(profile.providerRef, profile);
    return map;
  }, [profiles]);

  const dropResults = useCallback(() => {
    setSearched(false);
    setProfiles([]);
    setHasMore(false);
    setOutcome(null);
    selection.clear();
  }, [selection]);

  const setFilters = useCallback(
    (next: ProspectFiltersValue) => {
      setFiltersState(next);
      dropResults();
    },
    [dropResults],
  );

  const offered = useMemo<ProspectFiltersValue>(() => {
    if (providers.length === 0 || providers.includes(filters.provider)) return filters;
    return { ...filters, provider: prospectSearchProviderDefault(providers) };
  }, [providers, filters]);

  const absorbPage = useCallback(
    (pageResult: readonly BadgedProspect[], more: boolean, pageOutcome: ProviderOutcome) => {
      setProfiles((current) => {
        if (page === 1) return [...pageResult];
        const held = new Set(current.map((p) => p.providerRef));
        const fresh = pageResult.filter((p) => !held.has(p.providerRef));
        return fresh.length === 0 ? current : [...current, ...fresh];
      });
      setHasMore(more);
      setOutcome(pageOutcome);
    },
    [page],
  );

  const search = useCallback(() => {
    setProfiles([]);
    setPage(1);
    setSearched(true);
    setGeneration((current) => current + 1);
    selection.clear();
  }, [selection]);

  const loadMore = useCallback(() => {
    setPage((current) => current + 1);
  }, []);

  const reset = useCallback(() => {
    setPage(1);
    dropResults();
  }, [dropResults]);

  return {
    filters: offered,
    setFilters,
    page,
    searched,
    generation,
    hasMore,
    outcome,
    profiles,
    byRef,
    absorbPage,
    search,
    loadMore,
    reset,
  };
}
