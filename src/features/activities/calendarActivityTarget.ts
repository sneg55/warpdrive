import { type ActivityRowTarget, activityRowTarget } from "./activityRowTarget";
import type { CalendarActivity } from "./calendar";

// Route a calendar chip exactly the way the Activities list routes a row, so the same activity
// opens the same thing in both views. The parent-name fields are optional on CalendarActivity (the
// history-card builders do not select them); an unknown name is treated as no name, which is also
// how a soft-deleted parent reads, so neither can produce a link to a record that 404s.
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
