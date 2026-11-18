"use client";
import type React from "react";
import { useMemo } from "react";
import {
  type ConditionFieldOption,
  ConditionRowsBuilder,
  type RawCondition,
} from "@/components/filters/ConditionRowsBuilder";
import { rowValueOf } from "@/components/filters/rowValue";
import type { SelectOption } from "@/components/ui/Select";
import { FILTER_OP_LABELS } from "@/constants/filterOps";
import { mergeLabelOptions } from "@/features/labels/mergeLabelOptions";
import { trpc } from "@/lib/trpc-client";
import { OPS_BY_LEAD_FIELD } from "../leadFilterFields";
import type { LeadConditionInput } from "../schemas";
import { leadRowsToCondition } from "./leadFilterRows";

interface LeadFilterBuilderProps {
  users: ReadonlyArray<{ id: string; name: string }>;
  onApply: (condition: LeadConditionInput | null) => void;
  activeCount: number;
  appliedCondition?: LeadConditionInput | null;
}

export function LeadFilterBuilder({
  users,
  onApply,
  activeCount,
  appliedCondition = null,
}: LeadFilterBuilderProps): React.ReactNode {
  const ownerOptions: SelectOption[] = users.map((u) => ({ value: u.id, label: u.name }));

  const catalogNames = (trpc.labels.listByTarget.useQuery({ target: "lead" }).data ?? []).map(
    (l) => l.name,
  );
  const appliedNames = trpc.labels.appliedNames.useQuery({ target: "lead" }).data ?? [];
  const labelOptions: SelectOption[] = mergeLabelOptions(catalogNames, appliedNames).map(
    (name) => ({
      value: name,
      label: name,
    }),
  );

  const fields = useMemo<ConditionFieldOption[]>(
    () => [
      { field: "title", label: "Title", ops: OPS_BY_LEAD_FIELD.title, input: { kind: "text" } },
      { field: "value", label: "Value", ops: OPS_BY_LEAD_FIELD.value, input: { kind: "number" } },
      {
        field: "sourceOrigin",
        label: "Source origin",
        ops: OPS_BY_LEAD_FIELD.sourceOrigin,
        input: { kind: "text" },
      },
      {
        field: "ownerId",
        label: "Owner",
        ops: OPS_BY_LEAD_FIELD.ownerId,
        input: { kind: "select", options: ownerOptions },
      },
      {
        field: "labels",
        label: "Label",
        ops: OPS_BY_LEAD_FIELD.labels,
        input: { kind: "multiselect", options: labelOptions },
      },
    ],
    [ownerOptions, labelOptions],
  );

  const appliedRows = useMemo<RawCondition[]>(
    () =>
      (appliedCondition?.conditions ?? []).map((c) => ({
        field: c.field,
        op: c.op,
        value: rowValueOf(c.value),
      })),
    [appliedCondition],
  );

  function handleApply(rows: RawCondition[], combinator: "and" | "or"): void {
    onApply(leadRowsToCondition(rows, combinator));
  }

  return (
    <ConditionRowsBuilder
      fields={fields}
      opLabels={FILTER_OP_LABELS}
      activeCount={activeCount}
      appliedRows={appliedRows}
      appliedCombinator={appliedCondition?.combinator ?? "and"}
      onApply={handleApply}
      onClear={() => onApply(null)}
    />
  );
}
