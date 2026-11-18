import type { ConditionFieldOption, ConditionRow } from "@/components/filters/ConditionRows";
import type { SelectOption } from "@/components/ui/Select";
import { DEAL_STATUS, DEAL_STATUS_LABELS } from "@/constants/dealStatus";
import { FILTER_OP_LABELS } from "@/constants/filterOps";
import { type FILTER_FIELDS, OPS_BY_FIELD } from "@/features/saved-filters/filterFields";

type DealFilterField = (typeof FILTER_FIELDS)[number];

export interface DealFilterFieldOption extends ConditionFieldOption {
  field: DealFilterField;
}

export const OP_LABELS: Record<string, string> = FILTER_OP_LABELS;

export interface DealFilterCatalogSources {
  owners?: readonly { id: string; name: string }[];
  stages?: readonly { id: string; name: string }[];
  labelOptions?: readonly string[];
}

function named(rows: readonly { id: string; name: string }[]): SelectOption[] {
  return rows.map((r) => ({ value: r.id, label: r.name }));
}

const STATUS_OPTIONS: SelectOption[] = DEAL_STATUS.map((s) => ({
  value: s,
  label: DEAL_STATUS_LABELS[s],
}));

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
      field: "status",
      label: "Status",
      ops: OPS_BY_FIELD.status,
      input: { kind: "select", options: STATUS_OPTIONS },
    },
    {
      field: "expectedCloseDate",
      label: "Expected close",
      ops: OPS_BY_FIELD.expectedCloseDate,
      input: { kind: "date" },
    },
    {
      field: "nextActivityAt",
      label: "Next activity date",
      ops: OPS_BY_FIELD.nextActivityAt,
      input: { kind: "date" },
    },
    {
      field: "lastActivityAt",
      label: "Last activity date",
      ops: OPS_BY_FIELD.lastActivityAt,
      input: { kind: "date" },
    },
    {
      field: "wonTime",
      label: "Won date",
      ops: OPS_BY_FIELD.wonTime,
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
