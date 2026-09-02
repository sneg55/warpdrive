import { assertNever } from "@/types/result";

export type LinkToken =
  | { kind: "text"; value: string }
  | { kind: "url"; value: string; href: string }
  | { kind: "email"; value: string; href: string };

const TOKEN_RE =
  /(\bhttps?:\/\/(?:(?!\]\(|\)\[)[^\s<>"“”‘’«»])+)|((?<![A-Za-z0-9._%+-])[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/gi;

const URL_TRAILING_CHARS = new Set([".", ",", ";", ":", "!", "?", ")", "]", "'"]);
const ESCAPED_APOSTROPHE = "&#39;";
const BALANCED_PAIRS: Record<string, string> = { ")": "(", "]": "[" };

function countChars(s: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const ch of s) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  return counts;
}

function trimTrailingPunctuation(url: string): string {
  const counts = countChars(url);
  let end = url.length;
  while (end > 0) {
    if (url.endsWith(ESCAPED_APOSTROPHE, end)) {
      end -= ESCAPED_APOSTROPHE.length;
      continue;
    }
    const last = url[end - 1] ?? "";
    if (!URL_TRAILING_CHARS.has(last)) break;
    const opener = BALANCED_PAIRS[last];
    if (opener !== undefined) {
      const closes = counts.get(last) ?? 0;
      if ((counts.get(opener) ?? 0) >= closes) break;
      counts.set(last, closes - 1);
    }
    end -= 1;
  }
  return url.slice(0, end);
}

function escapeAttr(s: string): string {
  return s.replace(/"/g, "&quot;");
}

export function tokenizeLinks(text: string): LinkToken[] {
  const tokens: LinkToken[] = [];
  let last = 0;
  for (const m of text.matchAll(TOKEN_RE)) {
    const start = m.index;
    const [whole, url, email] = m;
    if (start > last) tokens.push({ kind: "text", value: text.slice(last, start) });
    if (url !== undefined) {
      const clean = trimTrailingPunctuation(url);
      tokens.push({ kind: "url", value: clean, href: clean });
      last = start + clean.length;
      continue;
    }
    if (email !== undefined) {
      tokens.push({ kind: "email", value: email, href: `mailto:${email}` });
    }
    last = start + whole.length;
  }
  if (last < text.length) tokens.push({ kind: "text", value: text.slice(last) });
  return tokens;
}

const DELIMITER_ENTITY_RE = /(&nbsp;|&lt;|&gt;|&quot;)/;
const NEW_TAB_ATTRS = ' target="_blank" rel="noopener noreferrer"';

export interface LinkifyOptions {
  emailNewTab?: boolean;
}

export function linkifyEscapedText(escaped: string, opts: LinkifyOptions = {}): string {
  return escaped
    .split(DELIMITER_ENTITY_RE)
    .map((part, i) => (i % 2 === 0 ? linkifyEscapedRun(part, opts) : part))
    .join("");
}

function linkifyEscapedRun(escaped: string, opts: LinkifyOptions): string {
  const emailAttrs = opts.emailNewTab === true ? NEW_TAB_ATTRS : "";
  return tokenizeLinks(escaped)
    .map((t) => {
      switch (t.kind) {
        case "text":
          return t.value;
        case "url":
          return `<a href="${escapeAttr(t.href)}"${NEW_TAB_ATTRS}>${t.value}</a>`;
        case "email":
          return `<a href="${escapeAttr(t.href)}"${emailAttrs}>${t.value}</a>`;
        default:
          return assertNever(t);
      }
    })
    .join("");
}

const TAG_RE = /<(?:[^>"']|"[^"]*"|'[^']*')*>/g;
const ANCHOR_OPEN_RE = /^<a[\s>]/i;
const ANCHOR_CLOSE_RE = /^<\/a\s*>/i;

export function linkifyHtml(html: string, opts: LinkifyOptions = {}): string {
  let out = "";
  let last = 0;
  let anchorDepth = 0;
  for (const m of html.matchAll(TAG_RE)) {
    const text = html.slice(last, m.index);
    out += anchorDepth > 0 ? text : linkifyEscapedText(text, opts);
    const tag = m[0];
    if (ANCHOR_OPEN_RE.test(tag)) anchorDepth += 1;
    else if (ANCHOR_CLOSE_RE.test(tag) && anchorDepth > 0) anchorDepth -= 1;
    out += tag;
    last = m.index + tag.length;
  }
  const rest = html.slice(last);
  out += anchorDepth > 0 ? rest : linkifyEscapedText(rest, opts);
  return out;
}
