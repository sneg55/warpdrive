import { AppError, ERROR_IDS, type ErrorId } from "@/constants/errorIds";
import { err, ok, type Result } from "@/types/result";
import type { SyncDeps } from "./sync";
import { withAccessToken } from "./tokens";
import type { XPublicKey } from "./types";

export type ParticipantKeyCache = Map<string, Result<XPublicKey[], AppError>>;

const ACCOUNT_LEVEL: ReadonlySet<ErrorId> = new Set<ErrorId>([
  ERROR_IDS.X_ACCOUNT_NOT_FOUND,
  ERROR_IDS.X_RECONNECT_REQUIRED,
  ERROR_IDS.X_TOKEN_REFRESH_FAILED,
  ERROR_IDS.X_CHAT_KEYS_STALE,
  ERROR_IDS.X_KEYRING_DISPOSED,
]);

export function stopsBackfillRun(e: AppError): boolean {
  if (e.id === ERROR_IDS.X_RATE_LIMITED || ACCOUNT_LEVEL.has(e.id)) return true;
  return (
    e.id === ERROR_IDS.X_HTTP_FAILED &&
    (e.context?.transient === true || (e.context?.status ?? null) === null)
  );
}

async function fetchParticipantKeys(
  deps: SyncDeps,
  a: { accountId: string; userId: string },
  signal: AbortSignal,
): Promise<Result<XPublicKey[], AppError>> {
  const r = await withAccessToken(
    deps.db,
    deps.client,
    a.accountId,
    (token) => deps.client.getPublicKeys(token, a.userId, signal),
    signal,
  );
  signal.throwIfAborted();
  if (!r.ok) return r;
  if (r.value.length > 0) return ok(r.value);
  return err(
    new AppError(ERROR_IDS.X_PUBLIC_KEYS_MISSING, "x backfill: participant has no public keys", {
      accountId: a.accountId,
      side: "participant",
    }),
  );
}

export async function participantKeys(
  deps: SyncDeps,
  cache: ParticipantKeyCache,
  a: { accountId: string; userId: string },
  signal: AbortSignal,
): Promise<Result<XPublicKey[], AppError>> {
  const cached = cache.get(a.userId);
  if (cached !== undefined) return cached;
  const r = await fetchParticipantKeys(deps, a, signal);
  cache.set(a.userId, r);
  return r;
}
