// A saved filter's name is valid up to 120 characters and the toolbar trigger never wraps, so a
// long one would push the pipeline and action controls off the toolbar. The visible label is
// capped here; callers keep the whole name in aria-label.
const MAX_VISIBLE_NAME = 28;
const ELLIPSIS = "…";

export function truncateFilterName(name: string): string {
  if (name.length <= MAX_VISIBLE_NAME) return name;
  return `${name.slice(0, MAX_VISIBLE_NAME).trimEnd()}${ELLIPSIS}`;
}
