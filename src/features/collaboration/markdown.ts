import { marked } from "marked";
import sanitizeHtml from "sanitize-html";

// Use the default renderer. Marked v18 parse() returns a string synchronously
// when async is not requested. Raw/inline HTML is passed through by marked and
// then fully sanitized by the allowlist below (defense in depth).
const renderer = new marked.Renderer();

/**
 * Renders Markdown to sanitized HTML safe for server-side rendering.
 *
 * Security contract: the sanitize-html allowlist is the enforcement boundary.
 * Anything not on the allowlist is stripped. Blocked categories:
 *   - All script/style/form/iframe/textarea/noscript content (dropped entirely)
 *   - All event handler attributes (on*)
 *   - Non-http/https/mailto link schemes (javascript:, data:, etc.)
 *   - Non-https image sources
 * Safe additions:
 *   - Links get rel="noopener noreferrer" and target="_blank"
 *   - Images get loading="lazy"
 */
export function renderSafeMarkdown(body: string): string {
  const rawHtml = marked.parse(body, { async: false, renderer });
  return sanitizeHtml(rawHtml, {
    allowedTags: [
      "p",
      "br",
      "strong",
      "em",
      "del",
      "blockquote",
      "code",
      "pre",
      "ul",
      "ol",
      "li",
      "h1",
      "h2",
      "h3",
      "h4",
      "a",
      "img",
      "hr",
      "table",
      "thead",
      "tbody",
      "tr",
      "th",
      "td",
    ],
    allowedAttributes: {
      // rel and target must be listed so simpleTransform can inject them.
      a: ["href", "rel", "target"],
      img: ["src", "alt", "loading"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    allowedSchemesByTag: { img: ["https"] },
    // Reject protocol-relative hrefs like //evil.com (sanitize-html defaults this to true).
    allowProtocolRelative: false,
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", {
        rel: "noopener noreferrer",
        target: "_blank",
      }),
      img: sanitizeHtml.simpleTransform("img", { loading: "lazy" }),
    },
    // Drop tag AND its content for these dangerous tags (not just the wrapper).
    nonTextTags: ["script", "style", "form", "iframe", "textarea", "noscript"],
    // Drop <img> entirely when its src scheme was stripped (e.g. http: images).
    // allowedSchemesByTag removes the src attribute; exclusiveFilter removes the tag.
    exclusiveFilter: (frame) => {
      if (frame.tag === "img") {
        return frame.attribs.src === undefined || frame.attribs.src === "";
      }
      return false;
    },
  });
}
