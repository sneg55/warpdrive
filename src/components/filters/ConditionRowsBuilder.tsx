"use client";
import type React from "react";
import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/Popover";
import { Select, type SelectOption } from "@/components/ui/Select";

// Value-input shape for a field: a plain text/number/date box, or a branded Select whose options
// the caller supplies (owner pickers, enum/stage pickers). Keeping options caller-supplied lets the
// builder stay presentational (no trpc) so contacts, deals, and leads can all share it.
export type ConditionValueInput =
  | { kind: "text" | "number" | "date" }
  | { kind: "select"; options: SelectOption[] };

// One selectable field: its key, its human label, the operator keys valid for it, and how its value
// is entered. Op keys map to labels via the builder's opLabels prop.
export interface ConditionFieldOption {
  field: string;
  label: string;
  ops: readonly string[];
  input: ConditionValueInput;
}

// A compiled-but-still-raw condition (string value). Callers coerce/validate into their own
// definition shape (numbers, dates) when they receive it.
export interface RawCondition {
  field: string;
  op: string;
  value: string;
}

interface Row extends RawCondition {
  id: string;
}

interface ConditionRowsBuilderProps {
  fields: readonly ConditionFieldOption[];
  // opKey -> human label (shared across entities; superset is fine).
  opLabels: Record<string, string>;
  // Show the all/any combinator selector (contacts). Deals AND everything, so pass false.
  supportsCombinator?: boolean;
  // Called with the raw rows + combinator on Apply (empty array means "no conditions").
  onApply: (rows: RawCondition[], combinator: "and" | "or") => void;
  // Called on Clear so the caller can drop its applied definition.
  onClear: () => void;
  // Count of currently-applied conditions, for the trigger badge (0 hides it).
  activeCount: number;
}

const REMOVE = "✕";

// Pipedrive-style "Filter" + Add-condition popover, shared by contacts / deals / leads. A Popover
// (not a menu: it holds form controls) with condition rows (field / operator / value) joined by a
// combinator. Presentational only: the value input for each field is caller-described, and Apply
// hands the raw rows back for the caller to compile into its own filter definition.
export function ConditionRowsBuilder({
  fields,
  opLabels,
  supportsCombinator = true,
  onApply,
  onClear,
  activeCount,
}: ConditionRowsBuilderProps): React.ReactNode {
  const [open, setOpen] = useState(false);
  const [combinator, setCombinator] = useState<"and" | "or">("and");
  const [rows, setRows] = useState<Row[]>([]);

  const first = fields[0];
  function addRow(): void {
    if (first === undefined) return;
    setRows((r) => [
      ...r,
      { id: crypto.randomUUID(), field: first.field, op: first.ops[0] ?? "", value: "" },
    ]);
  }
  function patch(i: number, next: Partial<RawCondition>): void {
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, ...next } : row)));
  }
  function removeRow(i: number): void {
    setRows((r) => r.filter((_, idx) => idx !== i));
  }
  function apply(): void {
    onApply(
      rows.map((r) => ({ field: r.field, op: r.op, value: r.value })),
      combinator,
    );
    setOpen(false);
  }
  function clear(): void {
    setRows([]);
    setCombinator("and");
    onClear();
    setOpen(false);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label="Filter"
        className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
          <path d="M3 5h18l-7 8v6l-4-2v-4z" />
        </svg>
        Filter
        {activeCount > 0 ? (
          <span className="ml-0.5 rounded-full bg-primary px-1.5 text-xs text-primary-foreground tabular-nums">
            {activeCount}
          </span>
        ) : null}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-96 space-y-2 p-2 text-sm">
        {supportsCombinator && rows.length > 1 ? (
          <div className="flex items-center gap-2 px-1">
            <span className="text-xs text-muted-foreground">Match</span>
            <Select
              ariaLabel="Match combinator"
              value={combinator}
              onChange={(v) => setCombinator(v === "or" ? "or" : "and")}
              options={[
                { value: "and", label: "all conditions" },
                { value: "or", label: "any condition" },
              ]}
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
              />
              <Select
                ariaLabel={`Condition ${i + 1} operator`}
                value={row.op}
                onChange={(v) => patch(i, { op: v })}
                options={(def?.ops ?? []).map((o) => ({ value: o, label: opLabels[o] ?? o }))}
              />
              {def?.input.kind === "select" ? (
                <Select
                  ariaLabel={`Condition ${i + 1} value`}
                  value={row.value}
                  onChange={(v) => patch(i, { value: v })}
                  placeholder="Select"
                  options={def.input.options}
                />
              ) : (
                <input
                  aria-label={`Condition ${i + 1} value`}
                  type={
                    def?.input.kind === "number"
                      ? "number"
                      : def?.input.kind === "date"
                        ? "date"
                        : "text"
                  }
                  value={row.value}
                  onChange={(e) => patch(i, { value: e.currentTarget.value })}
                  className="min-w-0 flex-1 rounded-md border px-2 py-1 text-sm"
                  placeholder="Value"
                />
              )}
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

        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={clear}
            className="rounded-md px-3 py-1 text-sm text-muted-foreground hover:text-foreground"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={apply}
            className="rounded-md bg-action px-3 py-1 text-sm text-action-foreground active:scale-[0.96] transition-transform"
          >
            Apply
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
