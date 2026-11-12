import { SUPPORT_STRINGS } from "@/constants/supportStrings";
import { escapeHtml } from "@/features/email/plainText";
import type { SupportConversationPart } from "./supportTypes";

const PART_STYLE = "margin:0 0 16px;padding-bottom:12px;border-bottom:1px solid #e5e7eb";
const HEADER_STYLE = "margin:0 0 6px;font-size:12px;color:#57606a";

export function buildConversationHtml(
  parts: SupportConversationPart[],
  formatDate: (iso: string) => string,
): string {
  return parts
    .map((p) => {
      const author = escapeHtml(p.authorName ?? SUPPORT_STRINGS.unknownAuthor);
      const when = escapeHtml(formatDate(p.createdAt));
      return (
        `<section style="${PART_STYLE}"><p style="${HEADER_STYLE}"><strong>${author}</strong>` +
        ` · ${when}</p>${p.bodyHtml}</section>`
      );
    })
    .join("");
}
