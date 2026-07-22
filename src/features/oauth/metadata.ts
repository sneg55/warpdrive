function withoutTrailingSlash(baseUrl: string): string {
  return baseUrl.replace(/\/$/, "");
}

export function buildAuthServerMetadata(baseUrl: string) {
  const base = withoutTrailingSlash(baseUrl);
  return {
    issuer: base,
    authorization_endpoint: `${base}/oauth/authorize`,
    token_endpoint: `${base}/oauth/token`,
    registration_endpoint: `${base}/oauth/register`,
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
