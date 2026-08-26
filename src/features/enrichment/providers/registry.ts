import { apolloProvider } from "./apollo";
import { getprospectProvider } from "./getprospect";
import { rocketreachProvider } from "./rocketreach";
import type { EnrichmentProvider, ProviderId } from "./types";

const REGISTRY: Readonly<Record<ProviderId, EnrichmentProvider>> = {
  apollo: apolloProvider,
  rocketreach: rocketreachProvider,
  getprospect: getprospectProvider,
};

export function providerFor(id: ProviderId): EnrichmentProvider {
  return REGISTRY[id];
}
