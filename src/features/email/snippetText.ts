const NAMED_ENTITIES = new Map<string, string>([
  ["amp", "&"],
  ["lt", "<"],
  ["gt", ">"],
  ["quot", '"'],
  ["apos", "'"],
  ["nbsp", " "],
]);

const ENTITY_PATTERN = /&(#\d+|#[xX][0-9a-fA-F]+|[a-zA-Z]+);/g;

function fromCodePoint(raw: string): string | null {
  const code =
    raw[1] === "x" || raw[1] === "X"
      ? Number.parseInt(raw.slice(2), 16)
      : Number.parseInt(raw.slice(1), 10);
  if (!Number.isFinite(code) || code < 1 || code > 0x10_ff_ff) return null;
  return String.fromCodePoint(code);
}

export function decodeEmailSnippet(snippet: string | null): string | null {
  if (snippet === null) return null;
  return snippet.replace(ENTITY_PATTERN, (match, ref: string) => {
    if (ref.startsWith("#")) return fromCodePoint(ref) ?? match;
    return NAMED_ENTITIES.get(ref.toLowerCase()) ?? match;
  });
}
