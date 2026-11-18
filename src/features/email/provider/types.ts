import type { AppError } from "@/constants/errorIds";
import type { Result } from "@/types/result";
import type { GmailClient } from "../gmailClient";
import type { MimeAttachment } from "../mime";
import type { ParsedMessage } from "../mimeParse";
import type { ReplyThreadHeaders } from "../replyHeaders";
import type { AgenticClient } from "./agenticClient";

export type ProviderKind = "gmail" | "agentic_inbox";

export interface OutboundMessage {
  from: string;
  fromName: string | null;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  html: string | null;
  text: string | null;
  messageIdHeader: string;
  inReplyTo?: string;
  references?: string;
  providerThreadId: string | null;
  attachments: MimeAttachment[];
  attemptId: string;
}

export type ProviderSendOutcome =
  | { kind: "sent"; providerMessageId: string; providerThreadId: string }
  | { kind: "rejected"; error: AppError }
  | { kind: "unknown"; error: AppError }
  | { kind: "retry_later"; notBefore: Date | null; error: AppError };

export type MailProvider = MailProviderOps &
  (
    | { kind: "gmail"; gmail: GmailClient; agentic: null }
    | { kind: "agentic_inbox"; gmail: null; agentic: AgenticClient }
  );

interface MailProviderOps {
  idempotentSend: boolean;
  fetchParsed(a: {
    id: string;
    signal: AbortSignal;
  }): Promise<Result<ParsedMessage | null, AppError>>;
  replyHeaders(a: {
    parentProviderMessageId: string;
    signal: AbortSignal;
  }): Promise<ReplyThreadHeaders>;
  send(a: {
    message: OutboundMessage;
    signal: AbortSignal;
  }): Promise<Result<ProviderSendOutcome, AppError>>;
  sentCopy(a: {
    providerMessageId: string;
    signal: AbortSignal;
  }): Promise<Result<{ threadId: string; snippet: string | null }, AppError>>;
  getAttachment(a: {
    messageId: string;
    attachmentId: string;
    signal: AbortSignal;
  }): Promise<Result<{ dataBase64: string }, AppError>>;
}
