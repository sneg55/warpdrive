// UUID v4/v5 pattern: 8-4-4-4-12 hex digits.
const UUID_PATTERN = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
// Mention token: @[Display Name](uuid) where display name is 1-80 chars.
const TOKEN_RE = new RegExp(`@\\[([^\\]]{1,80})\\]\\((${UUID_PATTERN})\\)`, "g");

// Pure function: extract @[Display Name](userId-uuid) tokens from a body string.
// Deduplicates by userId (first display wins). Ignores plain @text and malformed tokens.
export function parseMentions(body: string): { userId: string; display: string }[] {
  const seen = new Set<string>();
  const out: { userId: string; display: string }[] = [];
  for (const m of body.matchAll(TOKEN_RE)) {
    const display = m[1] as string;
    const userId = (m[2] as string).toLowerCase();
    if (seen.has(userId)) continue;
    seen.add(userId);
    out.push({ userId, display });
  }
  return out;
}
