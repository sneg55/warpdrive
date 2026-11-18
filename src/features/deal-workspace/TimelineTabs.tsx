import type React from "react";
import { PILL_TAB, Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

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

export function TimelineTabs({ view, onView, children }: TimelineTabsProps): React.ReactNode {
  return (
    <Tabs value={view} onValueChange={(v) => onView(v as TimelineView)}>
      <TabsList aria-label="Timeline view" className="mb-3 gap-1">
        {VIEWS.map((v) => (
          <TabsTrigger key={v.key} value={v.key} className={PILL_TAB}>
            {v.label}
          </TabsTrigger>
        ))}
      </TabsList>
      {children}
    </Tabs>
  );
}
