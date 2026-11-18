"use client";

import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { STRINGS } from "@/constants/strings";
import type { InboxFilter } from "./emailReads";
import { InboxAttributeFilters } from "./InboxAttributeFilters";
import type { ThreadFolder } from "./ThreadRow";
import type { AttributeFilterState } from "./threadAttributeFilter";

const FILTERS: { key: InboxFilter; label: string }[] = [
  { key: "all", label: STRINGS.inbox.filterAll },
  { key: "unmatched", label: STRINGS.inbox.filterUnmatched },
  { key: "needs_linking", label: STRINGS.inbox.filterNeedsLinking },
];

interface ThreadListToolbarProps {
  folder: ThreadFolder;
  filter: InboxFilter;
  onFilterChange: (filter: InboxFilter) => void;
  attrFilter: AttributeFilterState;
  onAttrFilterChange: (next: AttributeFilterState) => void;
  onRefresh: () => void;
  refreshing?: boolean;
}

function RefreshButton({
  onRefresh,
  refreshing,
}: {
  onRefresh: () => void;
  refreshing: boolean;
}): React.ReactNode {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onRefresh}
      disabled={refreshing}
      aria-busy={refreshing}
    >
      {refreshing && (
        <LoaderCircle
          aria-hidden="true"
          className="h-3.5 w-3.5 animate-spin motion-reduce:hidden"
        />
      )}
      {refreshing ? STRINGS.inbox.refreshing : STRINGS.inbox.refresh}
    </Button>
  );
}

export function ThreadListToolbar({
  folder,
  filter,
  onFilterChange,
  attrFilter,
  onAttrFilterChange,
  onRefresh,
  refreshing = false,
}: ThreadListToolbarProps): React.ReactNode {
  if (folder === "linked") return null;

  if (folder !== "inbox") {
    return (
      <div className="flex items-center border-b p-2">
        <div className="ml-auto">
          <RefreshButton onRefresh={onRefresh} refreshing={refreshing} />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2 border-b p-2">
      <nav aria-label="inbox filters" className="flex gap-1">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            aria-pressed={filter === f.key}
            onClick={() => onFilterChange(f.key)}
            className={
              filter === f.key
                ? "rounded bg-accent px-3 py-1 text-sm font-medium text-accent-foreground transition-transform active:scale-[0.96]"
                : "rounded px-3 py-1 text-sm text-muted-foreground transition-transform hover:bg-accent/60 active:scale-[0.96]"
            }
          >
            {f.label}
          </button>
        ))}
      </nav>
      <div className="ml-auto flex items-center gap-2">
        <InboxAttributeFilters
          value={attrFilter}
          onChange={onAttrFilterChange}
          quickFilter={filter}
          onQuickFilterChange={onFilterChange}
        />
        <RefreshButton onRefresh={onRefresh} refreshing={refreshing} />
      </div>
    </div>
  );
}
