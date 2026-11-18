import { normaliseDomain } from "@/features/enrichment/domain";

export function orgDomainTerm(q: string): string | null {
  const trimmed = q.trim();
  if (trimmed.length === 0 || /\s/.test(trimmed)) return null;

  const at = trimmed.lastIndexOf("@");
  const host = normaliseDomain(at === -1 ? trimmed : trimmed.slice(at + 1));

  if (!host.includes(".") || host === trimmed.toLowerCase()) return null;
  return host;
}
