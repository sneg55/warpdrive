import type { Option } from "./modalState";

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (Math.abs(m - n) > 2) return 3;
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

const GENERIC_LEADING = new Set(["the", "a", "an"]);

function distinctiveFirstToken(normalized: string): string {
  const first = normalized.split(" ")[0] ?? "";
  return first.length >= 3 && !GENERIC_LEADING.has(first) ? first : "";
}

export function findSimilarOptions(options: Option[], query: string): Option[] {
  const q = normalize(query);
  if (q.length < 2) return [];
  const qFirst = distinctiveFirstToken(q);
  return options.filter((o) => {
    const n = normalize(o.name);
    if (n.length < 2) return false;
    if (n.includes(q) || q.includes(n)) return true;
    const allowed = Math.min(2, Math.floor(Math.min(n.length, q.length) / 4));
    if (allowed > 0 && editDistance(n, q) <= allowed) return true;
    return qFirst !== "" && distinctiveFirstToken(n) === qFirst;
  });
}
