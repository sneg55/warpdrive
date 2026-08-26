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
  // Assignable users, offered as the value dropdown for an Owner condition.
  users: ReadonlyArray<{ id: string; name: string }>;
  // Called with the compiled lead condition (null clears it) on Apply/Clear.
  onApply: (condition: LeadConditionInput | null) => void;
  activeCount: number;
  // The condition currently applied to the inbox, so reopening the builder edits that filter
  // rather than clearing it, and an "any condition" filter is never shown back as "all".
  appliedCondition?: LeadConditionInput | null;
}

// Inline ad-hoc condition builder for the Leads Inbox, matching the People/Orgs experience. Feeds
// the shared ConditionRowsBuilder the lead field catalog and compiles the raw rows into a condition
// the server read (lead.list) re-validates and compiles to allow-listed SQL.
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
  // Union in the names leads actually carry: a label visible on the list must be filterable.
  const appliedNames = trpc.labels.appliedNames.useQuery({ target: "lead" }).data ?? [];
  // leads.labels stores the label NAME, so the option value is the name, not a catalog id.
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
