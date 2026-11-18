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
  stages: ReadonlyArray<{ id: string; name: string }>;
  onApply: (def: FilterDefinition | null) => void;
  activeCount: number;
  appliedDefinition?: FilterDefinition | null;
}

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
