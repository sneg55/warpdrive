// Deterministic Created-on formatter for the templates table. The rows render in client components
// that are still server-rendered, so a locale/time-zone-dependent format (toLocaleDateString with no
// args) produces different HTML on the server vs the browser and causes a hydration mismatch (and a
// date shift near midnight). Pin the locale and time zone so both sides always agree.
export function formatCreatedOn(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    timeZone: "UTC",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}
