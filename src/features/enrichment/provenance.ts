import { normaliseForCompare } from "./merge";
import type { ProviderId, ProviderOutcome } from "./providers/types";
import type { Selection } from "./types";

export function isBackedByRun(outcomes: readonly ProviderOutcome[], selection: Selection): boolean {
  return providersBehind(outcomes, selection).length > 0;
}

export function providersBehind(
  outcomes: readonly ProviderOutcome[],
  selection: Selection,
): ProviderId[] {
  const chosen = normaliseForCompare(selection.canonicalKey, selection.value);
  return outcomes
    .filter((outcome) => {
      const reported = outcome.candidate?.fields[selection.canonicalKey];
      if (reported === undefined) return false;
      return normaliseForCompare(selection.canonicalKey, reported) === chosen;
    })
    .map((outcome) => outcome.provider);
}
