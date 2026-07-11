"use client";
import type React from "react";
import { useMemo } from "react";
import {
  type ConditionFieldOption,
  ConditionRowsBuilder,
  type RawCondition,
} from "@/components/filters/ConditionRowsBuilder";
import type { SelectOption } from "@/components/ui/Select";
import { OPS_BY_FIELD } from "@/features/saved-filters/filterFields";
import type { FilterDefinition } from "@/features/saved-filters/schemas";
import { trpc } from "@/lib/trpc-client";
import { dealRowsToDefinition } from "./dealFilterRows";

// Op labels shared with the saved-filter row UI (kept local so this builder does not import from
// the contacts feature). Superset of every op any deal field offers.
const OP_LABELS: Record<string, string> = {
  eq: "is",
  neq: "is not",
  contains: "contains",
  gt: "greater than",
  lt: "less than",
  gte: "at least",
  lte: "at most",
};

interface DealFilterBuilderProps {
  // Pipeline stages, offered as the value dropdown for a Stage condition.
  stages: ReadonlyArray<{ id: string; name: string }>;
  // Called with the compiled deal filter definition (null clears it) on Apply/Clear.
  onApply: (def: FilterDefinition | null) => void;
  activeCount: number;
}

// Inline ad-hoc condition builder for the deals board + list, matching the People/Orgs experience.
// Feeds the shared ConditionRowsBuilder the deal field catalog (schemas.ts allow-list) and compiles
// the raw rows into a FilterDefinition the read path already accepts (no save required). Deals AND
// every condition (the read path has no OR combinator), so the combinator selector is hidden.
export function DealFilterBuilder({
  stages,
  onApply,
  activeCount,
}: DealFilterBuilderProps): React.ReactNode {
  const ownersQ = trpc.identity.assignableUsers.useQuery(undefined, { staleTime: 30_000 });
  const ownerOptions: SelectOption[] = (ownersQ.data ?? []).map((u) => ({
    value: u.id,
    label: u.name,
  }));
  const stageOptions: SelectOption[] = stages.map((s) => ({ value: s.id, label: s.name }));

  const fields = useMemo<ConditionFieldOption[]>(
    () => [
      { field: "title", label: "Title", ops: OPS_BY_FIELD.title, input: { kind: "text" } },
      { field: "value", label: "Value", ops: OPS_BY_FIELD.value, input: { kind: "number" } },
      {
        field: "ownerId",
        label: "Owner",
        ops: OPS_BY_FIELD.ownerId,
        input: { kind: "select", options: ownerOptions },
      },
      {
        field: "stageId",
        label: "Stage",
        ops: OPS_BY_FIELD.stageId,
        input: { kind: "select", options: stageOptions },
      },
      {
        field: "expectedCloseDate",
        label: "Expected close",
        ops: OPS_BY_FIELD.expectedCloseDate,
        input: { kind: "date" },
      },
    ],
    [ownerOptions, stageOptions],
  );

  function handleApply(rows: RawCondition[]): void {
    onApply(dealRowsToDefinition(rows));
  }

  return (
    <ConditionRowsBuilder
      fields={fields}
      opLabels={OP_LABELS}
      supportsCombinator={false}
      activeCount={activeCount}
      onApply={handleApply}
      onClear={() => onApply(null)}
    />
  );
}
