const UUID_PATTERN = "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";
const TOKEN_RE = new RegExp(`@\\[([^\\]]{1,80})\\]\\((${UUID_PATTERN})\\)`, "g");

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
