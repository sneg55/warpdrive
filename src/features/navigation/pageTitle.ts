export function entityTitle(name: string | null | undefined, fallback: string): string {
  const trimmed = typeof name === "string" ? name.trim() : "";
  return trimmed === "" ? fallback : trimmed;
}
