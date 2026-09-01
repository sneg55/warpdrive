"use client";

import type React from "react";
import { useId, useState } from "react";
import { Checkbox } from "@/components/ui/Checkbox";
import { ENRICHMENT_STRINGS } from "@/constants/enrichmentStrings";
import { EnrichFieldRow } from "../EnrichFieldRow";
import type { ProposedField } from "../types";
import type { ProspectMatch } from "./types";

const S = ENRICHMENT_STRINGS.prospects;

export interface FieldPick {
  selectedValue: string;
  checked: boolean;
  makePrimary: boolean;
}

export interface ProspectReviewRowProps {
  providerRef: string;
  fullName: string;
  title: string | undefined;
  match: ProspectMatch;
  fields: ProposedField[];
  checked: boolean;
  picks: Readonly<Record<string, FieldPick>>;
  outcome: "pending" | "created" | "updated" | { errorId: string };
  onCheckedChange: (checked: boolean) => void;
  onPickChange: (canonicalKey: string, pick: FieldPick) => void;
}

function errorMessage(errorId: string): string {
  if (errorId === "E_ENRICH_006") return S.itemStale;
  if (errorId === "E_PERM_001") return S.itemDenied;
  return S.itemFailed;
}

function Status({ outcome }: { outcome: ProspectReviewRowProps["outcome"] }): React.ReactNode {
  if (outcome === "pending") return null;
  if (outcome === "created") {
    return <span className="text-muted-foreground text-xs">{S.applied}</span>;
  }
  if (outcome === "updated") {
    return <span className="text-muted-foreground text-xs">{S.updated}</span>;
  }
  return <span className="text-destructive text-xs">{errorMessage(outcome.errorId)}</span>;
}

export function ProspectReviewRow({
  providerRef,
  fullName,
  title,
  match,
  fields,
  checked,
  picks,
  outcome,
  onCheckedChange,
  onPickChange,
}: ProspectReviewRowProps): React.ReactNode {
  const [expanded, setExpanded] = useState(false);
  const checkboxId = useId();
  const empty = fields.length === 0;

  return (
    <div className="border-border/60 border-b py-3 last:border-b-0">
      <div className="flex items-start gap-3">
        <Checkbox
          id={checkboxId}
          checked={checked}
          disabled={empty}
          onCheckedChange={onCheckedChange}
          label={fullName}
        />
        <div className="flex flex-1 flex-col gap-0.5">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <label htmlFor={checkboxId} className="text-foreground text-sm">
              {fullName}
            </label>
            {title !== undefined ? (
              <span className="text-muted-foreground text-xs">{title}</span>
            ) : null}
            <span className="text-muted-foreground text-xs">
              {match.kind === "existing" ? S.reviewWillUpdate : S.reviewWillCreate}
            </span>
            <Status outcome={outcome} />
          </div>
          {empty ? (
            <span className="text-muted-foreground text-xs">{S.reviewNothingFound}</span>
          ) : (
            <button
              type="button"
              className="self-start text-muted-foreground text-xs underline underline-offset-2 hover:text-foreground"
              onClick={() => {
                setExpanded((open) => !open);
              }}
            >
              {expanded ? S.reviewCollapse : S.reviewExpand}
            </button>
          )}
        </div>
      </div>
      {expanded && !empty ? (
        <div className="mt-2 flex flex-col gap-2 pl-7">
          {fields.map((field) => {
            const pick = picks[field.canonicalKey] ?? {
              selectedValue: String(field.selectedValue),
              checked: field.defaultSelected,
              makePrimary: field.defaultMakePrimary,
            };
            return (
              <EnrichFieldRow
                key={`${providerRef}:${field.canonicalKey}`}
                field={field}
                checked={pick.checked}
                selectedValue={pick.selectedValue}
                makePrimary={pick.makePrimary}
                onCheckedChange={(next) => {
                  onPickChange(field.canonicalKey, { ...pick, checked: next });
                }}
                onValueChange={(next) => {
                  onPickChange(field.canonicalKey, { ...pick, selectedValue: next });
                }}
                onMakePrimaryChange={(next) => {
                  onPickChange(field.canonicalKey, { ...pick, makePrimary: next });
                }}
              />
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
