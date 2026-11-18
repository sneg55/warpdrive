import { AGENTIC_FOLDER } from "@/constants/email";
import { ERROR_IDS } from "@/constants/errorIds";
import { ok } from "@/types/result";
import type { ReplyThreadHeaders } from "../replyHeaders";
import { bodySnippet } from "../snippetText";
import type { AgenticClient } from "./agenticClient";
import { agenticParse, agenticThreadId } from "./agenticParse";
import type { ChangeEmail } from "./agenticSchemas";
import { agenticSendBody, agenticSendOutcome, bareMessageId } from "./agenticSend";
import type { MailProvider } from "./types";

const bracketed = (id: string): string => `<${bareMessageId(id)}>`;

function storedReferences(raw: string | null): string[] {
  if (raw === null) return [];
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(json)) return [];
  return json.filter((r): r is string => typeof r === "string" && bareMessageId(r) !== "");
}

function replyThreading(parent: ChangeEmail): ReplyThreadHeaders {
  if (parent.message_id === null || bareMessageId(parent.message_id) === "") return {};
  const messageId = bracketed(parent.message_id);
  const chain = storedReferences(parent.email_references).map(bracketed);
  if (chain.at(-1) !== messageId) chain.push(messageId);
  return { inReplyTo: messageId, references: chain.join(" ") };
}

export function agenticProvider(client: AgenticClient, mailbox: string): MailProvider {
  return {
    kind: "agentic_inbox",
    idempotentSend: true,
    gmail: null,
    agentic: client,

    async fetchParsed({ id, signal }) {
      const fetched = await client.getEmail({ id, signal });
      signal.throwIfAborted();
      if (!fetched.ok) {
        return fetched.error.id === ERROR_IDS.AINBOX_MESSAGE_NOT_FOUND ? ok(null) : fetched;
      }
      if (fetched.value.folder === AGENTIC_FOLDER.draft) return ok(null);
      return ok(agenticParse(fetched.value, mailbox));
    },

    async replyHeaders({ parentProviderMessageId, signal }) {
      const parent = await client.getEmail({ id: parentProviderMessageId, signal });
      signal.throwIfAborted();
      return parent.ok ? replyThreading(parent.value) : {};
    },

    async send({ message, signal }) {
      const sent = await client.send({ body: agenticSendBody(message), signal });
      signal.throwIfAborted();
      return ok(agenticSendOutcome(sent, Date.now()));
    },

    async sentCopy({ providerMessageId, signal }) {
      const fetched = await client.getEmail({ id: providerMessageId, signal });
      signal.throwIfAborted();
      if (!fetched.ok) return fetched;
      return ok({
        threadId: agenticThreadId(fetched.value),
        snippet: bodySnippet(fetched.value.body),
      });
    },

    async getAttachment({ messageId, attachmentId, signal }) {
      const bytes = await client.getAttachment({ emailId: messageId, attachmentId, signal });
      signal.throwIfAborted();
      if (!bytes.ok) return bytes;
      return ok({ dataBase64: Buffer.from(bytes.value).toString("base64url") });
    },
  };
}
