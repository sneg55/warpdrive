import { normaliseForCompare } from "./merge";
import type { ProviderId, ProviderOutcome } from "./providers/types";
import type { Selection } from "./types";

// Which providers actually reported the value the user chose. The dialog showed this attribution,
// so the change log has to record the same thing, otherwise the timeline says a value appeared
// from nowhere.
// A selection must be something the cited run actually reported. A server action is a public
// endpoint, so without this an editor can post any value they like through enrichment and have it
// written with a change-log row whose provenance names nobody.
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
