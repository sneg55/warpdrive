const TAG = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>/g;
const HREF = /\shref\s*=\s*(?:"([^"]*)"|'([^']*)')/i;
const ENTITY = /&(#x[0-9a-f]+|#\d+|[a-z]+);/gi;
const SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;

const PARAGRAPH_TAGS = new Set(["p", "h1", "h2", "h3", "h4", "h5", "h6", "blockquote"]);
const LINE_TAGS = new Set(["div", "li", "tr", "br"]);

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  ndash: "-",
  mdash: "-",
  hellip: "...",
  lsquo: "'",
  rsquo: "'",
  ldquo: '"',
  rdquo: '"',
  copy: "©",
  reg: "®",
  trade: "™",
};

function codePointToString(code: number, fallback: string): string {
  if (!Number.isInteger(code) || code < 0 || code > 0x10ffff) return fallback;
  return String.fromCodePoint(code);
}

function decodeEntities(text: string): string {
  return text.replace(ENTITY, (match, body: string) => {
    if (body.startsWith("#x") || body.startsWith("#X")) {
      return codePointToString(Number.parseInt(body.slice(2), 16), match);
    }
    if (body.startsWith("#")) {
      return codePointToString(Number.parseInt(body.slice(1), 10), match);
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? match;
  });
}

function linkIdentity(url: string): string {
  return url.trim().replace(SCHEME, "").replace(/\/+$/, "");
}

function renderLink(text: string, href: string): string {
  const visible = text.trim();
  if (visible === "" || linkIdentity(visible) === linkIdentity(href)) return href;
  return `${text} (${href})`;
}

function readHref(attributes: string): string {
  const match = HREF.exec(attributes);
  if (match === null) return "";
  return decodeEntities(match[1] ?? match[2] ?? "").trim();
}

function withBreak(out: string, newlines: number): string {
  if (out === "") return out;
  const trailing = out.length - out.trimEnd().length;
  const existing = out.slice(out.length - trailing).split("\n").length - 1;
  return out + "\n".repeat(Math.max(0, newlines - existing));
}

type Link = { href: string; start: number } | null;
type Walk = { out: string; link: Link };

function handleAnchor(state: Walk, closing: boolean, attributes: string): Walk {
  if (!closing) {
    const href = readHref(attributes);
    return { out: state.out, link: href === "" ? null : { href, start: state.out.length } };
  }
  if (state.link === null) return state;
  const { href, start } = state.link;
  return { out: state.out.slice(0, start) + renderLink(state.out.slice(start), href), link: null };
}

function handleTag(state: Walk, closing: boolean, name: string, attributes: string): Walk {
  if (name === "a") return handleAnchor(state, closing, attributes);
  if (PARAGRAPH_TAGS.has(name)) return { ...state, out: withBreak(state.out, 2) };
  if (name === "br") return { ...state, out: `${state.out}\n` };
  if (!LINE_TAGS.has(name)) return state;
  const broken = withBreak(state.out, 1);
  return { ...state, out: name === "li" && !closing ? `${broken}- ` : broken };
}

export function templateHtmlToDmText(html: string): string {
  let state: Walk = { out: "", link: null };
  let cursor = 0;

  for (const match of html.matchAll(TAG)) {
    state = { ...state, out: state.out + decodeEntities(html.slice(cursor, match.index)) };
    cursor = match.index + match[0].length;
    state = handleTag(state, match[1] === "/", (match[2] ?? "").toLowerCase(), match[3] ?? "");
  }
  const out = state.out + decodeEntities(html.slice(cursor));

  return out
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function dmMergeContext(displayName: string): Record<string, string> {
  const words = displayName.trim().split(/\s+/).filter(Boolean);
  return {
    "person.name": words.join(" "),
    "person.first_name": words[0] ?? "",
    "person.last_name": words.slice(1).join(" "),
  };
}
