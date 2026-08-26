import type { RecordPreview } from "@/features/navigation/recordPreviewStore";

// What a click on an Activities row opens. A row is a pointer at the work, not the work itself, so
// it opens the record the activity hangs off (Pipedrive opens the deal). Only an activity linked to
// nothing has its own editor left to show.
export type ActivityRowTarget =
  | { kind: "record"; href: string; preview: RecordPreview }
  | { kind: "edit" };

// The parent columns the decision reads, structural so both the list row and a calendar activity
// can be routed by the same rule. Every name comes from a deletedAt-filtered join, so a null name
// against a non-null id means the parent is soft-deleted.
export interface ActivityParentLinks {
  subject: string;
  dealId: string | null;
  dealTitle: string | null;
  leadId: string | null;
  leadTitle: string | null;
  personId: string | null;
  personName: string | null;
  orgId: string | null;
  orgName: string | null;
}

function record(id: string, name: string | null, fallback: string, href: string, subtitle: string) {
  return {
    kind: "record" as const,
    href,
    preview: { id, title: name ?? fallback, subtitle },
  };
}

export function activityRowTarget(row: ActivityParentLinks): ActivityRowTarget {
  // dealTitle comes from the deletedAt-filtered join, so a null title on a non-null dealId means
  // the deal is soft-deleted: linking to it would land on a 404 rather than a drawer.
  if (row.dealId !== null && row.dealTitle !== null) {
    return record(row.dealId, row.dealTitle, "Deal", `/deals/${row.dealId}`, row.subject);
  }
  // A lead is the other kind of primary parent (activities.lead_id, mutually exclusive with
  // deal_id), so it outranks the contacts the lead itself is linked to.
  if (row.leadId !== null && row.leadTitle !== null) {
    return record(row.leadId, row.leadTitle, "Lead", `/leads/${row.leadId}`, row.subject);
  }
  if (row.personId !== null) {
    return record(
      row.personId,
      row.personName,
      "Contact",
      `/contacts/people/${row.personId}`,
      row.subject,
    );
  }
  if (row.orgId !== null) {
    return record(
      row.orgId,
      row.orgName,
      "Organization",
      `/contacts/orgs/${row.orgId}`,
      row.subject,
    );
  }
  return { kind: "edit" };
}
