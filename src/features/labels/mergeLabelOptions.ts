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
