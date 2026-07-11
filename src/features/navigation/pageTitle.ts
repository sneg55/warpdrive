/**
 * Document title for an entity detail page: the entity's own name/title when
 * present, otherwise a stable section fallback. Keeps each route's
 * generateMetadata a one-liner and guarantees the <title> is never blank.
 */
export function entityTitle(name: string | null | undefined, fallback: string): string {
  const trimmed = typeof name === "string" ? name.trim() : "";
  return trimmed === "" ? fallback : trimmed;
}
