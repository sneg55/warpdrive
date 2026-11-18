import DOMPurify, {
  addHook,
  removeHook,
  sanitize,
  type UponSanitizeAttributeHookEvent,
} from "isomorphic-dompurify";

void DOMPurify;

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

const INBOUND_EXTRA_TAGS = ["h1", "h2", "h3", "table", "thead", "tbody", "tr", "td", "th"] as const;

const BASE_ATTR = ["href", "src", "alt", "title", "target", "rel", "style"] as const;

const SAFE_URI = /^(?:https?:|mailto:|#|\/)/i;

const INBOUND_SAFE_URI = /^(?:https?:|mailto:|#)/i;

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

const ALLOWED_STYLE_PROPERTIES = new Set([
  "font-family",
  "font-size",
  "color",
  "background-color",
  "text-align",
]);

const DANGEROUS_STYLE_VALUE = /url\s*\(|expression\s*\(/i;

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

function inboundStripStyleHook(_node: Element, data: UponSanitizeAttributeHookEvent): void {
  if (data.attrName === "style") {
    data.keepAttr = false;
  }
}

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

  return cleaned.replace(/<img\b[^>]*\bsrc\s*=\s*["'][^"']*["'][^>]*/gi, "<img");
}
