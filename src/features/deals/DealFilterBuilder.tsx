"use client";
import type React from "react";
import { useMemo } from "react";
import { ConditionRowsBuilder, type RawCondition } from "@/components/filters/ConditionRowsBuilder";
import { mergeLabelOptions } from "@/features/labels/mergeLabelOptions";
import type { FilterDefinition } from "@/features/saved-filters/schemas";
import { trpc } from "@/lib/trpc-client";
import { dealFilterFields, OP_LABELS } from "./dealFilterCatalog";
import { dealRowsToDefinition, definitionToRows } from "./dealFilterRows";

interface DealFilterBuilderProps {
  // Pipeline stages, offered as the value dropdown for a Stage condition.
  stages: ReadonlyArray<{ id: string; name: string }>;
  // Called with the compiled deal filter definition (null clears it) on Apply/Clear.
  onApply: (def: FilterDefinition | null) => void;
  activeCount: number;
  // The ad-hoc definition currently applied, so reopening the builder edits that filter rather than
  // starting blank and an "any condition" filter is never silently shown as "all".
  appliedDefinition?: FilterDefinition | null;
}

// Inline ad-hoc condition builder for the deals board + list, matching the People/Orgs experience.
// Feeds the shared ConditionRowsBuilder the deal field catalog and compiles the raw rows into a
// FilterDefinition the read path already accepts (no save required).
export function DealFilterBuilder({
  stages,
  onApply,
  activeCount,
  appliedDefinition = null,
}: DealFilterBuilderProps): React.ReactNode {
  const ownersQ = trpc.identity.assignableUsers.useQuery(undefined, { staleTime: 30_000 });
  const catalogNames = (trpc.labels.listByTarget.useQuery({ target: "deal" }).data ?? []).map(
    (l) => l.name,
  );
  // Union in what deals actually carry: a label written straight to the database still shows on the
  // card, and a filter that omits a label the user can see on screen reads as broken.
  const appliedNames = trpc.labels.appliedNames.useQuery({ target: "deal" }).data ?? [];

  const fields = dealFilterFields({
    owners: ownersQ.data ?? [],
    stages,
    labelOptions: mergeLabelOptions(catalogNames, appliedNames),
  });

  const appliedRows = useMemo(
    () => (appliedDefinition === null ? [] : definitionToRows(appliedDefinition)),
    [appliedDefinition],
  );

  function handleApply(rows: RawCondition[], combinator: "and" | "or"): void {
    onApply(dealRowsToDefinition(rows, combinator));
  }

  return (
    <ConditionRowsBuilder
      fields={fields}
      opLabels={OP_LABELS}
      activeCount={activeCount}
      appliedRows={appliedRows}
      appliedCombinator={appliedDefinition?.combinator ?? "and"}
      onApply={handleApply}
      onClear={() => onApply(null)}
    />
  );
}
