"use client";
import type React from "react";
import type { LeadNextActivityBucket } from "../schemas";
import { AddLeadButton } from "./AddLeadButton";
import { ColumnMenu } from "./ColumnMenu";
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
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
            <path d="M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zm0 12h-4a3 3 0 0 1-6 0H5V5h14v10z" />
          </svg>
        </ToggleIcon>
        <ToggleIcon
          active={filter === "archived"}
          label="Archive"
          onClick={() => onFilter("archived")}
          rounded="rounded-r-md border-l"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
            <path d="M20 3H4a1 1 0 0 0-1 1v3a1 1 0 0 0 1 1v11a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V8a1 1 0 0 0 1-1V4a1 1 0 0 0-1-1zm-6 9H10v-2h4v2zM5 6V5h14v1H5z" />
          </svg>
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
        <ColumnMenu
          order={props.order}
          visibleKeys={props.visibleKeys}
          onToggle={props.onToggleColumn}
          onReorder={props.onReorderColumn}
        />
        <PopMenu
          triggerLabel="More actions"
          triggerClassName="rounded-md border p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          align="right"
          trigger={
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
              <path d="M6 10a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm6 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm6 0a2 2 0 1 0 0 4 2 2 0 0 0 0-4z" />
            </svg>
          }
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
