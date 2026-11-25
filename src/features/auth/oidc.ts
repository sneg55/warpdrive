import { type JWTVerifyGetKey, errors as joseErrors, jwtVerify } from "jose";
import { z } from "zod";
import { err, ok, type Result } from "@/types/result";

export const OIDC_SCOPES = "openid email profile groups";

const TRAILING_SLASHES = /\/+$/;

function canonicalIssuer(issuer: string): string {
  return issuer.replace(TRAILING_SLASHES, "");
}

function issuerVariants(issuer: string): string[] {
  const canonical = canonicalIssuer(issuer);
  return [canonical, `${canonical}/`];
}

export interface OidcProviderConfig {
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  jwksUri: string;
}

export interface VerifiedOidcIdentity {
  email: string;
  sub: string;
  name: string | null;
  preferredUsername: string | null;
  avatarUrl: string | null;
  groups: string[];
}

export function parseAllowedGroups(raw: string): string[] {
  return raw
    .split(",")
    .map((g) => g.trim())
    .filter((g) => g.length > 0);
}

export function discoveryUrl(issuer: string): string {
  return `${canonicalIssuer(issuer)}/.well-known/openid-configuration`;
}

const discoverySchema = z.object({
  issuer: z.string().url(),
  authorization_endpoint: z.string().url(),
  token_endpoint: z.string().url(),
  jwks_uri: z.string().url(),
});

const configCache = new Map<string, OidcProviderConfig>();

export function clearOidcConfigCache(): void {
  configCache.clear();
}

export async function fetchOidcConfig(
  issuer: string,
  signal: AbortSignal,
  deps: { fetchImpl: typeof fetch },
): Promise<Result<OidcProviderConfig, "unavailable">> {
  signal.throwIfAborted();
  const cached = configCache.get(issuer);
  if (cached !== undefined) return ok(cached);

  let res: Response;
  try {
    res = await deps.fetchImpl(discoveryUrl(issuer), { signal });
  } catch {
    return err("unavailable");
  }
  signal.throwIfAborted();
  if (!res.ok) return err("unavailable");

  const parsed = discoverySchema.safeParse(await res.json());
  if (!parsed.success) return err("unavailable");
  if (canonicalIssuer(parsed.data.issuer) !== canonicalIssuer(issuer)) {
    return err("unavailable");
  }

  const config: OidcProviderConfig = {
    issuer,
    authorizationEndpoint: parsed.data.authorization_endpoint,
    tokenEndpoint: parsed.data.token_endpoint,
    jwksUri: parsed.data.jwks_uri,
  };
  configCache.set(issuer, config);
  return ok(config);
}

export function buildOidcAuthUrl(args: {
  config: OidcProviderConfig;
  clientId: string;
  redirectUri: string;
  state: string;
  nonce: string;
  codeChallenge: string;
}): string {
  const url = new URL(args.config.authorizationEndpoint);
  url.searchParams.set("client_id", args.clientId);
  url.searchParams.set("redirect_uri", args.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", OIDC_SCOPES);
  url.searchParams.set("state", args.state);
  url.searchParams.set("nonce", args.nonce);
  url.searchParams.set("code_challenge", args.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

const claimsSchema = z.object({
  email: z.string().min(1),
  email_verified: z.literal(true),
  sub: z.string().min(1),
  nonce: z.string(),
  groups: z.array(z.string()).optional(),
  name: z.string().optional(),
  preferred_username: z.string().optional(),
  picture: z.string().optional(),
});

export interface VerifyOidcIdTokenDeps {
  getKey: JWTVerifyGetKey;
  clientId: string;
  nonce: string;
  issuer: string;
  allowedGroups: string[];
  signal: AbortSignal;
}

export async function verifyOidcIdToken(
  idToken: string,
  deps: VerifyOidcIdTokenDeps,
): Promise<Result<VerifiedOidcIdentity, "rejected">> {
  deps.signal.throwIfAborted();

  let payload: Record<string, unknown>;
  try {
    const { payload: verified } = await jwtVerify(idToken, deps.getKey, {
      issuer: issuerVariants(deps.issuer),
      audience: deps.clientId,
    });
    payload = verified;
  } catch (e) {
    if (e instanceof joseErrors.JOSEError) return err("rejected");
    throw e;
  }

  deps.signal.throwIfAborted();

  const parsed = claimsSchema.safeParse(payload);
  if (!parsed.success) return err("rejected");
  const c = parsed.data;

  if (c.nonce !== deps.nonce) return err("rejected");
  const groups = c.groups ?? [];
  if (!groups.some((g) => deps.allowedGroups.includes(g))) return err("rejected");

  return ok({
    email: c.email.trim().toLowerCase(),
    sub: c.sub,
    name: c.name ?? null,
    preferredUsername: c.preferred_username ?? null,
    avatarUrl: c.picture ?? null,
    groups,
  });
}
