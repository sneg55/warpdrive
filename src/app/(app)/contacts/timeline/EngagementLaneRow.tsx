import Link from "next/link";
import type React from "react";
import { ActivityTypeIcon } from "@/features/activities/ActivityTypeIcon";
import type { ContactEntity, EngagementLane } from "@/features/contacts/engagementTimeline";
import { cn } from "@/lib/utils";

function contactHref(entity: ContactEntity, id: string): string {
  return entity === "person" ? `/contacts/people/${id}` : `/contacts/orgs/${id}`;
}

// One contact's lane: a leading name/link cell, then one cell per month holding that month's
// activity markers (an ActivityTypeIcon per activity, labelled by its subject). A month with no
// activity for this contact renders an empty cell so the columns stay aligned to the axis.
export function EngagementLaneRow({
  lane,
  months,
  entity,
}: {
  lane: EngagementLane;
  months: string[];
  entity: ContactEntity;
}): React.ReactNode {
  return (
    <div className="contents">
      <div className="flex items-center gap-2 border-b px-3 py-2 text-sm">
        <Link href={contactHref(entity, lane.contactId)} className="font-medium hover:underline">
          {lane.contactName}
        </Link>
        <span className="text-xs text-muted-foreground">{lane.total}</span>
      </div>
      {months.map((key) => {
        const markers = lane.byMonth[key] ?? [];
        return (
          <div key={key} className="flex flex-wrap items-center gap-1 border-b border-l px-3 py-2">
            {markers.map((m) => (
              <span
                key={m.id}
                role="img"
                aria-label={m.subject}
                title={m.subject}
                className={cn(
                  "inline-flex h-6 w-6 items-center justify-center rounded-full",
                  m.done ? "bg-muted text-muted-foreground" : "bg-accent text-accent-foreground",
                )}
              >
                <ActivityTypeIcon typeKey={m.typeKey} />
              </span>
            ))}
          </div>
        );
      })}
    </div>
  );
}
