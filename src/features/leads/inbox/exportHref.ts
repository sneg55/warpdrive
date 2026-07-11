import type { LeadConditionInput } from "../schemas";

export interface LeadExportParams {
  filter: "inbox" | "archived";
  sort: { field: string; dir: string };
  ownerIds: readonly string[];
  labelKeys: readonly string[];
  nextActivity: string | null;
  columns: readonly string[];
  // Active inline condition builder (null when none). Serialized as JSON so /leads/export can
  // re-validate and apply the same narrowing the list view applied.
  condition: LeadConditionInput | null;
}

// Build the /leads/export URL from the current view state. Kept pure (no window access) so it is
// unit-testable and so LeadsInbox stays small. The route re-applies the visibility gate and
// re-validates every param; this only shapes them into query string form.
export function buildLeadExportHref(p: LeadExportParams): string {
  const params = new URLSearchParams();
  params.set("filter", p.filter);
  params.set("sortField", p.sort.field);
  params.set("sortDir", p.sort.dir);
  if (p.ownerIds.length > 0) params.set("ownerIds", p.ownerIds.join(","));
  if (p.labelKeys.length > 0) params.set("labelKeys", p.labelKeys.join(","));
  if (p.nextActivity !== null) params.set("nextActivity", p.nextActivity);
  if (p.condition !== null) params.set("condition", JSON.stringify(p.condition));
  params.set("columns", [...p.columns].join(","));
  return `/leads/export?${params.toString()}`;
}
