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

// The header asks on every section render; one cached answer per tab is plenty, since connecting a
// provider is an admin action that happens once.
const STATUS_STALE_MS = 5 * 60_000;

// The three props SectionHeaderMenu needs to render the Fill the gaps button.
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

// Errors a fresh fan-out could answer differently. A missing identifier or an unconfigured
// provider is about this record or this workspace, and re-running changes neither.
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

// Owns the enrichment call and the review dialog; the caller owns the button's placement, which is
// why this hands the button's props back through a render prop instead of drawing one itself.
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
  // The dialog belongs to the record it was opened for, so pointing this button at another record
  // closes it rather than showing the new name over the previous one's run.
  const [openFor, setOpenFor] = useState<string | null>(null);
  const open = openFor === entityId;
  // The state carries the record it describes. The sidebar is reused as the user moves between
  // records, so a slower answer for the one just closed can land after a faster one; without this
  // it would replace what is on screen and Apply would post the wrong record's runId.
  const [state, setState] = useState<{ entityId: string; value: EnrichRunState }>({
    entityId,
    value: LOADING,
  });
  const shown = state.entityId === entityId ? state.value : LOADING;

  // Every record with a fan-out still running, not just the last one. Dismissing the dialog does
  // not cancel the request, and a second click while it runs starts another before the first can
  // fill the cache. A set rather than one slot: moving to another record and back must not re-enable
  // a button whose own request is still out.
  const [pendingFor, setPendingFor] = useState<ReadonlySet<string>>(new Set());
  const busy = pendingFor.has(entityId);
  // Tagged with their record for the same reason the run state is: an apply is as slow as any
  // other request, and what comes back must not close or annotate a different record's dialog.
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
      // A rejected action, a dropped connection or an unexpected server throw, would otherwise
      // leave the record loading forever with its button disabled.
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
    // A repointed mapping means the preview described a different target. Re-running rebuilds it.
    if (id === ERROR_IDS.ENRICH_MAPPINGS_CHANGED) {
      return { message: S.mappingsChangedError, canRefresh: true };
    }
    // The run aged out of the cache while the dialog sat open. Re-running is the whole remedy.
    if (id === ERROR_IDS.ENRICH_RUN_NOT_FOUND) {
      return { message: S.staleError, canRefresh: true };
    }
    return { message: S.applyError, canRefresh: false };
  }

  // An apply writes change-log rows, and the History panel reads those through its own query
  // rather than the RSC tree, so refreshing the tree alone leaves it showing the old story.
  function refreshAfterApply(appliedTo: string): void {
    void utils.contacts.contactTimeline.invalidate({ entityType, entityId: appliedTo });
    router.refresh();
    onApplied?.();
  }

  async function apply(selections: Selection[]): Promise<void> {
    if (shown.kind !== "loaded") return;
    // An apply is as slow as any other request, so it follows the same rule as the fan-out: what
    // comes back belongs to the record it was sent for and may not touch another one's dialog.
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
    // Never closes on failure: the picks stay on screen so the user can retry or refresh. A
    // rejected action is a failure like any other, not a reason to leave Apply disabled.
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
    // Some fields applied but an organization could not be linked unambiguously. Closing on that
    // would report success for a row the user watched get counted in "Apply N". The write that did
    // land moved the record's updatedAt, so the dialog adopts the version the write returned rather
    // than re-running the fan-out to learn it: with the cache disabled or the run aged out, a
    // re-run would call every paid provider again purely because a name could not be linked.
    if (result.value.unresolved.length > 0) {
      setState({
        entityId,
        value: {
          kind: "loaded",
          run: {
            ...shown.run,
            entityUpdatedAtIso: result.value.entityUpdatedAtIso,
            // The committed rows leave the dialog: keeping them would let a retry rewrite fields
            // that already landed and add a second change-log row for each. So do the unresolved
            // ones. An unresolved company name means no single organization matched the provider's
            // string, which is a property of the string and the org list, not of the attempt, so
            // the same apply resolves to nothing every time. Leaving it checked with Apply live
            // offered a retry that could only re-raise the error it had just shown.
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
        // Not disabled on a global cooldown: this record may already have a cached run, which the
        // server returns before it ever looks at provider availability. Disabling here would hide
        // the only way to open it. A cooldown with no cached run comes back as E_ENRICH_003, which
        // the dialog explains with its resume time.
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
