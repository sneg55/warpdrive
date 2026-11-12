import type { EMAIL_ACCOUNT_STATUS } from "@/constants/email";
import type { ActorMailbox } from "./actorMailboxes";
import type { InboxFilter } from "./emailReads";
import type { ThreadFolder } from "./ThreadRow";
import type { AttributeFilterState } from "./threadAttributeFilter";
import { NO_ATTRIBUTE_FILTER } from "./threadAttributeFilter";

export interface InboxZeroInput {
  folder: ThreadFolder;
  quickFilter: InboxFilter;
  attrFilter: AttributeFilterState;
  searching: boolean;
  mailboxConnected: boolean;
  pending: boolean;
  failed: boolean;
  threadCount: number;
}

function attributeFilterActive(f: AttributeFilterState): boolean {
  return (
    f.followUp !== NO_ATTRIBUTE_FILTER.followUp ||
    f.label !== NO_ATTRIBUTE_FILTER.label ||
    f.hasAttachment !== NO_ATTRIBUTE_FILTER.hasAttachment ||
    f.unreadOnly !== NO_ATTRIBUTE_FILTER.unreadOnly ||
    f.dateRange !== NO_ATTRIBUTE_FILTER.dateRange
  );
}

export function isInboxZero(input: InboxZeroInput): boolean {
  return (
    input.folder === "inbox" &&
    input.quickFilter === "all" &&
    !attributeFilterActive(input.attrFilter) &&
    !input.searching &&
    input.mailboxConnected &&
    !input.pending &&
    !input.failed &&
    input.threadCount === 0
  );
}

const CONNECTED: (typeof EMAIL_ACCOUNT_STATUS)[number] = "connected";

export function isMailboxConnected(
  choices: readonly Pick<ActorMailbox, "id" | "kind" | "status">[],
  selected: string | undefined,
): boolean {
  if (selected === undefined) {
    return choices.some((c) => c.kind === "personal" && c.status === CONNECTED);
  }
  return choices.some((c) => c.id === selected && c.status === CONNECTED);
}
