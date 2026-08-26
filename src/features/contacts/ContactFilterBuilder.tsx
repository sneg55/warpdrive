"use client";
import type React from "react";
import { useMemo } from "react";
import {
  type ConditionFieldOption,
  ConditionRowsBuilder,
  type ConditionValueInput,
  type RawCondition,
} from "@/components/filters/ConditionRowsBuilder";
import { rowValueOf } from "@/components/filters/rowValue";
import type { SelectOption } from "@/components/ui/Select";
import type { LabelTarget } from "@/constants/labelColors";
import { mergeLabelOptions } from "@/features/labels/mergeLabelOptions";
import { trpc } from "@/lib/trpc-client";
import type {
  ContactFilterConfig,
  ContactFilterDefinition,
  ContactFilterOp,
} from "./contactFilterConfig";
import { ORG_FILTER_CONFIG } from "./contactFilterConfig";
import { type FieldKind, fieldKind, OP_LABELS, rowsToDefinition } from "./contactFilterRows";

function valueInput(
  kind: FieldKind,
  ownerOptions: SelectOption[],
  labelOptions: SelectOption[],
): ConditionValueInput {
  switch (kind) {
    case "owner":
      return { kind: "select", options: ownerOptions };
    case "label":
      return { kind: "multiselect", options: labelOptions };
    case "number":
      return { kind: "number" };
    case "text":
      return { kind: "text" };
  }
}

interface ContactFilterBuilderProps {
  config: ContactFilterConfig;
  fieldLabels: Record<string, string>;
  // Called with the compiled definition (null clears the filter) when Apply/Clear is pressed.
  onApply: (def: ContactFilterDefinition | null) => void;
  // Count of currently-applied conditions, for the trigger badge (0 hides it).
  activeCount: number;
  // The definition currently applied to the list, so reopening the builder edits that filter
  // rather than clearing it, and an "any condition" filter is never shown back as "all".
  appliedDefinition?: ContactFilterDefinition | null;
}

// Config-driven "Filter" builder for the contacts lists (People / Orgs). A thin adapter over the
// shared ConditionRowsBuilder: it maps the backend ContactFilterConfig into the shared field
// descriptors (fieldKind picks the value control: owner and label Selects, a number box, or text)
// and compiles the raw rows back into a validated ContactFilterDefinition on Apply.
export function ContactFilterBuilder({
  config,
  fieldLabels,
  onApply,
  activeCount,
  appliedDefinition = null,
}: ContactFilterBuilderProps): React.ReactNode {
  const ownersQ = trpc.identity.assignableUsers.useQuery(undefined, { staleTime: 30_000 });
  const ownerOptions: SelectOption[] = (ownersQ.data ?? []).map((u) => ({
    value: u.id,
    label: u.name,
  }));

  // The People and Orgs lists are the only callers, so the config identifies the label catalog.
  const target: LabelTarget = config === ORG_FILTER_CONFIG ? "organization" : "person";
  const catalogNames = (trpc.labels.listByTarget.useQuery({ target }).data ?? []).map(
    (l) => l.name,
  );
  // Union in the names records actually carry: a label visible on the list must be filterable.
  const appliedNames = trpc.labels.appliedNames.useQuery({ target }).data ?? [];
  // The labels column stores the label NAME, so the option value is the name, not a catalog id.
  const labelOptions: SelectOption[] = mergeLabelOptions(catalogNames, appliedNames).map(
    (name) => ({
      value: name,
      label: name,
    }),
  );

  const fields = useMemo<ConditionFieldOption[]>(
    () =>
      config.fields.map((f) => ({
        field: f,
        label: fieldLabels[f] ?? f,
        ops: config.opsByField[f] ?? [],
        input: valueInput(fieldKind(config, f), ownerOptions, labelOptions),
      })),
    [config, fieldLabels, ownerOptions, labelOptions],
  );

  const appliedRows = useMemo<RawCondition[]>(
    () =>
      (appliedDefinition?.conditions ?? []).map((c) => ({
        field: c.field,
        op: c.op,
        value: rowValueOf(c.value),
      })),
    [appliedDefinition],
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
      appliedRows={appliedRows}
      appliedCombinator={appliedDefinition?.combinator ?? "and"}
      onApply={handleApply}
      onClear={() => onApply(null)}
    />
  );
}
