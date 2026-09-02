import { assertNever } from "@/types/result";

export type LinkToken =
  | { kind: "text"; value: string }
  | { kind: "url"; value: string; href: string }
  | { kind: "email"; value: string; href: string };

const URL_PIECE = `(?:(?!\\]\\(|\\)\\[)[^\\s<>"“”‘’«»])`;
const TOKEN_RE = new RegExp(
  `(\\bhttps?:\\/\\/${URL_PIECE}+)|((?<![A-Za-z0-9._%+-])[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,})`,
  "gi",
);
const URL_CONTINUATION_RE = new RegExp(`${URL_PIECE}*`, "y");
const JUNCTION_OPENERS: Record<string, string> = { "](": "[", ")[": "(" };
const CLOSERS: Record<string, string> = { "]": "[", ")": "(" };
const MAX_OPENER_DEPTH = 32;

function trackOpeners(openers: string[], gap: string): void {
  for (const ch of gap) {
    if (ch === "\n") openers.length = 0;
    else if (ch === "[" || ch === "(") {
      if (openers.length === MAX_OPENER_DEPTH) openers.shift();
      openers.push(ch);
    } else if (CLOSERS[ch] !== undefined && openers[openers.length - 1] === CLOSERS[ch])
      openers.pop();
  }
}

function scanUrlEnd(text: string, openers: readonly string[], firstEnd: number): number {
  let end = firstEnd;
  for (;;) {
    const junctionOpener = JUNCTION_OPENERS[text.slice(end, end + 2)];
    if (junctionOpener === undefined || openers.includes(junctionOpener)) return end;
    URL_CONTINUATION_RE.lastIndex = end + 2;
    end += 2 + (URL_CONTINUATION_RE.exec(text)?.[0].length ?? 0);
  }
}

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

function pushToken(tokens: LinkToken[], token: LinkToken): void {
  const prev = tokens[tokens.length - 1];
  if (token.kind === "text" && prev?.kind === "text") {
    prev.value += token.value;
    return;
  }
  tokens.push(token);
}

function pushText(tokens: LinkToken[], value: string): void {
  if (value !== "") pushToken(tokens, { kind: "text", value });
}

export function tokenizeLinks(text: string, openers: string[] = []): LinkToken[] {
  const tokens: LinkToken[] = [];
  let last = 0;
  const re = new RegExp(TOKEN_RE);
  let m = re.exec(text);
  while (m !== null) {
    const start = m.index;
    const [whole, url, email] = m;
    const gap = text.slice(last, start);
    trackOpeners(openers, gap);
    pushText(tokens, gap);
    if (url !== undefined) {
      const end = scanUrlEnd(text, openers, start + url.length);
      const clean = trimTrailingPunctuation(text.slice(start, end));
      pushToken(tokens, { kind: "url", value: clean, href: clean });
      last = start + clean.length;
      re.lastIndex = last;
    } else {
      if (email !== undefined) {
        pushToken(tokens, { kind: "email", value: email, href: `mailto:${email}` });
      }
      last = start + whole.length;
    }
    m = re.exec(text);
  }
  const tail = text.slice(last);
  trackOpeners(openers, tail);
  pushText(tokens, tail);
  return tokens;
}

const DELIMITER_ENTITY_RE = /(&nbsp;|&lt;|&gt;|&quot;)/;
const NEW_TAB_ATTRS = ' target="_blank" rel="noopener noreferrer"';

export interface LinkifyOptions {
  emailNewTab?: boolean;
}

export function linkifyEscapedText(
  escaped: string,
  opts: LinkifyOptions = {},
  openers: string[] = [],
): string {
  return escaped
    .split(DELIMITER_ENTITY_RE)
    .map((part, i) => (i % 2 === 0 ? linkifyEscapedRun(part, opts, openers) : part))
    .join("");
}

function linkifyEscapedRun(escaped: string, opts: LinkifyOptions, openers: string[]): string {
  const emailAttrs = opts.emailNewTab === true ? NEW_TAB_ATTRS : "";
  return tokenizeLinks(escaped, openers)
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
const BLOCK_TAG_RE = /^<\/?(?:p|div|br|li|ul|ol|h[1-6]|blockquote|pre|table|tr|td|th|hr)\b/i;

export function linkifyHtml(html: string, opts: LinkifyOptions = {}): string {
  let out = "";
  let last = 0;
  let anchorDepth = 0;
  const openers: string[] = [];
  for (const m of html.matchAll(TAG_RE)) {
    const text = html.slice(last, m.index);
    out += anchorDepth > 0 ? text : linkifyEscapedText(text, opts, openers);
    const tag = m[0];
    if (ANCHOR_OPEN_RE.test(tag)) anchorDepth += 1;
    else if (ANCHOR_CLOSE_RE.test(tag) && anchorDepth > 0) anchorDepth -= 1;
    if (BLOCK_TAG_RE.test(tag)) openers.length = 0;
    out += tag;
    last = m.index + tag.length;
  }
  const rest = html.slice(last);
  out += anchorDepth > 0 ? rest : linkifyEscapedText(rest, opts, openers);
  return out;
}
