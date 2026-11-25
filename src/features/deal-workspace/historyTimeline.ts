import { BREVO_HISTORY_ID_PREFIX, BREVO_TIMELINE_LIMIT } from "@/constants/brevo";
import { CHANGE_FIELD_STAGE_ID } from "@/constants/changeLogFields";
import { type CommentableEntityType, isCommentableEntityType } from "@/constants/comments";
import { INTERCOM_HISTORY_ID_PREFIX } from "@/constants/intercom";
import type { CalendarActivity } from "@/features/activities/calendar";
import type { MarketingCampaignItem, MarketingCampaignList } from "@/features/brevo/types";
import type { ChangeLogEntry } from "@/features/collaboration/changeLog";
import type { DraftSummary } from "@/features/email/draftRepo";
import type { EmailTimelineMessage } from "@/features/email/entityMessageReads";
import type { SupportConversationSummary, SupportScope } from "@/features/intercom/supportTypes";
import { formatChangeLabel, formatValue } from "./changeLabel";

export { formatChangeLabel } from "./changeLabel";

export type HistoryItem =
  | { kind: "created"; id: string; at: Date; actorName: string | null }
  | { kind: "activity"; id: string; at: Date; activity: CalendarActivity }
  | {
      kind: "note";
      id: string;
      at: Date;
      body: string;
      pinned: boolean;
      actorName: string | null;
      entityType?: CommentableEntityType;
      entityId?: string;
    }
  | { kind: "event"; id: string; at: Date; label: string; actorName: string | null }
  | { kind: "email"; id: string; at: Date; message: EmailTimelineMessage }
  | { kind: "emailDraft"; id: string; at: Date; draft: DraftSummary }
  | {
      kind: "supportConversation";
      id: string;
      at: Date;
      conversation: SupportConversationSummary;
      scope: SupportScope;
    }
  | {
      kind: "marketingCampaign";
      id: string;
      at: Date;
      campaign: MarketingCampaignItem;
      scope: SupportScope;
    }
  | { kind: "marketingTruncated"; id: string; at: Date; limit: number };

export interface NoteItem {
  id: string;
  body: string;
  createdAt: Date;
  entityType?: string;
  entityId?: string;
  actorName?: string | null;
  pinned?: boolean;
}

export interface CreatedAnchor {
  createdAt: Date;
  actorName: string | null;
}

function toChangeItem(c: ChangeLogEntry): HistoryItem {
  const label =
    c.field === CHANGE_FIELD_STAGE_ID
      ? `Stage: ${formatValue(c.oldValue)} → ${formatValue(c.newValue)}`
      : formatChangeLabel(c);
  return {
    kind: "event",
    id: c.id,
    at: c.createdAt,
    label,
    actorName: c.actorName,
  };
}

export function buildHistoryTimeline(
  activities: CalendarActivity[],
  changelog: ChangeLogEntry[],
  notes: NoteItem[] = [],
  created?: CreatedAnchor,
): HistoryItem[] {
  const items: HistoryItem[] = [
    ...activities.map(
      (a): HistoryItem => ({ kind: "activity", id: a.id, at: a.dueAt, activity: a }),
    ),
    ...notes.map(
      (n): HistoryItem => ({
        kind: "note",
        id: n.id,
        at: n.createdAt,
        body: n.body,
        pinned: n.pinned ?? false,
        actorName: n.actorName ?? null,
        entityType: isCommentableEntityType(n.entityType) ? n.entityType : undefined,
        entityId: n.entityId,
      }),
    ),
    ...changelog.map(toChangeItem),
  ];
  if (created !== undefined) {
    items.push({
      kind: "created",
      id: "deal-created",
      at: created.createdAt,
      actorName: created.actorName,
    });
  }
  return items.sort((a, b) => b.at.getTime() - a.at.getTime());
}

export function partitionFocusHistory(items: HistoryItem[]): {
  pinned: HistoryItem[];
  focus: HistoryItem[];
  history: HistoryItem[];
} {
  const pinned: HistoryItem[] = [];
  const focus: HistoryItem[] = [];
  const history: HistoryItem[] = [];
  for (const item of items) {
    if (item.kind === "note" && item.pinned) pinned.push(item);
    else if (item.kind === "activity" && item.activity.done === false) focus.push(item);
    else history.push(item);
  }
  return { pinned, focus, history };
}

export function mergeEmailItems(
  items: HistoryItem[],
  emails: EmailTimelineMessage[],
): HistoryItem[] {
  if (emails.length === 0) return items;
  const emailItems: HistoryItem[] = emails.map((m) => ({
    kind: "email",
    id: m.messageId,
    at: new Date(m.sentAt ?? m.createdAt),
    message: m,
  }));
  return [...items, ...emailItems].sort((a, b) => b.at.getTime() - a.at.getTime());
}

export function mergeDraftItems(items: HistoryItem[], drafts: DraftSummary[]): HistoryItem[] {
  if (drafts.length === 0) return items;
  const draftItems: HistoryItem[] = drafts.map((d) => ({
    kind: "emailDraft",
    id: d.id,
    at: new Date(d.updatedAt),
    draft: d,
  }));
  return [...items, ...draftItems].sort((a, b) => b.at.getTime() - a.at.getTime());
}

export function mergeSupportItems(
  items: HistoryItem[],
  conversations: SupportConversationSummary[],
  scope: SupportScope,
): HistoryItem[] {
  if (conversations.length === 0) return items;
  const supportItems: HistoryItem[] = conversations.map((c) => ({
    kind: "supportConversation",
    id: `${INTERCOM_HISTORY_ID_PREFIX}${c.id}`,
    at: new Date(c.lastPartAt),
    conversation: c,
    scope,
  }));
  return [...items, ...supportItems].sort((a, b) => b.at.getTime() - a.at.getTime());
}

const BREVO_TRUNCATED_ID = `${BREVO_HISTORY_ID_PREFIX}truncated`;

function campaignHistoryId(c: MarketingCampaignItem): string {
  return `${BREVO_HISTORY_ID_PREFIX}${c.campaignId}:${c.recipientPersonId}:${c.recipientEmail}`;
}

export function mergeMarketingItems(
  items: HistoryItem[],
  campaigns: MarketingCampaignList,
  scope: SupportScope,
): HistoryItem[] {
  if (campaigns.items.length === 0) return items;
  const campaignItems: HistoryItem[] = campaigns.items.map((c) => ({
    kind: "marketingCampaign",
    id: campaignHistoryId(c),
    at: new Date(c.at),
    campaign: c,
    scope,
  }));
  const oldest = Math.min(...campaignItems.map((i) => i.at.getTime()));
  const notice: HistoryItem[] = campaigns.truncated
    ? [
        {
          kind: "marketingTruncated",
          id: BREVO_TRUNCATED_ID,
          at: new Date(oldest - 1),
          limit: BREVO_TIMELINE_LIMIT,
        },
      ]
    : [];
  return [...items, ...campaignItems, ...notice].sort((a, b) => b.at.getTime() - a.at.getTime());
}
