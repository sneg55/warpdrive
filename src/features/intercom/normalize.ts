import {
  INTERCOM_SNIPPET_MAX_CHARS,
  INTERCOM_SOURCE_PART_ID_PREFIX,
  INTERCOM_SOURCE_PART_TYPE,
  INTERCOM_VISIBLE_PART_TYPES,
  NOREPLY_LOCAL_PARTS,
} from "@/constants/intercom";
import type { IntercomConversationRow, IntercomPartRow } from "@/db/schema";
import { decodeEmailSnippet } from "@/features/email/snippetText";
import type { IntercomConversation } from "./types";

export interface NormalizedConversation {
  conversation: IntercomConversationRow;
  parts: IntercomPartRow[];
}

const SECONDS_TO_MS = 1000;
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+$/;

export function matchableEmail(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  const email = raw.trim().toLowerCase();
  if (!EMAIL_SHAPE.test(email)) return null;
  const local = email.slice(0, email.indexOf("@"));
  return NOREPLY_LOCAL_PARTS.includes(local) ? null : email;
}

function hasBody(body: string | null | undefined): body is string {
  return body !== null && body !== undefined && body.trim() !== "";
}

export function htmlToSnippet(html: string): string | null {
  const text = html
    .replace(/<(br|\/p|\/div|\/li)[^>]*>/gi, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/\s+/g, " ")
    .trim();
  const decoded = decodeEmailSnippet(text) ?? "";
  if (decoded === "") return null;
  return decoded.length > INTERCOM_SNIPPET_MAX_CHARS
    ? `${decoded.slice(0, INTERCOM_SNIPPET_MAX_CHARS)}…`
    : decoded;
}

function sourcePart(c: IntercomConversation): IntercomPartRow | null {
  const s = c.source;
  if (s === null || s.redacted === true || !hasBody(s.body)) return null;
  return {
    id: `${INTERCOM_SOURCE_PART_ID_PREFIX}${c.id}`,
    conversationId: c.id,
    partType: INTERCOM_SOURCE_PART_TYPE,
    authorType: s.author?.type ?? null,
    authorName: s.author?.name ?? null,
    bodyHtml: s.body,
    createdAt: new Date(c.createdAt * SECONDS_TO_MS),
  };
}

function visibleParts(c: IntercomConversation): IntercomPartRow[] {
  return c.parts.flatMap((p) => {
    if (!INTERCOM_VISIBLE_PART_TYPES.includes(p.part_type)) return [];
    if (p.redacted === true || !hasBody(p.body)) return [];
    return [
      {
        id: p.id,
        conversationId: c.id,
        partType: p.part_type,
        authorType: p.author?.type ?? null,
        authorName: p.author?.name ?? null,
        bodyHtml: p.body,
        createdAt: new Date(p.created_at * SECONDS_TO_MS),
      },
    ];
  });
}

export function normalizeConversation(c: IntercomConversation): NormalizedConversation {
  const opening = sourcePart(c);
  const parts = [...(opening === null ? [] : [opening]), ...visibleParts(c)].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
  );
  const last = parts.at(-1);
  return {
    conversation: {
      id: c.id,
      title: c.title === null || c.title.trim() === "" ? null : c.title,
      state: c.state,
      snippet: opening === null ? null : htmlToSnippet(opening.bodyHtml),
      createdAt: new Date(c.createdAt * SECONDS_TO_MS),
      updatedAt: new Date(c.updatedAt * SECONDS_TO_MS),
      lastPartAt: last?.createdAt ?? new Date(c.createdAt * SECONDS_TO_MS),
      messageCount: parts.length,
      lastReplierName: last?.authorName ?? null,
      lastReplierType: last?.authorType ?? null,
    },
    parts,
  };
}
