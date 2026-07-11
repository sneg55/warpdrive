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

// Match a URL or a bare email in already-escaped text. URL alternative comes first so an address
// inside a URL is consumed as part of the URL, not re-linked. `[^\s<]` stops a URL at whitespace or
// the start of any inserted markup.
const TOKEN_RE = /(\bhttps?:\/\/[^\s<]+)|([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;

// Trailing punctuation that is almost always sentence punctuation, not part of the URL.
const URL_TRAILING = /[.,;:!?)\]]+$/;

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

function linkify(escaped: string): string {
  return escaped.replace(TOKEN_RE, (_m, url: string | undefined, email: string | undefined) => {
    if (typeof url === "string" && url.length > 0) {
      const trailing = url.match(URL_TRAILING)?.[0] ?? "";
      const clean = trailing.length > 0 ? url.slice(0, url.length - trailing.length) : url;
      return `<a href="${clean}" target="_blank" rel="noopener noreferrer">${clean}</a>${trailing}`;
    }
    if (typeof email === "string" && email.length > 0) {
      return `<a href="mailto:${email}">${email}</a>`;
    }
    return _m;
  });
}

/**
 * Convert an untrusted plain-text email body into safe HTML: escaped, with URLs and email
 * addresses auto-linked and newlines preserved as <br>. Returns "" for empty input.
 */
export function plainTextToSafeHtml(text: string): string {
  if (text.trim() === "") return "";
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  return linkify(escapeHtml(normalized)).replace(/\n/g, "<br>");
}
