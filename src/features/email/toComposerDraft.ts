import type { DraftSummary } from "./draftRepo";

export interface ComposerDraftSeed {
  id: string;
  accountId: string;
  subject: string;
  bodyHtml: string;
  to: string[];
  cc: string[];
  threadId?: string | null;
  visibility: DraftSummary["visibility"];
  linkDealId: string | null;
  linkPersonId: string | null;
}

export function toComposerDraft(d: DraftSummary): ComposerDraftSeed {
  return {
    id: d.id,
    accountId: d.accountId,
    subject: d.subject ?? "",
    bodyHtml: d.bodyHtml ?? "",
    to: d.toEmails,
    cc: d.ccEmails,
    threadId: d.threadId,
    visibility: d.visibility,
    linkDealId: d.linkDealId,
    linkPersonId: d.linkPersonId,
  };
}
