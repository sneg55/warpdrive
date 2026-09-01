"use client";

import type React from "react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { ENRICHMENT_STRINGS } from "@/constants/enrichmentStrings";
import type { ProviderId, ProviderOutcome } from "../providers/types";
import { ProspectFilters, type ProspectFiltersValue } from "./ProspectFilters";
import { ProspectResultsTable } from "./ProspectResultsTable";
import { messageForErrorId, messageForOutcome } from "./searchMessage";
import type { BadgedProspect } from "./types";
import type { ProspectSelection } from "./useProspectSelection";

const S = ENRICHMENT_STRINGS.prospects;

export interface ProspectSearchStepProps {
  orgName: string;
  providers: readonly ProviderId[];
  filters: ProspectFiltersValue;
  profiles: readonly BadgedProspect[];
  hasMore: boolean;
  loading: boolean;
  loadingMore: boolean;
  searched: boolean;
  outcome: ProviderOutcome | null;
  errorId: string | null;
  selection: ProspectSelection;
  onFiltersChange: (next: ProspectFiltersValue) => void;
  onSearch: () => void;
  onLoadMore: () => void;
  onReveal: () => void;
}

function Results({
  profiles,
  hasMore,
  loadingMore,
  selection,
  onLoadMore,
}: Pick<
  ProspectSearchStepProps,
  "profiles" | "hasMore" | "loadingMore" | "selection" | "onLoadMore"
>): React.ReactNode {
  return (
    <ProspectResultsTable
      profiles={profiles}
      isSelected={selection.isSelected}
      selectionFull={selection.isFull}
      hasMore={hasMore}
      loadingMore={loadingMore}
      onToggle={selection.toggle}
      onTogglePage={(select) => {
        const refs = profiles.map((p) => p.providerRef);
        if (select) selection.selectMany(refs);
        else selection.deselectMany(refs);
      }}
      onLoadMore={onLoadMore}
    />
  );
}

export function ProspectSearchStep(props: ProspectSearchStepProps): React.ReactNode {
  const {
    orgName,
    providers,
    filters,
    profiles,
    loading,
    searched,
    outcome,
    errorId,
    selection,
    onFiltersChange,
    onSearch,
    onReveal,
  } = props;
  const [dismissedFull, setDismissedFull] = useState(false);

  const message =
    errorId !== null
      ? messageForErrorId(errorId, orgName)
      : searched && profiles.length === 0 && outcome !== null
        ? messageForOutcome(outcome, orgName)
        : null;

  return (
    <div className="flex flex-col gap-4">
      <ProspectFilters
        value={filters}
        providers={providers}
        busy={loading}
        onChange={(next) => {
          setDismissedFull(false);
          onFiltersChange(next);
        }}
        onSearch={onSearch}
      />

      {loading ? (
        <output className="flex flex-col gap-2" aria-busy="true" aria-label={S.searching}>
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </output>
      ) : message !== null ? (
        <EmptyState title={message.title} body={message.body} />
      ) : profiles.length > 0 ? (
        <Results {...props} />
      ) : null}

      {selection.isFull && !dismissedFull ? (
        <span className="text-muted-foreground text-xs">
          {S.selectionFull(selection.count)}{" "}
          <button
            type="button"
            className="underline underline-offset-2"
            onClick={() => {
              setDismissedFull(true);
            }}
          >
            {ENRICHMENT_STRINGS.dialog.cancel}
          </button>
        </span>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <span className="text-muted-foreground text-xs">
          {selection.count > 0 ? `${S.selectedCount(selection.count)} · ${S.revealCost}` : ""}
        </span>
        <Button disabled={selection.count === 0} onClick={onReveal}>
          {S.reveal(selection.count)}
        </Button>
      </div>
    </div>
  );
}
