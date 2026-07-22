import { randomBytes, randomUUID } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { jwtVerify, SignJWT } from "jose";
import { env } from "@/config/env";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import {
  ACCESS_TOKEN_TTL_SECONDS,
  OAUTH_JWT_ALGORITHM,
  REFRESH_TOKEN_TTL_MS,
} from "@/constants/oauth";
import type { Db } from "@/db/client";
import { oauthAccessTokens, oauthRefreshTokens } from "@/db/schema/oauth";
import { err, ok, type Result } from "@/types/result";
import { sha256Base64Url } from "./pkce";

interface TokenOwner {
  clientId: string;
  userId: string;
}

interface VerifiedAccessToken {
  userId: string;
  jti: string;
  clientId: string;
  expiresAt: Date;
}

interface RotatedRefreshToken extends TokenOwner {
  refreshToken: string;
}

const signingKey = Buffer.from(env.OAUTH_SIGNING_KEY, "base64");

function tokenError(message: string): AppError {
  return new AppError(ERROR_IDS.OAUTH_TOKEN_REVOKED, message, {});
}

export async function issueAccessToken(
  db: Db,
  owner: TokenOwner,
  signal: AbortSignal,
): Promise<{ token: string; jti: string; expiresAt: Date }> {
  signal.throwIfAborted();
  const jti = randomUUID();
  const issuedAtSeconds = Math.floor(Date.now() / 1_000);
  const expiresAt = new Date((issuedAtSeconds + ACCESS_TOKEN_TTL_SECONDS) * 1_000);
  const token = await new SignJWT({ clientId: owner.clientId })
    .setProtectedHeader({ alg: OAUTH_JWT_ALGORITHM })
    .setSubject(owner.userId)
    .setJti(jti)
    .setIssuer(env.BASE_URL)
    .setIssuedAt(issuedAtSeconds)
    .setExpirationTime(issuedAtSeconds + ACCESS_TOKEN_TTL_SECONDS)
    .sign(signingKey);
  signal.throwIfAborted();
  await db.insert(oauthAccessTokens).values({ jti, ...owner, expiresAt });
  signal.throwIfAborted();
  return { token, jti, expiresAt };
}

export async function verifyAccessToken(
  db: Db,
  token: string,
  signal: AbortSignal,
): Promise<Result<VerifiedAccessToken, AppError>> {
  signal.throwIfAborted();
  let payload: Awaited<ReturnType<typeof jwtVerify>>["payload"];
  try {
    ({ payload } = await jwtVerify(token, signingKey, {
      algorithms: [OAUTH_JWT_ALGORITHM],
      issuer: env.BASE_URL,
    }));
  } catch {
    return err(tokenError("access token is invalid or expired"));
  }
  signal.throwIfAborted();
  if (typeof payload.sub !== "string" || typeof payload.jti !== "string") {
    return err(tokenError("access token claims are invalid"));
  }

  const [row] = await db
    .select()
    .from(oauthAccessTokens)
    .where(eq(oauthAccessTokens.jti, payload.jti));
  signal.throwIfAborted();
  if (
    row === undefined ||
    row.revokedAt !== null ||
    row.expiresAt <= new Date() ||
    row.userId !== payload.sub
  ) {
    return err(tokenError("access token is revoked or expired"));
  }

  await db
    .update(oauthAccessTokens)
    .set({ lastUsedAt: new Date() })
    .where(eq(oauthAccessTokens.jti, row.jti));
  signal.throwIfAborted();
  return ok({
    userId: row.userId,
    jti: row.jti,
    clientId: row.clientId,
    expiresAt: row.expiresAt,
  });
}

export async function issueRefreshToken(
  db: Db,
  owner: TokenOwner,
  signal: AbortSignal,
): Promise<string> {
  signal.throwIfAborted();
  const token = randomBytes(32).toString("base64url");
  await db.insert(oauthRefreshTokens).values({
    tokenHash: sha256Base64Url(token),
    ...owner,
    expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
  });
  signal.throwIfAborted();
  return token;
}

export async function rotateRefreshToken(
  db: Db,
  token: string,
  signal: AbortSignal,
  expectedClientId?: string,
): Promise<Result<RotatedRefreshToken, AppError>> {
  signal.throwIfAborted();
  const tokenHash = sha256Base64Url(token);
  const refreshToken = randomBytes(32).toString("base64url");
  const successorHash = sha256Base64Url(refreshToken);
  const owner = await db.transaction(async (tx) => {
    const [claimed] = await tx
      .update(oauthRefreshTokens)
      .set({ revokedAt: new Date(), rotatedTo: successorHash })
      .where(
        and(
          eq(oauthRefreshTokens.tokenHash, tokenHash),
          expectedClientId === undefined
            ? undefined
            : eq(oauthRefreshTokens.clientId, expectedClientId),
          isNull(oauthRefreshTokens.revokedAt),
          gt(oauthRefreshTokens.expiresAt, new Date()),
        ),
      )
      .returning({ clientId: oauthRefreshTokens.clientId, userId: oauthRefreshTokens.userId });
    signal.throwIfAborted();
    if (claimed === undefined) return undefined;
    await tx.insert(oauthRefreshTokens).values({
      tokenHash: successorHash,
      ...claimed,
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
    });
    signal.throwIfAborted();
    return claimed;
  });
  signal.throwIfAborted();
  if (owner === undefined) {
    return err(new AppError(ERROR_IDS.OAUTH_INVALID_GRANT, "refresh token is invalid", {}));
  }
  return ok({ ...owner, refreshToken });
}

export async function revokeAllForClientUser(
  db: Db,
  clientId: string,
  userId: string,
  signal: AbortSignal,
): Promise<void> {
  signal.throwIfAborted();
  const revokedAt = new Date();
  await db
    .update(oauthAccessTokens)
    .set({ revokedAt })
    .where(and(eq(oauthAccessTokens.clientId, clientId), eq(oauthAccessTokens.userId, userId)));
  signal.throwIfAborted();
  await db
    .update(oauthRefreshTokens)
    .set({ revokedAt })
    .where(and(eq(oauthRefreshTokens.clientId, clientId), eq(oauthRefreshTokens.userId, userId)));
  signal.throwIfAborted();
}
