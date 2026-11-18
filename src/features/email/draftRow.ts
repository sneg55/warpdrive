import type { EmailVisibility } from "./threadVisibility";

export interface DraftSummary {
  id: string;
  subject: string | null;
  bodyHtml: string | null;
  toEmails: string[];
  ccEmails: string[];
  threadId: string | null;
  accountId: string;
  visibility: EmailVisibility;
  linkDealId: string | null;
  linkPersonId: string | null;
  updatedAt: string;
}

export interface DraftRow {
  id: string;
  subject: string | null;
  body_html: string | null;
  to_emails: unknown;
  cc_emails: unknown;
  thread_id: string | null;
  account_id: string;
  visibility: EmailVisibility;
  link_deal_id: string | null;
  link_person_id: string | null;
  updated_at: string;
}

function asStrings(v: unknown): string[] {
  return Array.isArray(v) ? (v as string[]) : [];
}

export function toDraftSummary(r: DraftRow): DraftSummary {
  return {
    id: r.id,
    subject: r.subject,
    bodyHtml: r.body_html,
    toEmails: asStrings(r.to_emails),
    ccEmails: asStrings(r.cc_emails),
    threadId: r.thread_id,
    accountId: r.account_id,
    visibility: r.visibility,
    linkDealId: r.link_deal_id,
    linkPersonId: r.link_person_id,
    updatedAt: r.updated_at,
  };
}

export const DRAFT_COLUMNS =
  "d.id, d.subject, d.body_html, d.to_emails, d.cc_emails, d.thread_id, d.account_id, " +
  "d.visibility, d.link_deal_id, d.link_person_id, d.updated_at";
