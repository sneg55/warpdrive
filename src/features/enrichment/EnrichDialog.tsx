"use client";
import type React from "react";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/Skeleton";
import { ENRICHMENT_STRINGS } from "@/constants/enrichmentStrings";
import { EnrichFieldRow } from "./EnrichFieldRow";
import type { ProviderOutcome } from "./providers/types";
import type { RunView } from "./service";
import type { ProposedField, Selection } from "./types";

const S = ENRICHMENT_STRINGS.dialog;

export type EnrichRunState =
  | { kind: "loading" }
  // `canRefresh` is false for a failure a fresh run cannot change, such as a record with no
  // identifier: offering a retry there only spends the user's attention.
  | { kind: "error"; message: string; canRefresh: boolean }
  | { kind: "loaded"; run: RunView };

export interface EnrichApplyError {
  message: string;
  // A stale record is recoverable by re-running, so that error alone offers the escape hatch.
  canRefresh: boolean;
}

interface EnrichDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityName: string;
  state: EnrichRunState;
  applyBusy: boolean;
  applyError: EnrichApplyError | null;
  onRefresh: () => void;
  onApply: (selections: Selection[]) => void;
  now?: Date;
}

function clock(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function age(fromIso: string, now: Date): string {
  const minutes = Math.floor((now.getTime() - new Date(fromIso).getTime()) / 60_000);
  if (minutes < 1) return S.ageJustNow;
  if (minutes < 60) return S.ageMinutes(minutes);
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return S.ageHours(hours);
  return S.ageDays(Math.floor(hours / 24));
}

function outcomeText(outcome: ProviderOutcome): string {
  const verdict = ENRICHMENT_STRINGS.outcome[outcome.kind];
  return outcome.retryAfterIso === undefined
    ? S.outcomeLine(outcome.provider, verdict)
    : S.outcomeLineUntil(outcome.provider, verdict, clock(outcome.retryAfterIso));
}

// Always rendered for a completed run, including one that proposed nothing: without it a thin
// result reads as "nobody knows this person" when the truth is "two providers were throttled".
function OutcomeFooter({ outcomes }: { outcomes: ProviderOutcome[] }): React.ReactNode {
  return (
    <p data-testid="enrich-outcomes" className="text-xs text-muted-foreground">
      {outcomes.map((o) => outcomeText(o)).join(", ")}
    </p>
  );
}

interface Pick {
  checked: boolean;
  value: string;
  // Only meaningful on a field whose target holds a set; ignored everywhere else.
  makePrimary: boolean;
}

function initialState(fields: ProposedField[]): Record<string, Pick> {
  return Object.fromEntries(
    fields.map((f) => [
      f.canonicalKey,
      {
        checked: f.defaultSelected,
        value: String(f.selectedValue),
        makePrimary: f.defaultMakePrimary,
      },
    ]),
  );
}

// Mounted with the run id as its key, so a Refresh replaces the whole review rather than leaving
// last run's ticks on this run's rows.
function RunPanel({
  run,
  applyBusy,
  onApply,
  onCancel,
}: {
  run: RunView;
  applyBusy: boolean;
  onApply: (selections: Selection[]) => void;
  onCancel: () => void;
}): React.ReactNode {
  const [picks, setPicks] = useState(() => initialState(run.fields));

  const selections: Selection[] = run.fields.flatMap((field) => {
    const pick = picks[field.canonicalKey];
    if (pick === undefined || !pick.checked) return [];
    const match = field.values.find((v) => String(v.value) === pick.value);
    const value = match?.value ?? pick.value;
    // A target with nothing to promote does not carry the key at all, so the plan never reads a
    // promotion choice into a field that has no primary to move.
    return field.supportsPrimary
      ? [{ canonicalKey: field.canonicalKey, value, makePrimary: pick.makePrimary }]
      : [{ canonicalKey: field.canonicalKey, value }];
  });

  return (
    <>
      <div className="max-h-[50vh] divide-y overflow-y-auto">
        {run.fields.map((field) => {
          const pick = picks[field.canonicalKey] ?? {
            checked: field.defaultSelected,
            value: String(field.selectedValue),
            makePrimary: field.defaultMakePrimary,
          };
          return (
            <EnrichFieldRow
              key={field.canonicalKey}
              field={field}
              checked={pick.checked}
              selectedValue={pick.value}
              makePrimary={pick.makePrimary}
              onCheckedChange={(checked) =>
                setPicks((prev) => ({ ...prev, [field.canonicalKey]: { ...pick, checked } }))
              }
              onValueChange={(value) =>
                setPicks((prev) => ({ ...prev, [field.canonicalKey]: { ...pick, value } }))
              }
              onMakePrimaryChange={(makePrimary) =>
                setPicks((prev) => ({ ...prev, [field.canonicalKey]: { ...pick, makePrimary } }))
              }
            />
          );
        })}
      </div>
      <OutcomeFooter outcomes={run.outcomes} />
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>
          {S.cancel}
        </Button>
        <Button disabled={selections.length === 0 || applyBusy} onClick={() => onApply(selections)}>
          {applyBusy ? S.applying : S.apply(selections.length)}
        </Button>
      </DialogFooter>
    </>
  );
}

export function EnrichDialog({
  open,
  onOpenChange,
  entityName,
  state,
  applyBusy,
  applyError,
  onRefresh,
  onApply,
  now = new Date(),
}: EnrichDialogProps): React.ReactNode {
  const run = state.kind === "loaded" ? state.run : null;
  // A failed run is cached like any other, so without this the record replays that failure for the
  // whole TTL with no way to ask again.
  const showRefresh =
    state.kind === "error"
      ? state.canRefresh
      : run !== null && (run.cached || applyError?.canRefresh === true);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <div className="flex items-baseline justify-between gap-4 pr-8">
            <DialogTitle>{S.title(entityName)}</DialogTitle>
            {run !== null ? (
              <span className="text-xs text-muted-foreground">
                {S.sourceCount(run.outcomes.length)}
              </span>
            ) : null}
          </div>
          <div className="flex items-center justify-between gap-4">
            <DialogDescription>
              {run?.cached === true ? S.cached(age(run.createdAtIso, now)) : S.subtitle}
            </DialogDescription>
            {showRefresh ? (
              // A refresh is a paid fan-out. Starting one while an apply is in flight would let the
              // two answers land in either order on the same dialog.
              <Button variant="outline" size="sm" onClick={onRefresh} disabled={applyBusy}>
                {S.refresh}
              </Button>
            ) : null}
          </div>
        </DialogHeader>

        {applyError !== null ? (
          <p
            role="alert"
            className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
          >
            {applyError.message}
          </p>
        ) : null}

        {state.kind === "loading" ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted-foreground">{S.loading}</p>
            <Skeleton className="h-6 w-full" />
            <Skeleton className="h-6 w-3/4" />
            <Skeleton className="h-6 w-2/3" />
          </div>
        ) : null}

        {state.kind === "error" ? (
          <p role="alert" className="text-sm text-destructive">
            {state.message}
          </p>
        ) : null}

        {run !== null && run.fields.length === 0 ? (
          <>
            <p className="text-sm text-muted-foreground">{S.nothingFound}</p>
            <OutcomeFooter outcomes={run.outcomes} />
          </>
        ) : null}

        {run !== null && run.fields.length > 0 ? (
          // Keyed on the run alone. A partial apply keeps the run and only drops the rows it
          // committed, and a pick for a row that is gone is inert, so remounting on the record
          // version would only undo the choices the user made about the rows that remain.
          <RunPanel
            key={run.runId}
            run={run}
            applyBusy={applyBusy}
            onApply={onApply}
            onCancel={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
