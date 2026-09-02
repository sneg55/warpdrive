"use client";
import { Archive, Ellipsis, Inbox } from "lucide-react";
import type React from "react";
import { ColumnsMenu } from "@/components/data-table/ColumnsMenu";
import type { LeadNextActivityBucket } from "../schemas";
import { AddLeadButton } from "./AddLeadButton";
import type { LeadColumn } from "./columns";
import { LeadFilters, type OwnerFilter } from "./LeadFilters";
import { POP_ITEM, PopMenu } from "./PopMenu";

type Filter = "inbox" | "archived";

export interface LeadsActionBarProps {
  filter: Filter;
  onFilter: (f: Filter) => void;
  count: number;
  baseCurrency?: string;
  // Gates the "Import leads" link in the add-lead menu (data.import permission).
  canImport: boolean;
  onCreated: () => void;
  // Filter state (all server-side; owner filtering is always by id, see LeadFilters).
  labelKeys: string[];
  onLabelKeys: (keys: string[]) => void;
  nextActivity: LeadNextActivityBucket | null;
  onNextActivity: (b: LeadNextActivityBucket | null) => void;
  owner: OwnerFilter;
  // Column show/hide + drag-reorder.
  catalog: readonly LeadColumn[];
  order: readonly string[];
  visibleKeys: ReadonlySet<string>;
  onToggleColumn: (key: string) => void;
  onReorderColumn: (from: string, to: string) => void;
  // Export the current filtered/sorted rows to CSV (client-side).
  onExport: () => void;
  // Inline ad-hoc condition builder, rendered alongside the fixed-chip LeadFilters (additive).
  filterBuilder?: React.ReactNode;
}

const TOGGLE = "px-2 py-1.5 text-muted-foreground hover:bg-accent";
const TOGGLE_ON = "bg-accent text-foreground";

function ToggleIcon({
  active,
  label,
  onClick,
  children,
  rounded,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  rounded: string;
}): React.ReactNode {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={`${TOGGLE} ${rounded} ${active ? TOGGLE_ON : ""}`}
    >
      {children}
    </button>
  );
}

// Full-width action bar (replaces the old left sub-rail). Inbox/Archive icon group, add-lead split
// button, counter, filters, column cog, and a more-actions menu with CSV export.
export function LeadsActionBar(props: LeadsActionBarProps): React.ReactNode {
  const { filter, onFilter, count } = props;
  return (
    <div className="mb-3 flex flex-wrap items-center gap-3">
      <div className="inline-flex overflow-hidden rounded-md border">
        <ToggleIcon
          active={filter === "inbox"}
          label="Inbox"
          onClick={() => onFilter("inbox")}
          rounded="rounded-l-md"
        >
          <Inbox aria-hidden="true" className="h-4 w-4" />
        </ToggleIcon>
        <ToggleIcon
          active={filter === "archived"}
          label="Archive"
          onClick={() => onFilter("archived")}
          rounded="rounded-r-md border-l"
        >
          <Archive aria-hidden="true" className="h-4 w-4" />
        </ToggleIcon>
      </div>

      <AddLeadButton
        baseCurrency={props.baseCurrency}
        canImport={props.canImport}
        onCreated={props.onCreated}
      />

      <span className="text-sm tabular-nums text-muted-foreground">
        {count} {count === 1 ? "lead" : "leads"}
      </span>

      <div className="ml-auto flex items-center gap-2">
        {props.filterBuilder}
        <LeadFilters
          labelKeys={props.labelKeys}
          onLabelKeys={props.onLabelKeys}
          nextActivity={props.nextActivity}
          onNextActivity={props.onNextActivity}
          owner={props.owner}
        />
        <ColumnsMenu
          catalog={props.catalog}
          order={props.order}
          visibleKeys={props.visibleKeys}
          onToggle={props.onToggleColumn}
          onReorder={props.onReorderColumn}
        />
        <PopMenu
          triggerLabel="More actions"
          triggerClassName="rounded-md border p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          align="right"
          trigger={<Ellipsis aria-hidden="true" className="h-4 w-4" />}
        >
          {(close) => (
            <button
              type="button"
              role="menuitem"
              className={POP_ITEM}
              onClick={() => {
                close();
                props.onExport();
              }}
            >
              Export leads
            </button>
          )}
        </PopMenu>
      </div>
    </div>
  );
}
