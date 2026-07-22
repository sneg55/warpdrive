import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import { verifyAccessToken } from "@/features/oauth/tokens";
import { hydrateActor } from "@/server/hydrateActor";
import type { AppContext } from "@/server/trpc/context";
import { err, ok, type Result } from "@/types/result";
import { buildAppContext } from "./actorContext";

function bearerToken(authorizationHeader: string | null): string | null {
  if (authorizationHeader === null) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(authorizationHeader.trim());
  return match?.[1] ?? null;
}

export async function authenticateMcp(
  db: Db,
  authorizationHeader: string | null,
  signal: AbortSignal,
): Promise<Result<{ ctx: AppContext; authInfo: AuthInfo }, AppError>> {
  signal.throwIfAborted();
  const token = bearerToken(authorizationHeader);
  if (token === null) {
    return err(new AppError(ERROR_IDS.OAUTH_INVALID_GRANT, "bearer token is required", {}));
  }

  const verified = await verifyAccessToken(db, token, signal);
  if (!verified.ok) return verified;
  const actor = await hydrateActor(db, verified.value.userId, signal);
  signal.throwIfAborted();
  if (actor === null) {
    return err(new AppError(ERROR_IDS.OAUTH_TOKEN_REVOKED, "token subject is unavailable", {}));
  }
  const authInfo: AuthInfo = {
    token,
    clientId: verified.value.clientId,
    scopes: [],
    expiresAt: Math.floor(verified.value.expiresAt.getTime() / 1_000),
  };
  return ok({ ctx: buildAppContext(db, actor), authInfo });
}
