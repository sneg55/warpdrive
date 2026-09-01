import type { GmailMessage } from "./gmailSchemas";

export interface ReplyThreadHeaders {
  inReplyTo?: string;
  references?: string;
}

function header(msg: GmailMessage, name: string): string | null {
  const wanted = name.toLowerCase();
  for (const h of msg.payload?.headers ?? []) {
    if (h.name.toLowerCase() === wanted) return h.value.trim();
  }
  return null;
}

export function replyThreadHeaders(parent: GmailMessage | null): ReplyThreadHeaders {
  if (parent === null) return {};
  const messageId = header(parent, "Message-ID");
  if (messageId === null || messageId === "") return {};
  const chain = header(parent, "References") ?? header(parent, "In-Reply-To");
  const parts = chain === null || chain === "" ? [] : chain.split(/\s+/).filter((p) => p !== "");
  if (parts[parts.length - 1] !== messageId) parts.push(messageId);
  return { inReplyTo: messageId, references: parts.join(" ") };
}
