import { type ActivityRowTarget, activityRowTarget } from "./activityRowTarget";
import type { CalendarActivity } from "./calendar";

export function calendarActivityTarget(a: CalendarActivity): ActivityRowTarget {
  return activityRowTarget({
    subject: a.subject,
    dealId: a.dealId,
    dealTitle: a.dealTitle ?? null,
    leadId: a.leadId ?? null,
    leadTitle: a.leadTitle ?? null,
    personId: a.personId,
    personName: a.personName ?? null,
    orgId: a.orgId,
    orgName: a.orgName ?? null,
  });
}
