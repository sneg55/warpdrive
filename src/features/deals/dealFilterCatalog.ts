// The single source of truth for which deal fields a filter builder offers, shared by the ad-hoc
// popover (DealFilterBuilder) and the saved-filter modal (CreateFilterModal) so the two cannot
// drift apart. Pure data at runtime: every import here is type-only except the operator allow-list,
// so the finder #4 invariant test can read the offered list without loading React.
//
// "status" is intentionally NOT offered: the board query hardcodes status = 'open', so any status
// condition other than open ANDs to an impossible predicate and returns zero deals.
import type { ConditionFieldOption, ConditionRow } from "@/components/filters/ConditionRows";
import type { SelectOption } from "@/components/ui/Select";
import { FILTER_OP_LABELS } from "@/constants/filterOps";
import { type FILTER_FIELDS, OPS_BY_FIELD } from "@/features/saved-filters/filterFields";

type DealFilterField = (typeof FILTER_FIELDS)[number];

export interface DealFilterFieldOption extends ConditionFieldOption {
  field: DealFilterField;
}

// Operator key to human label, shared by both builders and by the auto-generated filter name.
// The vocabulary itself lives in @/constants/filterOps so deals, contacts, and leads label an
// operator identically; widened to a string index so callers can look up an unvalidated row op.
export const OP_LABELS: Record<string, string> = FILTER_OP_LABELS;

export interface DealFilterCatalogSources {
  owners?: readonly { id: string; name: string }[];
  stages?: readonly { id: string; name: string }[];
  // Label names, already merged from the catalog and what deals actually carry.
  labelOptions?: readonly string[];
}

function named(rows: readonly { id: string; name: string }[]): SelectOption[] {
  return rows.map((r) => ({ value: r.id, label: r.name }));
}

// A fresh, empty row seeded from the first offered field and its first operator, matching what
// "+ Add condition" produces inside ConditionRows.
export function blankConditionRow(fields: readonly ConditionFieldOption[]): ConditionRow {
  const first = fields[0];
  return {
    id: crypto.randomUUID(),
    field: first?.field ?? "title",
    op: first?.ops[0] ?? "contains",
    value: "",
  };
}

export function dealFilterFields(sources: DealFilterCatalogSources = {}): DealFilterFieldOption[] {
  const { owners = [], stages = [], labelOptions = [] } = sources;
  return [
    { field: "title", label: "Title", ops: OPS_BY_FIELD.title, input: { kind: "text" } },
    { field: "orgName", label: "Organization", ops: OPS_BY_FIELD.orgName, input: { kind: "text" } },
    { field: "value", label: "Value", ops: OPS_BY_FIELD.value, input: { kind: "number" } },
    {
      field: "ownerId",
      label: "Owner",
      ops: OPS_BY_FIELD.ownerId,
      input: { kind: "select", options: named(owners) },
    },
    {
      field: "stageId",
      label: "Stage",
      ops: OPS_BY_FIELD.stageId,
      input: { kind: "select", options: named(stages) },
    },
    {
      field: "expectedCloseDate",
      label: "Expected close",
      ops: OPS_BY_FIELD.expectedCloseDate,
      input: { kind: "date" },
    },
    {
      field: "labels",
      label: "Label",
      ops: OPS_BY_FIELD.labels,
      input: { kind: "multiselect", options: labelOptions.map((n) => ({ value: n, label: n })) },
    },
  ];
}
