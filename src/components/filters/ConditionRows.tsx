"use client";
import type React from "react";
import { Select, type SelectOption } from "@/components/ui/Select";
import { VALUELESS_OPS } from "@/constants/filterOps";
import { ConditionValue, type ConditionValueInput } from "./ConditionValue";
import type { RowValue } from "./rowValue";

// Re-exported so the consumers that import the row types from here keep resolving.
export type { ConditionValueInput } from "./ConditionValue";
export type { RowValue } from "./rowValue";

// One selectable field: its key, its human label, the operator keys valid for it, and how its value
// is entered. Op keys map to labels via the opLabels prop.
export interface ConditionFieldOption {
  field: string;
  label: string;
  ops: readonly string[];
  input: ConditionValueInput;
}

// A compiled-but-still-raw condition. Callers coerce/validate into their own definition shape
// (numbers, dates) when they receive it. A multi-select field carries a list of picked values,
// which is how one condition means "is any of".
export interface RawCondition {
  field: string;
  op: string;
  value: RowValue;
}

// A raw condition while it is being edited: the id is the React key, and is dropped on apply.
export interface ConditionRow extends RawCondition {
  id: string;
}

interface ConditionRowsProps {
  fields: readonly ConditionFieldOption[];
  // opKey -> human label (shared across entities; superset is fine).
  opLabels: Record<string, string>;
  rows: ConditionRow[];
  onRowsChange: (rows: ConditionRow[]) => void;
  // Show the all/any combinator selector, once there is more than one row.
  supportsCombinator?: boolean;
  combinator: "and" | "or";
  onCombinatorChange: (c: "and" | "or") => void;
}

const REMOVE = "✕";

const COMBINATOR_OPTIONS: SelectOption[] = [
  { value: "and", label: "all conditions" },
  { value: "or", label: "any condition" },
];

// The condition list body: combinator selector, one row per condition (field / operator / value /
// remove), and "+ Add condition". Fully controlled, so both the ad-hoc filter popover and the
// saved-filter modal can host it with their own chrome and footer.
export function ConditionRows({
  fields,
  opLabels,
  rows,
  onRowsChange,
  supportsCombinator = true,
  combinator,
  onCombinatorChange,
}: ConditionRowsProps): React.ReactNode {
  const first = fields[0];

  function addRow(): void {
    if (first === undefined) return;
    onRowsChange([
      ...rows,
      { id: crypto.randomUUID(), field: first.field, op: first.ops[0] ?? "", value: "" },
    ]);
  }
  function patch(i: number, next: Partial<RawCondition>): void {
    onRowsChange(rows.map((row, idx) => (idx === i ? { ...row, ...next } : row)));
  }
  function removeRow(i: number): void {
    onRowsChange(rows.filter((_, idx) => idx !== i));
  }

  return (
    <>
      {supportsCombinator && rows.length > 1 ? (
        <div className="flex items-center gap-2 px-1">
          <span className="text-xs text-muted-foreground">Match</span>
          <Select
            ariaLabel="Match combinator"
            value={combinator}
            onChange={(v) => onCombinatorChange(v === "or" ? "or" : "and")}
            options={COMBINATOR_OPTIONS}
          />
        </div>
      ) : null}

      {rows.map((row, i) => {
        const def = fields.find((f) => f.field === row.field) ?? first;
        return (
          <div key={row.id} className="flex items-center gap-1.5">
            <Select
              ariaLabel={`Condition ${i + 1} field`}
              value={row.field}
              onChange={(v) => {
                const nextDef = fields.find((f) => f.field === v);
                patch(i, { field: v, op: nextDef?.ops[0] ?? "", value: "" });
              }}
              options={fields.map((f) => ({ value: f.field, label: f.label }))}
              triggerClassName="min-w-0 flex-1"
            />
            <Select
              ariaLabel={`Condition ${i + 1} operator`}
              value={row.op}
              onChange={(v) => patch(i, { op: v, value: VALUELESS_OPS.has(v) ? "" : row.value })}
              options={(def?.ops ?? []).map((o) => ({ value: o, label: opLabels[o] ?? o }))}
              triggerClassName="min-w-0 flex-1"
            />
            {/* The slot keeps its width when empty, so the operator dropdown does not resize. It
                gets the larger share because it holds label chips and dates, not one short word. */}
            <div data-slot="condition-value" className="min-w-0 flex-[2]">
              {VALUELESS_OPS.has(row.op) ? null : (
                <ConditionValue
                  input={def?.input}
                  ariaLabel={`Condition ${i + 1} value`}
                  value={row.value}
                  onChange={(v) => patch(i, { value: v })}
                />
              )}
            </div>
            <button
              type="button"
              aria-label={`Remove condition ${i + 1}`}
              onClick={() => removeRow(i)}
              className="shrink-0 rounded px-1.5 text-muted-foreground hover:text-foreground"
            >
              {REMOVE}
            </button>
          </div>
        );
      })}

      <button
        type="button"
        onClick={addRow}
        className="w-full rounded-md border border-dashed px-2 py-1.5 text-sm text-muted-foreground hover:border-ring hover:text-foreground"
      >
        + Add condition
      </button>
    </>
  );
}
