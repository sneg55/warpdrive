"use client";
import type React from "react";
import { Input } from "@/components/ui/Input";
import { MultiCombobox } from "@/components/ui/MultiCombobox";
import { Select, type SelectOption } from "@/components/ui/Select";
import { DateConditionValue } from "./DateConditionValue";
import { type RowValue, rowValueList, singleRowValue } from "./rowValue";

// Value-input shape for a field: a plain text/number/date control, a branded Select, or a
// multi-select for a field that means "is any of" (labels). Keeping options caller-supplied lets
// the rows stay presentational (no trpc) so contacts, deals, and leads can all share them.
export type ConditionValueInput =
  | { kind: "text" | "number" | "date" }
  | { kind: "select"; options: SelectOption[] }
  | { kind: "multiselect"; options: SelectOption[] };

interface ConditionValueProps {
  input: ConditionValueInput | undefined;
  ariaLabel: string;
  value: RowValue;
  onChange: (v: RowValue) => void;
}

// The row value control, sized to fill its slot. Design-system only: Select, MultiCombobox,
// DatePicker, or Input; never a native <select>/<input type="date">.
export function ConditionValue({
  input,
  ariaLabel,
  value,
  onChange,
}: ConditionValueProps): React.ReactNode {
  if (input?.kind === "multiselect") {
    return (
      <MultiCombobox
        ariaLabel={ariaLabel}
        values={rowValueList(value)}
        onChange={onChange}
        placeholder="Select"
        options={input.options}
      />
    );
  }
  if (input?.kind === "select") {
    return (
      <Select
        ariaLabel={ariaLabel}
        value={singleRowValue(value)}
        onChange={onChange}
        placeholder="Select"
        options={input.options}
      />
    );
  }
  if (input?.kind === "date") {
    return (
      <DateConditionValue ariaLabel={ariaLabel} value={singleRowValue(value)} onChange={onChange} />
    );
  }
  return (
    <Input
      aria-label={ariaLabel}
      type={input?.kind === "number" ? "number" : "text"}
      value={singleRowValue(value)}
      onChange={(e) => onChange(e.currentTarget.value)}
      className="w-full px-2 py-1"
      placeholder="Value"
    />
  );
}
