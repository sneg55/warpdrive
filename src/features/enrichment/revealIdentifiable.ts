import type { ProviderId } from "./providers/types";
import type { UsableProvider } from "./providersRepo";

const OBFUSCATION_MARKER = "*";

export function nameIsObfuscated(fullName: string): boolean {
  return fullName.includes(OBFUSCATION_MARKER);
}

export function identifiableProviders(
  usable: readonly UsableProvider[],
  searchProvider: ProviderId,
  fullName: string,
): UsableProvider[] {
  if (!nameIsObfuscated(fullName)) return [...usable];
  return usable.filter((entry) => entry.provider === searchProvider);
}
