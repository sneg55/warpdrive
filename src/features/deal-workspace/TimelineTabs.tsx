import type React from "react";

export type TimelineView = "focus" | "history";

interface TimelineTabsProps {
  view: TimelineView;
  onView: (v: TimelineView) => void;
  children: React.ReactNode;
}

const VIEWS: { key: TimelineView; label: string }[] = [
  { key: "focus", label: "Focus" },
  { key: "history", label: "History" },
];

// Focus vs History switch (Pipedrive parity): Focus surfaces what still needs
// action, History is the read-only log. Sits above whatever the caller renders
// for the active view (the History side nests its own per-type filter tabs).
export function TimelineTabs({ view, onView, children }: TimelineTabsProps): React.ReactNode {
  return (
    <div>
      <div role="tablist" aria-label="Timeline view" className="mb-3 flex gap-1">
        {VIEWS.map((v) => (
          <button
            key={v.key}
            type="button"
            role="tab"
            aria-selected={view === v.key}
            onClick={() => onView(v.key)}
            className={
              view === v.key
                ? "rounded-md bg-primary/10 px-2.5 py-1 text-sm font-medium text-primary"
                : "rounded-md px-2.5 py-1 text-sm text-muted-foreground hover:bg-accent/50 hover:text-foreground"
            }
          >
            {v.label}
          </button>
        ))}
      </div>
      {children}
    </div>
  );
}
