import { buildProtectedResourceMetadata } from "./metadata";

export function resolveMcpEndpoint({
  mcpEnabled,
  baseUrl,
}: {
  mcpEnabled: boolean;
  baseUrl: string;
}): string | null {
  if (!mcpEnabled) return null;
  return buildProtectedResourceMetadata(baseUrl).resource;
}
