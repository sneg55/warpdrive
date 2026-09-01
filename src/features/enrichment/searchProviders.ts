import type { EnrichmentProvider, ProviderId } from "./providers/types";
import { PROVIDER_PRIORITY } from "./providers/types";
import type { UsableProvider } from "./providersRepo";

export function searchCapableProviders(
  usable: readonly UsableProvider[],
  providerFor: (id: ProviderId) => EnrichmentProvider,
): ProviderId[] {
  const available = new Set(usable.map((entry) => entry.provider));
  return PROVIDER_PRIORITY.filter(
    (id) => available.has(id) && providerFor(id).searchPeople !== undefined,
  );
}
