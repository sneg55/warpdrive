import type { RecordPreview } from "@/features/navigation/recordPreviewStore";

export type ActivityRowTarget =
  | { kind: "record"; href: string; preview: RecordPreview }
  | { kind: "edit" };

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
  if (row.dealId !== null && row.dealTitle !== null) {
    return record(row.dealId, row.dealTitle, "Deal", `/deals/${row.dealId}`, row.subject);
  }
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
