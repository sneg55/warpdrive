import { SEARCH_SNIPPET_ELLIPSIS } from "@/constants/search";

export function buildSnippet(text: string, queryLower: string, maxChars: number): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= maxChars) return flat;

  const hit = flat.toLowerCase().indexOf(queryLower);
  const matchAt = hit === -1 ? 0 : hit;
  const lead = Math.floor((maxChars - Math.min(queryLower.length, maxChars)) / 2);
  const start = Math.max(0, Math.min(matchAt - lead, flat.length - maxChars));
  const end = Math.min(flat.length, start + maxChars);

  const left = start > 0 ? SEARCH_SNIPPET_ELLIPSIS : "";
  const right = end < flat.length ? SEARCH_SNIPPET_ELLIPSIS : "";
  return `${left}${flat.slice(start, end)}${right}`;
}
