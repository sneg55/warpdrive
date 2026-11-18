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
import { ENRICHMENT_STRINGS } from "@/constants/enrichmentStrings";
import { EnrichFieldRow } from "./EnrichFieldRow";
import { EnrichLoading } from "./EnrichLoading";
import type { ProviderOutcome } from "./providers/types";
import type { RunView } from "./service";
import type { ProposedField, Selection } from "./types";

const S = ENRICHMENT_STRINGS.dialog;

export type EnrichRunState =
  | { kind: "loading" }
  | { kind: "error"; message: string; canRefresh: boolean }
  | { kind: "loaded"; run: RunView };

export interface EnrichApplyError {
  message: string;
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

        {state.kind === "loading" ? <EnrichLoading /> : null}

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
