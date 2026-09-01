"use client";

import type React from "react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { ENRICHMENT_STRINGS } from "@/constants/enrichmentStrings";
import type { Selection } from "../types";
import { type FieldPick, ProspectReviewRow } from "./ProspectReviewRow";
import type { RevealedProspect, RevealFailure } from "./revealContract";

const S = ENRICHMENT_STRINGS.prospects;

export type ItemOutcome = "pending" | "created" | "updated" | { errorId: string };

export interface ReviewSubmission {
  providerRef: string;
  selections: Selection[];
}

type Picks = Record<string, Record<string, FieldPick>>;

function landed(outcome: ItemOutcome | undefined): boolean {
  return outcome === "created" || outcome === "updated";
}

function initialPicks(revealed: readonly RevealedProspect[]): Picks {
  const picks: Picks = {};
  for (const item of revealed) {
    const perField: Record<string, FieldPick> = {};
    for (const field of item.fields) {
      perField[field.canonicalKey] = {
        selectedValue: String(field.selectedValue),
        checked: field.defaultSelected,
        makePrimary: field.defaultMakePrimary,
      };
    }
    picks[item.providerRef] = perField;
  }
  return picks;
}

function initialChecked(revealed: readonly RevealedProspect[]): Set<string> {
  return new Set(revealed.filter((item) => item.fields.length > 0).map((i) => i.providerRef));
}

function selectionsFor(
  item: RevealedProspect,
  picks: Readonly<Record<string, FieldPick>>,
): Selection[] {
  const selections: Selection[] = [];
  for (const field of item.fields) {
    const pick = picks[field.canonicalKey];
    if (pick === undefined || !pick.checked) continue;
    const original = field.values
      .flatMap((v) => [v.value])
      .find((value) => String(value) === pick.selectedValue);
    selections.push({
      canonicalKey: field.canonicalKey,
      value: original ?? pick.selectedValue,
      ...(field.supportsPrimary ? { makePrimary: pick.makePrimary } : {}),
    });
  }
  return selections;
}

export function ProspectReviewStep({
  revealed,
  failures,
  outcomes,
  applying,
  error,
  onApply,
}: {
  revealed: readonly RevealedProspect[];
  failures: readonly RevealFailure[];
  outcomes: Readonly<Record<string, ItemOutcome>>;
  applying: boolean;
  error: string | null;
  onApply: (submissions: ReviewSubmission[]) => void;
}): React.ReactNode {
  const [picks, setPicks] = useState<Picks>(() => initialPicks(revealed));
  const [checked, setChecked] = useState<Set<string>>(() => initialChecked(revealed));

  const submissions = useMemo(
    () =>
      revealed
        .filter((item) => checked.has(item.providerRef) && !landed(outcomes[item.providerRef]))
        .map((item) => ({
          providerRef: item.providerRef,
          selections: selectionsFor(item, picks[item.providerRef] ?? {}),
        }))
        .filter((submission) => submission.selections.length > 0),
    [revealed, checked, picks, outcomes],
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <span className="text-foreground text-sm">{S.reviewTitle}</span>
        <span className="text-muted-foreground text-xs">{S.reviewSubtitle}</span>
      </div>

      <div className="max-h-96 overflow-y-auto rounded-md border border-border px-3">
        {revealed.map((item) => (
          <ProspectReviewRow
            key={item.providerRef}
            providerRef={item.providerRef}
            fullName={item.profile.fullName}
            title={item.profile.title}
            match={item.match}
            fields={item.fields}
            checked={checked.has(item.providerRef)}
            picks={picks[item.providerRef] ?? {}}
            outcome={outcomes[item.providerRef] ?? "pending"}
            onCheckedChange={(next) => {
              setChecked((current) => {
                const updated = new Set(current);
                if (next) updated.add(item.providerRef);
                else updated.delete(item.providerRef);
                return updated;
              });
            }}
            onPickChange={(canonicalKey, pick) => {
              setPicks((current) => ({
                ...current,
                [item.providerRef]: { ...current[item.providerRef], [canonicalKey]: pick },
              }));
            }}
          />
        ))}
      </div>

      {failures.length > 0 ? (
        <span className="text-muted-foreground text-xs">{S.revealFailures(failures.length)}</span>
      ) : null}

      {error !== null ? <span className="text-destructive text-xs">{error}</span> : null}

      <div className="flex justify-end">
        <Button
          disabled={applying || submissions.length === 0}
          onClick={() => {
            onApply(submissions);
          }}
        >
          {applying ? S.applying : S.apply(submissions.length)}
        </Button>
      </div>
    </div>
  );
}
