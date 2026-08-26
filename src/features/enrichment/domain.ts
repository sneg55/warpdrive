// One normaliser for domains, shared by org linking and global search. A stored value may be a
// pasted URL and a search query may be an email address, so both sides reduce to a bare host.
// The SQL counterpart is normalisedDomainSql in src/db/schema/organizations.ts.
const SCHEME_OR_WWW = /^(?:https?:\/\/)?(?:www\.)?/;

export function normaliseDomain(raw: string): string {
  return raw.trim().toLowerCase().replace(SCHEME_OR_WWW, "").split("/")[0] ?? "";
}
