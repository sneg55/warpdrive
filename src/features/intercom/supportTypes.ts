export interface SupportConversationSummary {
  id: string;
  title: string | null;
  snippet: string | null;
  state: string;
  messageCount: number;
  lastReplierName: string | null;
  lastReplierType: string | null;
  lastPartAt: string;
}

export type SupportScope =
  | { kind: "person"; personId: string }
  | { kind: "deal"; dealId: string }
  | { kind: "lead"; leadId: string };

export interface SupportConversationPart {
  id: string;
  partType: string;
  authorType: string | null;
  authorName: string | null;
  createdAt: string;
  bodyHtml: string;
}
