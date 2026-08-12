// The options a label filter should offer: the catalog first (curated names, curated order), then
// any name records actually carry that the catalog does not know about. Matching is
// case-insensitive to agree with resolveLabelChips, so an applied "hot" is the catalog's "Hot"
// rather than a second option filtering the same rows.
export function mergeLabelOptions(catalogNames: string[], appliedNames: string[]): string[] {
  const seen = new Set(catalogNames.map((n) => n.toLowerCase()));
  const out = [...catalogNames];
  for (const name of appliedNames) {
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}
