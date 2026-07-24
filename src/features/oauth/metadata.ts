function withoutTrailingSlash(baseUrl: string): string {
  return baseUrl.replace(/\/$/, "");
}

export interface AuthServerMetadataOptions {
  registration: "open" | "disabled";
}

export function buildAuthServerMetadata(
  baseUrl: string,
  opts: AuthServerMetadataOptions = { registration: "open" },
) {
  const base = withoutTrailingSlash(baseUrl);
  return {
    issuer: base,
    authorization_endpoint: `${base}/oauth/authorize`,
    token_endpoint: `${base}/oauth/token`,
    // Omitted entirely (not advertised as an endpoint that then 404s) when a deploy has turned
    // dynamic registration off, so discovery reflects policy instead of looking like a bug.
    ...(opts.registration === "open"
      ? { registration_endpoint: `${base}/oauth/register` }
      : undefined),
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
  };
}

export function buildProtectedResourceMetadata(baseUrl: string) {
  const base = withoutTrailingSlash(baseUrl);
  return {
    resource: `${base}/api/mcp`,
    authorization_servers: [base],
  };
}
