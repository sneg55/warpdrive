// Email HTML sanitizer using DOMPurify (isomorphic for server + browser).
//
// Two surfaces:
//   sanitizeAuthorHtml  - templates, signatures, compose (user-authored content)
//   sanitizeInboundHtml - received email bodies (untrusted sender + tracking privacy)
//
// Security contract: DOMPurify allowlist is the enforcement boundary.
// Neither function throws on bad input; it sanitizes defensively.
import DOMPurify, {
  addHook,
  removeHook,
  sanitize,
  type UponSanitizeAttributeHookEvent,
} from "isomorphic-dompurify";

// Suppress unused-import warning: DOMPurify default is imported for its side-effects
// (initialising the isomorphic singleton). sanitize/addHook/removeHook use it internally.
void DOMPurify;

// Tags safe for both author-written and inbound email.
const BASE_TAGS = [
  "b",
  "strong",
  "i",
  "em",
  "u",
  "s",
  "p",
  "br",
  "ul",
  "ol",
  "li",
  "a",
  "img",
  "span",
  "div",
  "blockquote",
  "pre",
  "code",
] as const;

// Additional tags safe for inbound (table-heavy marketing email is common).
const INBOUND_EXTRA_TAGS = ["h1", "h2", "h3", "table", "thead", "tbody", "tr", "td", "th"] as const;

// Attributes allowed on any tag in the allowlist.
// `style` is included here so DOMPurify passes it to our uponSanitizeAttribute
// hook for per-property filtering; the hook then drops disallowed properties.
const BASE_ATTR = ["href", "src", "alt", "title", "target", "rel", "style"] as const;

// URL schemes safe for href/src. DOMPurify uses this as a regexp check on URI attrs.
// Blocks javascript:, data:, vbscript:, and anything else not on the list.
const SAFE_URI = /^(?:https?:|mailto:|#|\/)/i;

// Stricter allowlist for INBOUND (untrusted-sender) content: no root-relative "/..." or
// bare relative URLs. Otherwise a hostile email's root-relative img/href resolves against
// the app origin and can fire a same-origin state-changing GET when the body renders in the
// srcDoc iframe (F34). Only absolute http(s), mailto, and in-document fragments are allowed.
const INBOUND_SAFE_URI = /^(?:https?:|mailto:|#)/i;

// Tags that must never appear in author-written or inbound content.
// DOMPurify strips these (and their content for dangerous ones) before the output.
const ALWAYS_FORBIDDEN_TAGS = [
  "script",
  "style",
  "form",
  "input",
  "textarea",
  "select",
  "button",
  "iframe",
  "object",
  "embed",
  "applet",
  "link",
  "meta",
  "base",
] as const;

// CSS properties that TipTap formatting extensions emit and that are safe to
// preserve in author-written content. Any other property is stripped.
const ALLOWED_STYLE_PROPERTIES = new Set([
  "font-family",
  "font-size",
  "color",
  "background-color",
  "text-align",
]);

// Values that must never survive in a style attribute regardless of property,
// because they can load remote content or execute code.
const DANGEROUS_STYLE_VALUE = /url\s*\(|expression\s*\(/i;

/**
 * Filter a raw `style` attribute value to only allowed CSS properties,
 * stripping any declaration that uses a dangerous value pattern.
 * Returns the filtered style string, or "" if nothing survives.
 */
function filterStyleAttribute(raw: string): string {
  return raw
    .split(";")
    .map((decl) => decl.trim())
    .filter((decl): decl is string => {
      if (decl === "") return false;
      const colonIdx = decl.indexOf(":");
      if (colonIdx === -1) return false;
      const prop = decl.slice(0, colonIdx).trim().toLowerCase();
      const value = decl.slice(colonIdx + 1).trim();
      if (!ALLOWED_STYLE_PROPERTIES.has(prop)) return false;
      if (DANGEROUS_STYLE_VALUE.test(value)) return false;
      return true;
    })
    .join("; ");
}

// Hook that restricts the `style` attribute to the CSS property allowlist.
// Used only for sanitizeAuthorHtml; inbound strips style entirely.
function authorStyleHook(_node: Element, data: UponSanitizeAttributeHookEvent): void {
  if (data.attrName === "style") {
    const filtered = filterStyleAttribute(data.attrValue);
    if (filtered === "") {
      data.keepAttr = false;
    } else {
      data.attrValue = filtered;
    }
  }
}

// Hook that drops the `style` attribute entirely from inbound (untrusted) email.
function inboundStripStyleHook(_node: Element, data: UponSanitizeAttributeHookEvent): void {
  if (data.attrName === "style") {
    data.keepAttr = false;
  }
}

/**
 * Sanitize HTML authored by our own users (templates, signatures, compose).
 *
 * Keeps: bold/italic/lists/links/images per BASE_TAGS allowlist.
 * Allows: inline style attribute filtered to a CSS-property allowlist
 *   (font-family, font-size, color, background-color, text-align).
 *   Values containing url(...) or expression(...) are stripped.
 * Strips: script, on* handlers, style blocks, form, javascript:/data: URLs,
 *   and any CSS property not on the allowlist.
 */
export function sanitizeAuthorHtml(html: string): string {
  addHook("uponSanitizeAttribute", authorStyleHook);
  try {
    return sanitize(html, {
      ALLOWED_TAGS: [...BASE_TAGS] as string[],
      ALLOWED_ATTR: [...BASE_ATTR] as string[],
      FORBID_TAGS: [...ALWAYS_FORBIDDEN_TAGS] as string[],
      ALLOWED_URI_REGEXP: SAFE_URI,
      ALLOW_DATA_ATTR: false,
      ALLOW_ARIA_ATTR: false,
    });
  } finally {
    removeHook("uponSanitizeAttribute", authorStyleHook);
  }
}

/**
 * Sanitize HTML received from external email senders.
 *
 * Extends author allowlist with table tags (common in marketing email).
 * Always strips iframe/object/embed (in ALWAYS_FORBIDDEN_TAGS).
 * Strips style entirely — untrusted sender content must not use CSS to
 * exfiltrate data or obscure phishing elements.
 *
 * When allowRemote is false: removes remote image src so a received email
 * cannot phone home (tracking pixels, IP leak on open).
 */
export function sanitizeInboundHtml(html: string, opts: { allowRemote: boolean }): string {
  addHook("uponSanitizeAttribute", inboundStripStyleHook);
  let cleaned: string;
  try {
    cleaned = sanitize(html, {
      ALLOWED_TAGS: [...BASE_TAGS, ...INBOUND_EXTRA_TAGS] as string[],
      ALLOWED_ATTR: [...BASE_ATTR, "colspan", "rowspan", "width", "height"] as string[],
      FORBID_TAGS: [...ALWAYS_FORBIDDEN_TAGS] as string[],
      ALLOWED_URI_REGEXP: INBOUND_SAFE_URI,
      ALLOW_DATA_ATTR: false,
      ALLOW_ARIA_ATTR: false,
    });
  } finally {
    removeHook("uponSanitizeAttribute", inboundStripStyleHook);
  }

  if (opts.allowRemote) {
    return cleaned;
  }

  // Block tracking pixels and IP leaks: strip EVERY img src when remote content is not opted
  // in. INBOUND_SAFE_URI already removed relative/root-relative URLs, so any surviving src is
  // http(s); dropping all of them is the belt-and-suspenders guarantee.
  return cleaned.replace(/<img\b[^>]*\bsrc\s*=\s*["'][^"']*["'][^>]*/gi, "<img");
}
