import { normaliseDomain } from "@/features/enrichment/domain";

// A domain is one tsvector lexeme, so "https://www.pvta.com/" and "jane@pvta.com" never match an
// index built on "pvta.com". Reduce the query to the same bare host the index stores, and return
// null when that adds nothing, so an ordinary word query keeps its plain tsquery.
export function orgDomainTerm(q: string): string | null {
  const trimmed = q.trim();
  if (trimmed.length === 0 || /\s/.test(trimmed)) return null;

  const at = trimmed.lastIndexOf("@");
  const host = normaliseDomain(at === -1 ? trimmed : trimmed.slice(at + 1));

  // Needs a dot to be a domain at all, and nothing to add if the query already is that host.
  if (!host.includes(".") || host === trimmed.toLowerCase()) return null;
  return host;
}
