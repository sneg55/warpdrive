import { valueTypeOf } from "./canonical";
import { isInvalidCurrentValue, isUsableProposedValue } from "./fieldValidity";
import { PROVIDER_PRIORITY, type ProviderId, type ProviderOutcome } from "./providers/types";
import type { ProposedField, ProposedValue, ResolvedMapping } from "./types";

const URL_KEY = /(url|website|domain)$/i;

export function normaliseForCompare(canonicalKey: string, value: string | number): string {
  if (valueTypeOf(canonicalKey) === "number") {
    const asNumber =
      typeof value === "number" ? value : Number(String(value).replace(/[,\s]/g, ""));
    return Number.isFinite(asNumber) ? String(asNumber) : String(value).trim().toLowerCase();
  }
  const text = String(value).trim().toLowerCase();
  if (!URL_KEY.test(canonicalKey)) return text;
  return text
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .replace(/\/+$/, "");
}

function priorityOf(provider: ProviderId): number {
  const index = PROVIDER_PRIORITY.indexOf(provider);
  return index === -1 ? PROVIDER_PRIORITY.length : index;
}

interface Bucket {
  value: string | number;
  providers: ProviderId[];
}

function collect(outcomes: readonly ProviderOutcome[], canonicalKey: string): Bucket[] {
  const byNormalised = new Map<string, Bucket>();
  for (const outcome of outcomes) {
    const raw = outcome.candidate?.fields[canonicalKey];
    if (raw === undefined) continue;
    const key = normaliseForCompare(canonicalKey, raw);
    if (key.length === 0) continue;
    const existing = byNormalised.get(key);
    if (existing === undefined)
      byNormalised.set(key, { value: raw, providers: [outcome.provider] });
    else if (!existing.providers.includes(outcome.provider))
      existing.providers.push(outcome.provider);
  }
  return [...byNormalised.values()];
}

function rank(a: Bucket, b: Bucket): number {
  if (a.providers.length !== b.providers.length) return b.providers.length - a.providers.length;
  return priorityOf(a.providers[0] ?? "apollo") - priorityOf(b.providers[0] ?? "apollo");
}

export function mergeCandidates(
  outcomes: readonly ProviderOutcome[],
  current: Readonly<Record<string, string | number | null>>,
  mappings: readonly ResolvedMapping[],
  multi: Readonly<Record<string, readonly string[]>> = {},
  occupied: readonly string[] = [],
): ProposedField[] {
  const fields: ProposedField[] = [];

  for (const mapping of mappings) {
    const buckets = collect(outcomes, mapping.canonicalKey).sort(rank);
    if (buckets.length === 0) continue;

    const currentValue = current[mapping.canonicalKey] ?? null;
    const currentKey =
      currentValue === null ? null : normaliseForCompare(mapping.canonicalKey, currentValue);
    const held = new Set(
      (multi[mapping.canonicalKey] ?? []).map((v) => normaliseForCompare(mapping.canonicalKey, v)),
    );
    const fresh = buckets.filter((b) => {
      if (!isUsableProposedValue(mapping.canonicalKey, b.value)) return false;
      const key = normaliseForCompare(mapping.canonicalKey, b.value);
      return !held.has(key) && (currentKey === null || key !== currentKey);
    });
    if (fresh.length === 0) continue;

    const values: ProposedValue[] = fresh.map((b) => ({ value: b.value, providers: b.providers }));
    const taken = currentKey !== null || occupied.includes(mapping.canonicalKey);
    const isOverwrite = taken && held.size === 0;
    const supportsPrimary = held.size > 0;
    const currentInvalid = isInvalidCurrentValue(mapping.canonicalKey, currentValue);

    fields.push({
      canonicalKey: mapping.canonicalKey,
      label: mapping.label,
      values,
      selectedValue: values[0]?.value ?? "",
      currentValue,
      isOverwrite,
      currentInvalid,
      supportsPrimary,
      defaultMakePrimary: supportsPrimary && currentInvalid,
      defaultSelected: !isOverwrite || currentInvalid,
    });
  }

  return fields;
}
