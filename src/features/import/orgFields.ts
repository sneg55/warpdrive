const FIRMOGRAPHIC_FIELDS = [
  "domain",
  "industry",
  "linkedinUrl",
  "employeeCount",
  "annualRevenue",
] as const;

const ENRICHMENT_ONLY_FIELDS = ["address"] as const;

function isBlank(value: unknown): boolean {
  return value === null || value === undefined || value === "";
}

export function orgFieldPatch(
  group: Record<string, unknown>,
  existing: Record<string, unknown> | null,
  opts: { onlyBlank: boolean },
): Record<string, unknown> {
  const fields = opts.onlyBlank
    ? [...FIRMOGRAPHIC_FIELDS, ...ENRICHMENT_ONLY_FIELDS]
    : FIRMOGRAPHIC_FIELDS;
  const patch: Record<string, unknown> = {};
  for (const field of fields) {
    const incoming = group[field];
    if (isBlank(incoming)) continue;
    if (opts.onlyBlank && existing !== null && !isBlank(existing[field])) continue;
    patch[field] = incoming;
  }
  return patch;
}
