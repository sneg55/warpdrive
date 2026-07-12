"use client";

import { Button } from "@/components/ui/Button";
import { STRINGS } from "@/constants/strings";
import type { InboxFilter } from "./emailReads";
import { InboxAttributeFilters } from "./InboxAttributeFilters";
import type { ThreadFolder } from "./ThreadRow";
import type { AttributeFilterState } from "./threadAttributeFilter";

// Toolbar Refresh control label (A1). Local constant, no magic string.
const REFRESH_LABEL = "Refresh";

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
}

// The per-folder filter/search toolbar (D2). Pipedrive keeps a toolbar in every folder; Warpdrive
// previously showed it only on the Inbox, leaving Sent/Archive with an empty header. The Inbox gets
// the full row (match/needs-linking tabs + follow-up/label/quick filters + Refresh). Sent/Archive
// get a Refresh-only row: their reads do not project unread/attachment, so the attribute + quick
// filters would wrongly hide every row (see ThreadList's filterByAttributes note). "linked" is
// chrome-less and renders no toolbar.
export function ThreadListToolbar({
  folder,
  filter,
  onFilterChange,
  attrFilter,
  onAttrFilterChange,
  onRefresh,
}: ThreadListToolbarProps): React.ReactNode {
  if (folder === "linked") return null;

  if (folder !== "inbox") {
    return (
      <div className="flex items-center border-b p-2">
        <div className="ml-auto">
          <Button variant="outline" size="sm" onClick={onRefresh}>
            {REFRESH_LABEL}
          </Button>
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
        <Button variant="outline" size="sm" onClick={onRefresh}>
          {REFRESH_LABEL}
        </Button>
      </div>
    </div>
  );
}
