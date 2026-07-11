import { isSourceChannelKey } from "@/constants/sourceChannels";
import { orNull, parseMoneyValue } from "@/utils/entityFormFields";
import type { LeadCreateInput } from "./schemas";

export type ParseLeadResult = { ok: true; input: LeadCreateInput } | { ok: false; error: string };

export interface NewLeadFields {
  title: string;
  value: string;
  personId?: string | null;
  orgId?: string | null;
  labels?: string[];
  sourceChannel?: string | null;
  sourceChannelId?: string | null;
  expectedCloseDate?: string | null;
  ownerId?: string | null;
  visibilityGroupId?: string | null;
}

// Validate the Add lead form into a LeadCreateInput. Trust-boundary fields (visibility) are derived
// server-side; ownerId is honored server-side only for actors with deal.changeOwner.
export function parseNewLead(fields: NewLeadFields): ParseLeadResult {
  const title = fields.title.trim();
  if (title === "") return { ok: false, error: "Title is required" };

  const money = parseMoneyValue(fields.value);
  if (!money.ok) return money;
  // Labels are user-managed catalog names now (not a fixed key set), so accept any provided value
  // and just dedupe.
  const labels = [...new Set(fields.labels ?? [])];
  const channelRaw = orNull(fields.sourceChannel);
  const sourceChannel = channelRaw !== null && isSourceChannelKey(channelRaw) ? channelRaw : null;
  const ownerId = orNull(fields.ownerId);
  const visibilityGroupId = orNull(fields.visibilityGroupId);

  return {
    ok: true,
    input: {
      title,
      value: money.value,
      personId: orNull(fields.personId),
      orgId: orNull(fields.orgId),
      expectedCloseDate: orNull(fields.expectedCloseDate),
      labels,
      sourceChannel,
      sourceChannelId: orNull(fields.sourceChannelId),
      sourceOrigin: "manually_created",
      ...(ownerId !== null ? { ownerId } : {}),
      ...(visibilityGroupId !== null ? { visibilityGroupId } : {}),
    },
  };
}
