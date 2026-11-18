import { isSourceChannelKey, type SourceChannelKey } from "@/constants/sourceChannels";
import { orNull, parseMoneyValue } from "@/utils/entityFormFields";
import type { DealCreateInput } from "./schemas";

export type ParseNewDealResult =
  | { ok: true; input: DealCreateInput }
  | { ok: false; error: string };

export interface NewDealFields {
  title: string;
  stageId: string;
  value: string;
  personId?: string | null;
  orgId?: string | null;
  labels?: string[];
  sourceChannel?: string | null;
  sourceChannelId?: string | null;
  expectedCloseDate?: string | null;
  ownerId?: string | null;
}

export function parseNewDeal(fields: NewDealFields, pipelineId: string): ParseNewDealResult {
  const title = fields.title.trim();
  if (title === "") return { ok: false, error: "Title is required" };
  if (fields.stageId === "") return { ok: false, error: "Stage is required" };

  const money = parseMoneyValue(fields.value);
  if (!money.ok) return money;
  const labels = [...new Set(fields.labels ?? [])];
  const channelRaw = orNull(fields.sourceChannel);
  const sourceChannel: SourceChannelKey | null =
    channelRaw !== null && isSourceChannelKey(channelRaw) ? channelRaw : null;
  const ownerId = orNull(fields.ownerId);

  return {
    ok: true,
    input: {
      title,
      value: money.value,
      pipelineId,
      stageId: fields.stageId,
      personId: orNull(fields.personId),
      orgId: orNull(fields.orgId),
      expectedCloseDate: orNull(fields.expectedCloseDate),
      labels,
      sourceChannel,
      sourceChannelId: orNull(fields.sourceChannelId),
      ...(ownerId !== null ? { ownerId } : {}),
    },
  };
}
