import { PROVIDER_PRIORITY, type ProviderId } from "../providers/types";

const FALLBACK: ProviderId = "apollo";

export function prospectSearchProviderDefault(providers: readonly ProviderId[]): ProviderId {
  return PROVIDER_PRIORITY.find((id) => providers.includes(id)) ?? FALLBACK;
}
