import Link from "next/link";
import type React from "react";
import { Tip } from "@/components/ui/tooltip";
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
    <tr>
      <th
        scope="row"
        className="sticky left-0 z-10 border-b border-r bg-card px-3 py-2 text-left text-sm font-normal"
      >
        <div className="flex min-w-0 items-center gap-2">
          <Link
            href={contactHref(entity, lane.contactId)}
            className="min-w-0 truncate font-medium hover:underline"
          >
            {lane.contactName}
          </Link>
          <span className="shrink-0 text-xs text-muted-foreground">{lane.total}</span>
        </div>
      </th>
      {months.map((key, monthIndex) => {
        const markers = lane.byMonth[key] ?? [];
        return (
          <td
            key={key}
            className={cn("border-b px-3 py-2 align-middle", monthIndex > 0 && "border-l")}
          >
            <div className="flex min-w-0 flex-wrap items-center gap-1">
              {markers.map((m) => (
                <Tip key={m.id} label={m.subject}>
                  <span
                    role="img"
                    aria-label={m.subject}
                    className={cn(
                      "inline-flex h-6 w-6 items-center justify-center rounded-full",
                      m.done
                        ? "bg-muted text-muted-foreground"
                        : "bg-accent text-accent-foreground",
                    )}
                  >
                    <ActivityTypeIcon typeKey={m.typeKey} />
                  </span>
                </Tip>
              ))}
            </div>
          </td>
        );
      })}
    </tr>
  );
}
