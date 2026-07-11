import type React from "react";
import { AttributionLine } from "./AttributionLine";

// "Deal created" anchor (synthesized from deal.createdAt, decision 1). A titled
// line plus the shared attribution, matching Pipedrive's create event.
export function CreatedCard({
  at,
  actorName,
}: {
  at: Date;
  actorName: string | null;
}): React.ReactNode {
  return (
    <div className="py-0.5">
      <p className="text-sm font-medium text-foreground">Deal created</p>
      <AttributionLine at={at} actorName={actorName} />
    </div>
  );
}
