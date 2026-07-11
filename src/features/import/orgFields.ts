// Firmographics live on orgUpdateInput, not orgCreateInput, so an import that maps a website or an
// employee count must create the org by name and then write these fields through updateOrg.
// `name` is the find-or-create key and is never patched.
const FIRMOGRAPHIC_FIELDS = [
  "domain",
  "industry",
  "linkedinUrl",
  "employeeCount",
  "annualRevenue",
] as const;

// address IS on orgCreateInput, so createOrg persists it at creation time. It only needs a patch
// when filling a blank on a PRE-EXISTING org (enrichment); re-sending it on the create path would
// force an updateOrg call, and its contact.edit gate, on a row a create-only user could run.
const ENRICHMENT_ONLY_FIELDS = ["address"] as const;

// null, undefined, and "" all mean "this org has no value here". A zero employeeCount is a real
// value and must not be treated as blank, so this is deliberately not a falsiness check.
function isBlank(value: unknown): boolean {
  return value === null || value === undefined || value === "";
}

// The fields to write onto an organization for one import row.
//
// `onlyBlank` is the difference between an org this import created (take everything the row mapped)
// and one that already existed (fill gaps, never overwrite). A 115-row shortlist must be able to
// enrich the CRM without silently clobbering data someone curated by hand.
//
// On the create path (onlyBlank=false) only firmographics are patched: createOrg already persisted
// name + address, so re-patching address would trigger an updateOrg the create path never needed.
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
    // The row never mapped this field; leave the org alone.
    if (isBlank(incoming)) continue;
    if (opts.onlyBlank && existing !== null && !isBlank(existing[field])) continue;
    patch[field] = incoming;
  }
  return patch;
}
