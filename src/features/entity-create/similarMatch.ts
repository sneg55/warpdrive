import type { Option } from "./modalState";

// Normalize for comparison: lowercase, strip punctuation to single spaces, trim. So "ACME, Inc."
// and "acme inc" compare equal.
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Levenshtein edit distance, capped small (we only care whether it is <= 2). The `?? 0` reads are
// unreachable (indices stay in bounds) but satisfy noUncheckedIndexedAccess.
function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (Math.abs(m - n) > 2) return 3; // early out: too far apart to matter
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  for (let i = 1; i <= m; i++) {
    const curr = [i];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min((curr[j - 1] ?? 0) + 1, (prev[j] ?? 0) + 1, (prev[j - 1] ?? 0) + cost);
    }
    prev = curr;
  }
  return prev[n] ?? 0;
}

// Generic leading words that do not make two names "the same company", so a shared one of these
// should not trigger a duplicate warning.
const GENERIC_LEADING = new Set(["the", "a", "an"]);

// The first token of a normalized name, if it is distinctive enough to signal a shared identity
// (>= 3 chars and not a generic article). Returns "" when there is no distinctive leading word.
function distinctiveFirstToken(normalized: string): string {
  const first = normalized.split(" ")[0] ?? "";
  return first.length >= 3 && !GENERIC_LEADING.has(first) ? first : "";
}

// Existing options whose name is the same or similar to the query. "Similar" = one normalized name
// contains the other, the two are within a small edit distance (near-typo), or they share a
// distinctive first word (e.g. "Acme Global" vs "Acme Inc"). Used to warn before creating a
// duplicate contact or organization. A 1-char query is treated as too vague to match.
export function findSimilarOptions(options: Option[], query: string): Option[] {
  const q = normalize(query);
  if (q.length < 2) return [];
  const qFirst = distinctiveFirstToken(q);
  return options.filter((o) => {
    const n = normalize(o.name);
    if (n.length < 2) return false;
    if (n.includes(q) || q.includes(n)) return true;
    // Scale the allowed typo distance to name length so short unrelated names ("GE" vs "BP", edit
    // distance 2) do not falsely match; a name needs >= 4 chars before any fuzzy match is allowed.
    const allowed = Math.min(2, Math.floor(Math.min(n.length, q.length) / 4));
    if (allowed > 0 && editDistance(n, q) <= allowed) return true;
    return qFirst !== "" && distinctiveFirstToken(n) === qFirst;
  });
}
