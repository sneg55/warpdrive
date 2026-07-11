"use client";
import type React from "react";
import { useMemo } from "react";
import {
  type ConditionFieldOption,
  ConditionRowsBuilder,
  type RawCondition,
} from "@/components/filters/ConditionRowsBuilder";
import type { SelectOption } from "@/components/ui/Select";
import { trpc } from "@/lib/trpc-client";
import type {
  ContactFilterConfig,
  ContactFilterDefinition,
  ContactFilterOp,
} from "./contactFilterConfig";
import { OP_LABELS, rowsToDefinition } from "./contactFilterRows";

interface ContactFilterBuilderProps {
  config: ContactFilterConfig;
  fieldLabels: Record<string, string>;
  // Called with the compiled definition (null clears the filter) when Apply/Clear is pressed.
  onApply: (def: ContactFilterDefinition | null) => void;
  // Count of currently-applied conditions, for the trigger badge (0 hides it).
  activeCount: number;
}

// Config-driven "Filter" builder for the contacts lists (People / Orgs). A thin adapter over the
// shared ConditionRowsBuilder: it maps the backend ContactFilterConfig into the shared field
// descriptors (owner fields become a Select of assignable users; numeric fields a number box) and
// compiles the raw rows back into a validated ContactFilterDefinition on Apply.
export function ContactFilterBuilder({
  config,
  fieldLabels,
  onApply,
  activeCount,
}: ContactFilterBuilderProps): React.ReactNode {
  const ownersQ = trpc.identity.assignableUsers.useQuery(undefined, { staleTime: 30_000 });
  const ownerOptions: SelectOption[] = (ownersQ.data ?? []).map((u) => ({
    value: u.id,
    label: u.name,
  }));

  const fields = useMemo<ConditionFieldOption[]>(
    () =>
      config.fields.map((f) => ({
        field: f,
        label: fieldLabels[f] ?? f,
        ops: config.opsByField[f] ?? [],
        input:
          f === "ownerId"
            ? { kind: "select", options: ownerOptions }
            : config.numericFields.includes(f)
              ? { kind: "number" }
              : { kind: "text" },
      })),
    [config, fieldLabels, ownerOptions],
  );

  function handleApply(rows: RawCondition[], combinator: "and" | "or"): void {
    const builderRows = rows.map((r) => ({
      field: r.field,
      op: r.op as ContactFilterOp,
      value: r.value,
    }));
    onApply(rowsToDefinition(combinator, builderRows, config));
  }

  return (
    <ConditionRowsBuilder
      fields={fields}
      opLabels={OP_LABELS}
      activeCount={activeCount}
      onApply={handleApply}
      onClear={() => onApply(null)}
    />
  );
}
