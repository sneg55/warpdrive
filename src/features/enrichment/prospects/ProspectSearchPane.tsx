"use client";

import type React from "react";
import { useState } from "react";
import type { ProviderId } from "../providers/types";
import { ProspectResumeBanner } from "./ProspectResumeBanner";
import { ProspectSearchStep } from "./ProspectSearchStep";
import type { useProspectFlow } from "./useProspectFlow";

export interface ResumableBatch {
  batchId: string;
  count: number;
}

export function ProspectSearchPane({
  flow,
  orgName,
  providers,
  loading,
  loadingMore,
  errorId,
  resumable,
  onRerun,
}: {
  flow: ReturnType<typeof useProspectFlow>;
  orgName: string;
  providers: readonly ProviderId[];
  loading: boolean;
  loadingMore: boolean;
  errorId: string | null;
  resumable: ResumableBatch | null;
  onRerun: () => void;
}): React.ReactNode {
  const [dismissed, setDismissed] = useState(false);
  const offer = resumable !== null && !dismissed && flow.resumeId === null ? resumable : null;

  return (
    <div className="flex flex-col gap-4">
      {offer === null ? null : (
        <ProspectResumeBanner
          count={offer.count}
          onOpen={() => {
            flow.beginResume(offer.batchId);
          }}
          onDismiss={() => {
            setDismissed(true);
          }}
        />
      )}
      <ProspectSearchStep
        orgName={orgName}
        providers={providers}
        filters={flow.filters}
        profiles={flow.profiles}
        hasMore={flow.hasMore}
        loading={loading}
        loadingMore={loadingMore}
        searched={flow.searched}
        outcome={flow.outcome}
        errorId={errorId}
        selection={flow.selection}
        onFiltersChange={flow.setFilters}
        onSearch={() => {
          const again = flow.searched;
          flow.search();
          if (again) onRerun();
        }}
        onLoadMore={flow.loadMore}
        onReveal={flow.startReveal}
      />
    </div>
  );
}
