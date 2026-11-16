"use server";

import { z } from "zod";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import { X_UNLOCK_TIMEOUT_MS } from "@/constants/xDms";
import { guardCsrf } from "@/features/identity/actions/shared";
import { createContext } from "@/server/trpc/context";
import { type ActionResult, clientErr, toClientResult } from "@/types/actionResult";
import { ok } from "@/types/result";
import { unlockErrorForClient } from "./chatKeyClientError";
import { removeChatKeys, unlockChatKeys } from "./chatKeys";
import { xClientFromEnv } from "./clientFromEnv";
import { enqueueXChatBackfill } from "./enqueue";
import { juiceboxUnlocker } from "./juicebox";

const removeSchema = z.object({ accountId: z.uuid() });
const unlockSchema = removeSchema.extend({ passcode: z.string().min(1).max(64) });

const csrfDenied = () => clientErr(new AppError(ERROR_IDS.PERM_DENIED, "csrf check failed", {}));
const inputInvalid = () =>
  clientErr(new AppError(ERROR_IDS.X_INPUT_INVALID, "invalid x chat key input", {}));
const unauthenticated = () => clientErr(new AppError(ERROR_IDS.PERM_DENIED, "unauthenticated", {}));

export async function unlockChatKeysAction(
  raw: unknown,
  csrfToken: string | null,
): Promise<ActionResult<{ keyVersion: string }>> {
  const signal = AbortSignal.timeout(X_UNLOCK_TIMEOUT_MS);
  const csrf = await guardCsrf(csrfToken);
  signal.throwIfAborted();
  if (!csrf.ok) return csrfDenied();
  const input = unlockSchema.safeParse(raw);
  if (!input.success) return inputInvalid();
  const client = xClientFromEnv();
  if (client === null)
    return clientErr(
      new AppError(ERROR_IDS.X_OAUTH_FAILED, "X direct messages are not configured", {}),
    );
  const ctx = await createContext();
  signal.throwIfAborted();
  if (ctx.actor === null) return unauthenticated();
  const result = await unlockChatKeys(
    { db: ctx.db, client, unlocker: juiceboxUnlocker },
    { ...input.data, actorId: ctx.actor.id },
    signal,
  );
  if (!result.ok) return unlockErrorForClient(result.error);
  try {
    await enqueueXChatBackfill(input.data.accountId, signal);
  } catch (cause) {
    if (signal.aborted) throw cause;
    console.error("x unlock: backfill enqueue failed", { accountId: input.data.accountId });
  }
  return ok(result.value);
}

export async function removeChatKeysAction(
  raw: unknown,
  csrfToken: string | null,
): Promise<ActionResult<void>> {
  const signal = new AbortController().signal;
  const csrf = await guardCsrf(csrfToken);
  signal.throwIfAborted();
  if (!csrf.ok) return csrfDenied();
  const input = removeSchema.safeParse(raw);
  if (!input.success) return inputInvalid();
  const ctx = await createContext();
  signal.throwIfAborted();
  if (ctx.actor === null) return unauthenticated();
  return toClientResult(
    await removeChatKeys(ctx.db, { ...input.data, actorId: ctx.actor.id }, signal),
  );
}
