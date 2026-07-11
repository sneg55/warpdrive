"use client";
import type React from "react";
import { useMemo } from "react";
import {
  type ConditionFieldOption,
  ConditionRowsBuilder,
  type RawCondition,
} from "@/components/filters/ConditionRowsBuilder";
import type { SelectOption } from "@/components/ui/Select";
import { OPS_BY_LEAD_FIELD } from "../leadFilterFields";
import type { LeadConditionInput } from "../schemas";
import { leadRowsToCondition } from "./leadFilterRows";

const OP_LABELS: Record<string, string> = {
  eq: "is",
  neq: "is not",
  contains: "contains",
  gt: "greater than",
  lt: "less than",
  gte: "at least",
  lte: "at most",
};

interface LeadFilterBuilderProps {
  // Assignable users, offered as the value dropdown for an Owner condition.
  users: ReadonlyArray<{ id: string; name: string }>;
  // Called with the compiled lead condition (null clears it) on Apply/Clear.
  onApply: (condition: LeadConditionInput | null) => void;
  activeCount: number;
}

// Inline ad-hoc condition builder for the Leads Inbox, matching the People/Orgs experience. Feeds
// the shared ConditionRowsBuilder the lead field catalog and compiles the raw rows into a condition
// the server read (lead.list) re-validates and compiles to allow-listed SQL.
export function LeadFilterBuilder({
  users,
  onApply,
  activeCount,
}: LeadFilterBuilderProps): React.ReactNode {
  const ownerOptions: SelectOption[] = users.map((u) => ({ value: u.id, label: u.name }));

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
    ],
    [ownerOptions],
  );

  function handleApply(rows: RawCondition[], combinator: "and" | "or"): void {
    onApply(leadRowsToCondition(rows, combinator));
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
