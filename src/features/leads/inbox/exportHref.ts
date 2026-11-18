import type { LeadConditionInput } from "../schemas";

export interface LeadExportParams {
  filter: "inbox" | "archived";
  sort: { field: string; dir: string };
  ownerIds: readonly string[];
  labelKeys: readonly string[];
  nextActivity: string | null;
  columns: readonly string[];
  condition: LeadConditionInput | null;
}

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
