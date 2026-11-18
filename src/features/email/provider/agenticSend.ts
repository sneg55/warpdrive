import { AppError, ERROR_IDS } from "@/constants/errorIds";
import { MILLISECONDS_PER_SECOND } from "@/constants/teamMailbox";
import type { Result } from "@/types/result";
import type { AgenticSendBody, AgenticSendResult } from "./agenticSchemas";
import type { OutboundMessage, ProviderSendOutcome } from "./types";

const DEFINITE_CLIENT_FAILURES: readonly string[] = [
  ERROR_IDS.AINBOX_AUTH_FAILED,
  ERROR_IDS.AINBOX_MAILBOX_NOT_FOUND,
];

export function bareMessageId(id: string): string {
  return id.trim().replace(/^<+/, "").replace(/>+$/, "");
}

export function agenticSendBody(message: OutboundMessage): AgenticSendBody {
  const references = message.references
    ?.split(/\s+/)
    .map(bareMessageId)
    .filter((r) => r !== "");
  return {
    to: message.to,
    from: message.from,
    subject: message.subject,
    ...(message.html === null ? {} : { html: message.html }),
    ...(message.text === null ? {} : { text: message.text }),
    ...(message.cc.length > 0 ? { cc: message.cc } : {}),
    ...(message.bcc.length > 0 ? { bcc: message.bcc } : {}),
    client_ref: message.attemptId,
    ...(message.providerThreadId === null ? {} : { thread_id: message.providerThreadId }),
    ...(message.inReplyTo === undefined ? {} : { in_reply_to: bareMessageId(message.inReplyTo) }),
    ...(references === undefined || references.length === 0 ? {} : { references }),
    ...(message.attachments.length > 0
      ? {
          attachments: message.attachments.map((a) => ({
            content: a.bytes.toString("base64"),
            filename: a.filename,
            type: a.contentType,
            disposition: "attachment",
          })),
        }
      : {}),
  };
}

export function agenticSendOutcome(
  sent: Result<AgenticSendResult, AppError>,
  nowMs: number,
): ProviderSendOutcome {
  if (!sent.ok) {
    return DEFINITE_CLIENT_FAILURES.includes(sent.error.id)
      ? { kind: "rejected", error: sent.error }
      : { kind: "unknown", error: sent.error };
  }
  const r = sent.value;
  switch (r.status) {
    case "sent":
      return { kind: "sent", providerMessageId: r.id, providerThreadId: r.thread_id ?? r.id };
    case "retry_later":
      return {
        kind: "retry_later",
        notBefore:
          r.retryAfterSeconds === null
            ? null
            : new Date(nowMs + r.retryAfterSeconds * MILLISECONDS_PER_SECOND),
        error: new AppError(
          r.reason === "temporary"
            ? ERROR_IDS.AINBOX_SEND_TEMPORARY
            : ERROR_IDS.AINBOX_SENDING_LIMIT,
          "agentic inbox asked to retry later",
          { retryAfterSeconds: r.retryAfterSeconds },
        ),
      };
    case "rejected":
      return {
        kind: "rejected",
        error: new AppError(ERROR_IDS.AINBOX_SEND_REJECTED, "agentic inbox rejected the send", {
          code: r.code,
        }),
      };
    case "unknown":
      return {
        kind: "unknown",
        error: new AppError(ERROR_IDS.AINBOX_SEND_UNKNOWN, "agentic inbox send outcome unknown"),
      };
  }
}
