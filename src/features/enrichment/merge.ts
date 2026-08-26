import { valueTypeOf } from "./canonical";
import { isInvalidCurrentValue, isUsableProposedValue } from "./fieldValidity";
import { PROVIDER_PRIORITY, type ProviderId, type ProviderOutcome } from "./providers/types";
import type { ProposedField, ProposedValue, ResolvedMapping } from "./types";

const URL_KEY = /(url|website|domain)$/i;

// Comparison form only. Two providers spelling the same fact differently must count as agreement,
// otherwise every merged field looks like a conflict and the dialog asks the user to arbitrate
// between "Head of Growth" and "head of growth".
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
    // First spelling wins for display: the value the user sees should be a real provider value,
    // not the lowercased comparison form.
    if (existing === undefined)
      byNormalised.set(key, { value: raw, providers: [outcome.provider] });
    else if (!existing.providers.includes(outcome.provider))
      existing.providers.push(outcome.provider);
  }
  return [...byNormalised.values()];
}

// Most-backed variant first; ties break on the fixed provider order so a run is reproducible.
function rank(a: Bucket, b: Bucket): number {
  if (a.providers.length !== b.providers.length) return b.providers.length - a.providers.length;
  return priorityOf(a.providers[0] ?? "apollo") - priorityOf(b.providers[0] ?? "apollo");
}

export function mergeCandidates(
  outcomes: readonly ProviderOutcome[],
  current: Readonly<Record<string, string | number | null>>,
  mappings: readonly ResolvedMapping[],
  // Targets that hold a set rather than one value, principally a person's emails. Without these a
  // provider returning an address the record already has as a secondary looks like an overwrite of
  // the primary, and a cached run keeps proposing it while the write silently no-ops.
  multi: Readonly<Record<string, readonly string[]>> = {},
  // Targets that hold something the actor may not be shown, principally a person linked to an
  // organization outside their visibility. Reading those as empty checks the row by default and
  // the apply moves the link without the user ever knowing one was there.
  occupied: readonly string[] = [],
): ProposedField[] {
  const fields: ProposedField[] = [];

  // Mapping order, not provider order, so the dialog lists the same rows in the same places
  // whichever provider happened to answer first.
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
    // Every provider agrees with what is already stored: there is nothing to propose.
    if (fresh.length === 0) continue;

    const values: ProposedValue[] = fresh.map((b) => ({ value: b.value, providers: b.providers }));
    // A set-valued target is added to, never replaced, so a new entry is not an overwrite.
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
      // A promotion is the user's call, except over a promoted value that is already broken.
      defaultMakePrimary: supportsPrimary && currentInvalid,
      // Nothing that would destroy an existing value is checked by default, unless the value it
      // would destroy cannot be right anyway.
      defaultSelected: !isOverwrite || currentInvalid,
    });
  }

  return fields;
}
