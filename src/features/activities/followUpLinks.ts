export interface FollowUpLinks {
  dealId: string | null;
  dealTitle: string | null;
  leadId: string | null;
  personId: string | null;
  personName: string | null;
  orgId: string | null;
  orgName: string | null;
}

export function followUpLinksOf(activity: {
  dealId: string | null;
  dealTitle?: string | null;
  leadId?: string | null;
  personId: string | null;
  personName?: string | null;
  orgId: string | null;
  orgName?: string | null;
}): FollowUpLinks {
  return {
    dealId: activity.dealId,
    dealTitle: activity.dealTitle ?? null,
    leadId: activity.leadId ?? null,
    personId: activity.personId,
    personName: activity.personName ?? null,
    orgId: activity.orgId,
    orgName: activity.orgName ?? null,
  };
}
