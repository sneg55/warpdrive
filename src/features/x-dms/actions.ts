"use server";

import { cookies } from "next/headers";
import { z } from "zod";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import { X_OAUTH_INTENT_MAX_AGE, X_OAUTH_STATE_COOKIE } from "@/constants/xDms";
import { guardCsrf } from "@/features/identity/actions/shared";
import { createContext } from "@/server/trpc/context";
import { type ActionResult, clientErr, toClientResult } from "@/types/actionResult";
import { ok } from "@/types/result";
import { disconnectXAccount, setXAccountMembers, updateXAccount } from "./accountAdmin";
import { xClientFromEnv } from "./clientFromEnv";
import { createXOAuthIntent } from "./oauthIntent";
import { sendXReply } from "./send";
import { sendErrorForClient } from "./sendClientError";

const accountSchema = z.object({ accountId: z.uuid() });
const membersSchema = accountSchema.extend({ userIds: z.array(z.uuid()) });
const sendSchema = z.object({ conversationId: z.uuid(), text: z.string() });
const settingsSchema = accountSchema.extend({
  displayName: z.string().trim().min(1).max(200),
  overdueAfterHours: z.number().int().min(1).max(8760),
});

const csrfDenied = () => clientErr(new AppError(ERROR_IDS.PERM_DENIED, "csrf check failed", {}));
const inputInvalid = () =>
  clientErr(new AppError(ERROR_IDS.X_INPUT_INVALID, "invalid x account input", {}));
const unauthenticated = () => clientErr(new AppError(ERROR_IDS.PERM_DENIED, "unauthenticated", {}));

export async function connectXAccountStart(
  csrfToken: string | null,
): Promise<ActionResult<{ url: string }>> {
  const signal = new AbortController().signal;
  const csrf = await guardCsrf(csrfToken);
  signal.throwIfAborted();
  if (!csrf.ok) return csrfDenied();
  const ctx = await createContext();
  signal.throwIfAborted();
  if (ctx.session === null) return unauthenticated();
  const intent = await createXOAuthIntent(
    ctx.db,
    { actorId: ctx.session.userId, sessionId: ctx.session.sessionId },
    signal,
  );
  if (!intent.ok) return clientErr(intent.error);
  const jar = await cookies();
  signal.throwIfAborted();
  jar.set(X_OAUTH_STATE_COOKIE, intent.value.state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: X_OAUTH_INTENT_MAX_AGE,
  });
  return ok({ url: intent.value.authorizeUrl });
}

export async function updateXAccountAction(
  raw: unknown,
  csrfToken: string | null,
): Promise<ActionResult<void>> {
  const signal = new AbortController().signal;
  const csrf = await guardCsrf(csrfToken);
  signal.throwIfAborted();
  if (!csrf.ok) return csrfDenied();
  const input = settingsSchema.safeParse(raw);
  if (!input.success) return inputInvalid();
  const ctx = await createContext();
  signal.throwIfAborted();
  if (ctx.actor === null) return unauthenticated();
  return toClientResult(
    await updateXAccount(ctx.db, { ...input.data, actorId: ctx.actor.id }, signal),
  );
}

export async function setXAccountMembersAction(
  raw: unknown,
  csrfToken: string | null,
): Promise<ActionResult<void>> {
  const signal = new AbortController().signal;
  const csrf = await guardCsrf(csrfToken);
  signal.throwIfAborted();
  if (!csrf.ok) return csrfDenied();
  const input = membersSchema.safeParse(raw);
  if (!input.success) return inputInvalid();
  const ctx = await createContext();
  signal.throwIfAborted();
  if (ctx.actor === null) return unauthenticated();
  return toClientResult(
    await setXAccountMembers(ctx.db, { ...input.data, actorId: ctx.actor.id }, signal),
  );
}

export async function disconnectXAccountAction(
  raw: unknown,
  csrfToken: string | null,
): Promise<ActionResult<void>> {
  const signal = new AbortController().signal;
  const csrf = await guardCsrf(csrfToken);
  signal.throwIfAborted();
  if (!csrf.ok) return csrfDenied();
  const input = accountSchema.safeParse(raw);
  if (!input.success) return inputInvalid();
  const client = xClientFromEnv();
  if (client === null)
    return clientErr(
      new AppError(ERROR_IDS.X_OAUTH_FAILED, "X direct messages are not configured", {}),
    );
  const ctx = await createContext();
  signal.throwIfAborted();
  if (ctx.actor === null) return unauthenticated();
  return toClientResult(
    await disconnectXAccount(ctx.db, client, { ...input.data, actorId: ctx.actor.id }, signal),
  );
}

export async function sendXReplyAction(
  raw: unknown,
  csrfToken: string | null,
): Promise<ActionResult<{ messageId: string }>> {
  const signal = new AbortController().signal;
  const csrf = await guardCsrf(csrfToken);
  signal.throwIfAborted();
  if (!csrf.ok) return csrfDenied();
  const input = sendSchema.safeParse(raw);
  if (!input.success) return inputInvalid();
  const client = xClientFromEnv();
  if (client === null)
    return clientErr(
      new AppError(ERROR_IDS.X_OAUTH_FAILED, "X direct messages are not configured", {}),
    );
  const ctx = await createContext();
  signal.throwIfAborted();
  if (ctx.actor === null) return unauthenticated();
  const result = await sendXReply(
    { db: ctx.db, client },
    { ...input.data, actorId: ctx.actor.id },
    signal,
  );
  return result.ok ? result : sendErrorForClient(result.error);
}
