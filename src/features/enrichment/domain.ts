const SCHEME_OR_WWW = /^(?:https?:\/\/)?(?:www\.)?/;

export function normaliseDomain(raw: string): string {
  return raw.trim().toLowerCase().replace(SCHEME_OR_WWW, "").split("/")[0] ?? "";
}
