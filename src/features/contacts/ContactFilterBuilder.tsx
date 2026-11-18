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
  onApply: (def: ContactFilterDefinition | null) => void;
  activeCount: number;
  appliedDefinition?: ContactFilterDefinition | null;
}

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

  const target: LabelTarget = config === ORG_FILTER_CONFIG ? "organization" : "person";
  const catalogNames = (trpc.labels.listByTarget.useQuery({ target }).data ?? []).map(
    (l) => l.name,
  );
  const appliedNames = trpc.labels.appliedNames.useQuery({ target }).data ?? [];
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
