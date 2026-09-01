"use client";

import { useRouter } from "next/navigation";
import type React from "react";
import { useEffect, useMemo, useRef } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { ENRICHMENT_STRINGS } from "@/constants/enrichmentStrings";
import { trpc } from "@/lib/trpc-client";
import type { ProviderId } from "../providers/types";
import { ProspectRevealStep } from "./ProspectRevealStep";
import { ProspectReviewStep } from "./ProspectReviewStep";
import { ProspectSearchPane } from "./ProspectSearchPane";
import { revealBatchRoute } from "./revealContract";
import { useProspectFlow } from "./useProspectFlow";

const S = ENRICHMENT_STRINGS.prospects;
const NO_PROVIDERS: ProviderId[] = [];

function reviewError(
  applyError: string | null,
  mappingsMismatch: boolean,
  queueStatus: string,
): string | null {
  if (applyError !== null) return applyError;
  if (mappingsMismatch) return S.mappingsChangedError;
  return queueStatus === "error" ? S.revealFailed : null;
}

export function FindPeopleDialog({
  orgId,
  orgName,
  open,
  onOpenChange,
}: {
  orgId: string;
  orgName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}): React.ReactNode {
  const providersQuery = trpc.enrichment.searchProviders.useQuery(undefined, {
    enabled: open,
    retry: false,
  });
  const providers = providersQuery.data ?? NO_PROVIDERS;
  const flow = useProspectFlow(orgId, providers);
  const utils = trpc.useUtils();
  const router = useRouter();
  const live = useRef(true);
  const session = useRef(0);
  useEffect(() => {
    if (!open) session.current += 1;
  }, [open]);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);

  const NO_REFETCH = { refetchType: "none" } as const;

  function refreshAfterApply(): void {
    void utils.contacts.listPeopleForOrg.invalidate();
    void utils.contacts.listPeople.invalidate();
    void utils.contacts.personOptions.invalidate();
    void utils.contacts.contactTimeline.invalidate();
    void utils.enrichment.resumableBatch.invalidate();
    void utils.enrichment.revealBatch.invalidate(undefined, NO_REFETCH);
    void utils.enrichment.searchPeople.invalidate(undefined, NO_REFETCH);
    router.refresh();
  }

  const resumableQuery = trpc.enrichment.resumableBatch.useQuery(
    { orgId },
    { enabled: open, retry: false },
  );
  const batchQuery = revealBatchRoute().useQuery(
    { orgId, batchId: flow.resumeId ?? "" },
    { enabled: flow.resumeId !== null, retry: false },
  );

  const searchQuery = trpc.enrichment.searchPeople.useQuery(
    {
      orgId,
      provider: flow.filters.provider,
      titles: flow.filters.title.trim() === "" ? [] : [flow.filters.title.trim()],
      seniorities: flow.filters.seniorities,
      page: flow.page,
    },
    { enabled: open && flow.searched, retry: false },
  );

  const { absorbPage, adoptBatch, setStep, generation, revealed } = flow;
  const searchData = searchQuery.isSuccess ? searchQuery.data : null;
  const queueStatus = flow.queue.status;
  const step = flow.step;

  const pending = useMemo(
    () => (searchData === null ? null : { generation, data: searchData }),
    [searchData, generation],
  );

  useEffect(() => {
    if (pending === null) return;
    absorbPage(pending.data.profiles, pending.data.hasMore, pending.data.outcome);
  }, [pending, absorbPage]);

  const loadedBatch = batchQuery.data;
  useEffect(() => {
    if (loadedBatch === undefined) return;
    adoptBatch(loadedBatch);
  }, [loadedBatch, adoptBatch]);

  const settled = queueStatus === "done" || queueStatus === "error" || queueStatus === "aborted";
  useEffect(() => {
    if (step !== "reveal" || !settled || revealed.length === 0) return;
    setStep("review");
  }, [step, settled, revealed, setStep]);

  const noProvider = providersQuery.isSuccess && providers.length === 0;
  const searchErrorId = searchQuery.error === null ? null : searchQuery.error.message;
  const resumable = resumableQuery.data ?? null;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) flow.reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>{S.title(orgName)}</DialogTitle>
          <DialogDescription>{S.subtitle}</DialogDescription>
        </DialogHeader>

        {noProvider ? (
          <EmptyState title={S.noProviderTitle} body={S.noProviderBody} />
        ) : step === "search" ? (
          <ProspectSearchPane
            flow={flow}
            orgName={orgName}
            providers={providers}
            loading={searchQuery.isFetching && flow.page === 1}
            loadingMore={searchQuery.isFetching && flow.page > 1}
            errorId={searchErrorId}
            resumable={resumable}
            onRerun={() => {
              void searchQuery.refetch();
            }}
          />
        ) : step === "reveal" ? (
          <ProspectRevealStep
            status={queueStatus}
            processed={flow.queue.processed}
            total={flow.queue.total}
            stopping={flow.queue.stopping}
            failures={flow.failures.length}
            error={flow.queue.error}
            onStop={() => {
              flow.queue.abort();
            }}
          />
        ) : (
          <ProspectReviewStep
            revealed={revealed}
            failures={flow.failures}
            outcomes={flow.outcomes}
            applying={flow.applying}
            error={reviewError(flow.applyError, flow.mappingsMismatch, queueStatus)}
            onApply={(submissions) => {
              const applied = session.current;
              void flow.apply(submissions).then((summary) => {
                if (summary === "failed") return;
                refreshAfterApply();
                if (summary !== "applied") return;
                if (!live.current || applied !== session.current) return;
                session.current += 1;
                flow.reset();
                onOpenChange(false);
              });
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
