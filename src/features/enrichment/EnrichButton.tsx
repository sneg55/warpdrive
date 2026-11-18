"use client";
import { useRouter } from "next/navigation";
import type React from "react";
import { useCallback, useState } from "react";
import { ENRICHMENT_STRINGS } from "@/constants/enrichmentStrings";
import { ERROR_IDS } from "@/constants/errorIds";
import { trpc } from "@/lib/trpc-client";
import { readCsrfToken } from "@/utils/csrfCookie";
import { applyEnrichmentAction, enrichRecordAction } from "./actions";
import type { EnrichEntity } from "./canonical";
import { type EnrichApplyError, EnrichDialog, type EnrichRunState } from "./EnrichDialog";
import { failureReasonsText } from "./failureReasons";
import { remainingFields } from "./remainingFields";
import type { Selection } from "./types";

const S = ENRICHMENT_STRINGS.dialog;

const LOADING: EnrichRunState = { kind: "loading" };

const STATUS_STALE_MS = 5 * 60_000;

interface FillGapsProps {
  onFillGaps?: () => void;
  fillGapsBusy?: boolean;
  fillGapsDisabledReason?: string;
}

interface EnrichButtonProps {
  entityType: EnrichEntity;
  entityId: string;
  entityName: string;
  onApplied?: () => void;
  children: (fill: FillGapsProps) => React.ReactNode;
}

function clock(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function isoFrom(context: Record<string, unknown> | undefined, key: string): string | null {
  const value = context?.[key];
  return typeof value === "string" ? value : null;
}

const RETRYABLE_RUN_ERRORS = new Set<string>([
  ERROR_IDS.ENRICH_ALL_FAILED,
  ERROR_IDS.ENRICH_THROTTLED,
  ERROR_IDS.ENRICH_KEY_UNREADABLE,
  ERROR_IDS.ENRICH_NOT_ENTITLED,
]);

function runErrorMessage(id: string, context: Record<string, unknown> | undefined): string {
  if (id === ERROR_IDS.ENRICH_NO_PROVIDER) return ENRICHMENT_STRINGS.button.notConfigured;
  if (id === ERROR_IDS.ENRICH_NO_IDENTIFIER) return S.noIdentifierError;
  if (id === ERROR_IDS.ENRICH_ALL_FAILED) {
    const reasons = failureReasonsText(context);
    return reasons === null ? S.allFailedError : S.allFailedErrorReasons(reasons);
  }
  if (id === ERROR_IDS.ENRICH_UNSUPPORTED) return S.unsupportedError;
  if (id === ERROR_IDS.ENRICH_NOT_ENTITLED) return S.notEntitledError;
  if (id === ERROR_IDS.ENRICH_KEY_UNREADABLE) return S.keyUnreadableError;
  if (id === ERROR_IDS.ENRICH_THROTTLED) {
    const until = isoFrom(context, "earliestRetryIso");
    return until === null ? S.throttledErrorUnknown : S.throttledError(clock(until));
  }
  return S.runError;
}

export function EnrichButton({
  entityType,
  entityId,
  entityName,
  onApplied,
  children,
}: EnrichButtonProps): React.ReactNode {
  const router = useRouter();
  const utils = trpc.useUtils();
  const statusQuery = trpc.enrichment.status.useQuery(undefined, {
    staleTime: STATUS_STALE_MS,
    retry: false,
  });
  const [openFor, setOpenFor] = useState<string | null>(null);
  const open = openFor === entityId;
  const [state, setState] = useState<{ entityId: string; value: EnrichRunState }>({
    entityId,
    value: LOADING,
  });
  const shown = state.entityId === entityId ? state.value : LOADING;

  const [pendingFor, setPendingFor] = useState<ReadonlySet<string>>(new Set());
  const busy = pendingFor.has(entityId);
  const [applyError, setApplyError] = useState<{
    entityId: string;
    value: EnrichApplyError;
  } | null>(null);
  const [applyBusyFor, setApplyBusyFor] = useState<string | null>(null);
  const applyBusy = applyBusyFor === entityId;
  const shownApplyError = applyError?.entityId === entityId ? applyError.value : null;

  const run = useCallback(
    async (refresh: boolean): Promise<void> => {
      const requestedFor = entityId;
      setPendingFor((prev) => new Set(prev).add(requestedFor));
      setState({ entityId: requestedFor, value: LOADING });
      setApplyError(null);
      const result = await enrichRecordAction(
        refresh ? { entityType, entityId, refresh: true } : { entityType, entityId },
        readCsrfToken(),
      ).catch(() => null);
      const value: EnrichRunState =
        result === null
          ? { kind: "error", message: S.runError, canRefresh: true }
          : result.ok
            ? { kind: "loaded", run: result.value }
            : {
                kind: "error",
                message: runErrorMessage(result.error.id, result.error.context),
                canRefresh: RETRYABLE_RUN_ERRORS.has(result.error.id),
              };
      setPendingFor((prev) => {
        const next = new Set(prev);
        next.delete(requestedFor);
        return next;
      });
      setState((prev) =>
        prev.entityId === requestedFor ? { entityId: requestedFor, value } : prev,
      );
    },
    [entityType, entityId],
  );

  const openAndRun = useCallback(() => {
    setOpenFor(entityId);
    void run(false);
  }, [run, entityId]);

  function applyErrorFor(id: string): { message: string; canRefresh: boolean } {
    if (id === ERROR_IDS.ENRICH_STALE) return { message: S.staleError, canRefresh: true };
    if (id === ERROR_IDS.ENRICH_MAPPINGS_CHANGED) {
      return { message: S.mappingsChangedError, canRefresh: true };
    }
    if (id === ERROR_IDS.ENRICH_RUN_NOT_FOUND) {
      return { message: S.staleError, canRefresh: true };
    }
    return { message: S.applyError, canRefresh: false };
  }

  function refreshAfterApply(appliedTo: string): void {
    void utils.contacts.contactTimeline.invalidate({ entityType, entityId: appliedTo });
    router.refresh();
    onApplied?.();
  }

  async function apply(selections: Selection[]): Promise<void> {
    if (shown.kind !== "loaded") return;
    const appliedTo = entityId;
    setApplyBusyFor(appliedTo);
    setApplyError(null);
    const result = await applyEnrichmentAction(
      {
        runId: shown.run.runId,
        expectedUpdatedAtIso: shown.run.entityUpdatedAtIso,
        mappingsFingerprint: shown.run.mappingsFingerprint,
        selections,
      },
      readCsrfToken(),
    ).catch(() => null);
    setApplyBusyFor((prev) => (prev === appliedTo ? null : prev));
    if (result === null) {
      setApplyError({
        entityId: appliedTo,
        value: { message: S.applyError, canRefresh: false },
      });
      return;
    }
    if (!result.ok) {
      setApplyError({ entityId: appliedTo, value: applyErrorFor(result.error.id) });
      return;
    }
    if (result.value.unresolved.length > 0) {
      setState({
        entityId,
        value: {
          kind: "loaded",
          run: {
            ...shown.run,
            entityUpdatedAtIso: result.value.entityUpdatedAtIso,
            fields: remainingFields(
              shown.run.fields,
              result.value.appliedFields,
              result.value.unresolved,
            ),
          },
        },
      });
      refreshAfterApply(appliedTo);
      setApplyError({
        entityId: appliedTo,
        value: { message: S.unresolvedOrgError, canRefresh: false },
      });
      return;
    }
    setOpenFor((prev) => (prev === appliedTo ? null : prev));
    refreshAfterApply(appliedTo);
  }

  const ready = statusQuery.data?.ready === true;

  return (
    <>
      {children({
        onFillGaps: ready ? openAndRun : undefined,
        fillGapsBusy: busy,
      })}
      {ready ? (
        <EnrichDialog
          open={open}
          onOpenChange={(next) => setOpenFor(next ? entityId : null)}
          entityName={entityName}
          state={shown}
          applyBusy={applyBusy}
          applyError={shownApplyError}
          onRefresh={() => void run(true)}
          onApply={(selections) => void apply(selections)}
        />
      ) : null}
    </>
  );
}
