"use client";
import { Filter } from "lucide-react";
import type React from "react";
import { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/Popover";
import {
  type ConditionFieldOption,
  type ConditionRow,
  ConditionRows,
  type RawCondition,
} from "./ConditionRows";

export type {
  ConditionFieldOption,
  ConditionRow,
  ConditionValueInput,
  RawCondition,
} from "./ConditionRows";

interface ConditionRowsBuilderProps {
  fields: readonly ConditionFieldOption[];
  opLabels: Record<string, string>;
  supportsCombinator?: boolean;
  onApply: (rows: RawCondition[], combinator: "and" | "or") => void;
  onClear: () => void;
  activeCount: number;
  appliedRows?: readonly RawCondition[];
  appliedCombinator?: "and" | "or";
}

export function ConditionRowsBuilder({
  fields,
  opLabels,
  supportsCombinator = true,
  onApply,
  onClear,
  activeCount,
  appliedRows = [],
  appliedCombinator = "and",
}: ConditionRowsBuilderProps): React.ReactNode {
  const seed = (): ConditionRow[] => appliedRows.map((r) => ({ ...r, id: crypto.randomUUID() }));
  const [open, setOpen] = useState(false);
  const [combinator, setCombinator] = useState<"and" | "or">(appliedCombinator);
  const [rows, setRows] = useState<ConditionRow[]>(seed);

  function openChange(next: boolean): void {
    if (next) {
      setRows(seed());
      setCombinator(appliedCombinator);
    }
    setOpen(next);
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
    <Popover open={open} onOpenChange={openChange}>
      <PopoverTrigger
        aria-label="Filter"
        className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <Filter aria-hidden="true" className="h-4 w-4" />
        Filter
        {activeCount > 0 ? (
          <span className="ml-0.5 rounded-full bg-primary px-1.5 text-xs text-primary-foreground tabular-nums">
            {activeCount}
          </span>
        ) : null}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[36rem] space-y-2 p-2 text-sm">
        <ConditionRows
          fields={fields}
          opLabels={opLabels}
          rows={rows}
          onRowsChange={setRows}
          supportsCombinator={supportsCombinator}
          combinator={combinator}
          onCombinatorChange={setCombinator}
        />

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
