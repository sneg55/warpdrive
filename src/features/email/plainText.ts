// Render a text/plain email body as safe HTML for the reader iframe.
//
// Gmail delivers many emails (transactional, notifications, mailing lists, some automated senders)
// with ONLY a text/plain part. The reader renders sanitized HTML, so a plain-text body must be
// converted, not dropped, or it shows a blank frame. Pipedrive renders plain text with line breaks
// preserved and URLs/emails auto-linked; this mirrors that.
//
// The output still passes through sanitizeInboundHtml at the call site (defense in depth), but this
// function is self-contained safe: it HTML-escapes the untrusted text FIRST, then only ever inserts
// anchors it constructs itself, so no sender markup can survive as live HTML.
import { linkifyEscapedText } from "@/features/collaboration/linkify";

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

/**
 * Convert an untrusted plain-text email body into safe HTML: escaped, with URLs and email
 * addresses auto-linked and newlines preserved as <br>. Returns "" for empty input.
 */
export function plainTextToSafeHtml(text: string): string {
  if (text.trim() === "") return "";
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  return linkifyEscapedText(escapeHtml(normalized)).replace(/\n/g, "<br>");
}

/**
 * Convert an untrusted plain-text body into paragraph HTML: blank-line-separated blocks become
 * <p>, single newlines inside a block become <br>. Used for bodies composed outside the rich-text
 * editor (the MCP draft tool), so resuming one in the composer reads as ordinary paragraphs.
 * Escaped first, exactly like plainTextToSafeHtml; no auto-linking, since an outbound body is
 * written by the sender and link markup is theirs to add.
 */
export function plainTextToParagraphHtml(text: string): string {
  if (text.trim() === "") return "";
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  return normalized
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter((block) => block !== "")
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, "<br>")}</p>`)
    .join("");
}
