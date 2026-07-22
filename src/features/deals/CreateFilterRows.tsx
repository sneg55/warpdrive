"use client";
import type React from "react";
import { Select, type SelectOption } from "@/components/ui/Select";
import { DEAL_STATUS } from "@/constants/dealStatus";
import {
  type FILTER_FIELDS,
  type FILTER_OPS,
  OPS_BY_FIELD,
} from "@/features/saved-filters/filterFields";
import type { BoardOwner } from "./boardFilter";
import { OFFERED_BOARD_FILTER_FIELDS } from "./boardFilterFields";

type AstField = (typeof FILTER_FIELDS)[number];
type AstOp = (typeof FILTER_OPS)[number];

export interface Row {
  field: AstField;
  op: AstOp;
  value: string;
}

// Fields whose value is drawn from a fixed set (enum or entity list): the value should be picked
// from a dropdown, not typed free-hand, so it always matches a real stored value.
function isDictField(field: AstField): boolean {
  return field === "status" || field === "ownerId";
}

// Options for a dict field's value dropdown. Status is a fixed enum; ownerId comes from the board.
function valueOptions(field: AstField, owners: BoardOwner[]): SelectOption[] {
  if (field === "status") {
    return DEAL_STATUS.map((s) => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1) }));
  }
  if (field === "ownerId") {
    return owners.map((o) => ({ value: o.ownerId, label: o.name }));
  }
  return [];
}

// The offered field list is the shared source of truth in boardFilterFields (imported above), so
// the finder #4 invariant test guards exactly what this UI renders. It intentionally omits
// "status" because the board query hardcodes status = 'open'.
const OP_LABEL: Record<AstOp, string> = {
  contains: "contains",
  eq: "is",
  neq: "is not",
  gt: "greater than",
  lt: "less than",
  gte: "at least",
  lte: "at most",
};

// Only the operators the field's column type can run (mirrors the schema allow-list), so the
// UI cannot build a pairing that would fail the SQL cast at query time.
function opsFor(field: AstField): AstOp[] {
  return OPS_BY_FIELD[field] as AstOp[];
}

export function blankRow(): Row {
  return { field: "title", op: "contains", value: "" };
}

// Human-readable value for a condition: dict fields resolve their id/enum to a label (owner name,
// "Won"), free-text/number fields use the raw value.
function valueLabel(field: AstField, value: string, owners: BoardOwner[]): string {
  if (isDictField(field)) {
    return valueOptions(field, owners).find((o) => o.value === value)?.label ?? value;
  }
  return value;
}

// A default filter name derived from the conditions, e.g. "Status is Won and Value greater than
// 60000". Skips incomplete rows; empty when nothing is set yet. Used to auto-fill the name field.
export function describeRows(rows: Row[], owners: BoardOwner[] = []): string {
  return rows
    .filter((r) => r.value.trim() !== "")
    .map((r) => {
      const field = OFFERED_BOARD_FILTER_FIELDS.find((f) => f.value === r.field)?.label ?? r.field;
      return `${field} ${OP_LABEL[r.op]} ${valueLabel(r.field, r.value, owners)}`;
    })
    .join(" and ");
}

export function ConditionRows({
  rows,
  setRows,
  owners = [],
}: {
  rows: Row[];
  setRows: React.Dispatch<React.SetStateAction<Row[]>>;
  owners?: BoardOwner[];
}): React.ReactNode {
  function update(idx: number, patch: Partial<Row>): void {
    setRows((prev) => prev.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  }
  function remove(idx: number): void {
    setRows((prev) => prev.filter((_, i) => i !== idx));
  }
  return (
    <fieldset className="rounded-md border p-3">
      <legend className="px-1 text-sm font-semibold">Match all of these conditions</legend>
      <div className="flex flex-col gap-2">
        {rows.map((c, idx) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: positional condition rows
          <div key={idx} className="flex items-center gap-2">
            {/* Fixed-width so the WHERE / AND connectors line up down the column. */}
            <span className="w-14 shrink-0 rounded bg-muted py-1 text-center text-xs uppercase tracking-wide text-muted-foreground">
              {idx === 0 ? "Where" : "And"}
            </span>
            {/* Field + operator get bounded widths; without them the selects' w-full basis claims
                the whole row and starves the value input to zero width. */}
            <Select
              ariaLabel="Field"
              value={c.field}
              onChange={(v) => {
                const field = v as AstField;
                const allowed = opsFor(field);
                // Keep the current op if the new field still supports it, else pick its first.
                const op = allowed.includes(c.op) ? c.op : allowed[0];
                // A value typed for one field rarely fits another (and never fits a dict field's
                // fixed set), so reset it unless both old and new are free-text/number fields.
                const keepValue = !isDictField(field) && !isDictField(c.field);
                update(idx, { field, op, value: keepValue ? c.value : "" });
              }}
              options={OFFERED_BOARD_FILTER_FIELDS.map<SelectOption>((f) => ({
                value: f.value,
                label: f.label,
              }))}
              triggerClassName="w-32 shrink-0"
            />
            <Select
              ariaLabel="Operator"
              value={c.op}
              onChange={(v) => update(idx, { op: v as AstOp })}
              options={opsFor(c.field).map<SelectOption>((o) => ({ value: o, label: OP_LABEL[o] }))}
              triggerClassName="w-40 shrink-0"
            />
            <div className="min-w-0 flex-1">
              {isDictField(c.field) ? (
                <Select
                  ariaLabel="Value"
                  value={c.value}
                  onChange={(v) => update(idx, { value: v })}
                  options={valueOptions(c.field, owners)}
                  placeholder="Select a value"
                />
              ) : (
                <input
                  aria-label="Value"
                  value={c.value}
                  onChange={(e) => update(idx, { value: e.target.value })}
                  placeholder="Enter a value"
                  className="w-full rounded-md border bg-card px-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring/50"
                />
              )}
            </div>
            <button
              type="button"
              aria-label="Remove condition"
              onClick={() => remove(idx)}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-base text-muted-foreground transition-[color,background-color,scale] duration-150 ease-out hover:bg-accent hover:text-foreground active:scale-[0.96] motion-reduce:transition-colors"
            >
              &times;
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={() => setRows((prev) => [...prev, blankRow()])}
        aria-label="Add condition"
        className="mt-2 text-sm font-medium text-primary hover:underline"
      >
        + Add condition
      </button>
    </fieldset>
  );
}
