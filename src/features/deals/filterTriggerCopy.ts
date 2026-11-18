const MAX_VISIBLE_NAME = 28;
const ELLIPSIS = "…";

export function truncateFilterName(name: string): string {
  if (name.length <= MAX_VISIBLE_NAME) return name;
  return `${name.slice(0, MAX_VISIBLE_NAME).trimEnd()}${ELLIPSIS}`;
}
