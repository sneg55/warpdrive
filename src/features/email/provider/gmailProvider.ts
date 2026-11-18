import { GMAIL_DRAFT_LABEL } from "@/constants/email";
import type { AppError } from "@/constants/errorIds";
import { ok } from "@/types/result";
import type { GmailClient } from "../gmailClient";
import { messageGoneFromMailbox } from "../messageGone";
import { buildMime, toRawBase64 } from "../mime";
import { parseGmailMessage } from "../mimeParse";
import { replyThreadHeaders } from "../replyHeaders";
import type { MailProvider, OutboundMessage } from "./types";

function isDefiniteRejection(error: AppError): boolean {
  const status = error.context?.status;
  return typeof status === "number" && status >= 400 && status < 500;
}

function mimeFor(message: OutboundMessage): string {
  return buildMime({
    from: message.from,
    to: message.to,
    cc: message.cc,
    bcc: message.bcc,
    subject: message.subject,
    html: message.html ?? "",
    text: message.text ?? undefined,
    messageId: message.messageIdHeader,
    inReplyTo: message.inReplyTo,
    references: message.references,
    attachments: message.attachments.length > 0 ? message.attachments : undefined,
  });
}

export function gmailProvider(client: GmailClient): MailProvider {
  return {
    kind: "gmail",
    idempotentSend: false,
    gmail: client,
    agentic: null,

    async fetchParsed({ id, signal }) {
      const fetched = await client.getMessage({ id, signal });
      signal.throwIfAborted();
      if (!fetched.ok) {
        if (messageGoneFromMailbox(fetched.error)) return ok(null);
        return fetched;
      }
      if (fetched.value.labelIds.includes(GMAIL_DRAFT_LABEL)) return ok(null);
      return ok(parseGmailMessage(fetched.value));
    },

    async replyHeaders({ parentProviderMessageId, signal }) {
      const parent = await client.getMessage({ id: parentProviderMessageId, signal });
      signal.throwIfAborted();
      if (!parent.ok) return {};
      return replyThreadHeaders(parent.value);
    },

    async send({ message, signal }) {
      const sent = await client.sendRaw({
        rawBase64: toRawBase64(mimeFor(message)),
        threadId: message.providerThreadId ?? undefined,
        signal,
      });
      signal.throwIfAborted();
      if (!sent.ok) {
        return ok(
          isDefiniteRejection(sent.error)
            ? { kind: "rejected", error: sent.error }
            : { kind: "unknown", error: sent.error },
        );
      }
      return ok({
        kind: "sent",
        providerMessageId: sent.value.id,
        providerThreadId: sent.value.threadId,
      });
    },

    async sentCopy({ providerMessageId, signal }) {
      const fetched = await client.getMessage({ id: providerMessageId, signal });
      signal.throwIfAborted();
      if (!fetched.ok) return fetched;
      return ok({ threadId: fetched.value.threadId, snippet: fetched.value.snippet ?? null });
    },

    getAttachment({ messageId, attachmentId, signal }) {
      return client.getAttachment({ messageId, attachmentId, signal });
    },
  };
}
