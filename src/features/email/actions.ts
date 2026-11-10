"use server";

import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { z } from "zod";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import { db } from "@/db/client";
import { makeStorageClient } from "@/features/files/storage";
import { guardCsrf } from "@/features/identity/actions/shared";
import { SIG } from "@/features/identity/actions/sig";
import { createContext } from "@/server/trpc/context";
import { type ActionResult, clientErr, toClientResult } from "@/types/actionResult";
import { ok } from "@/types/result";
import { softDisconnectMailbox } from "./disconnect";
import { createGmailClient, type GmailClient } from "./gmailClient";
import { makeRefresh } from "./gmailRefresh";
import { mailboxAccessPredicate } from "./mailboxAccess";
import { assertMailboxOwner } from "./mailboxOwnership";
import { buildAuthUrl, GMAIL_OAUTH_STATE_COOKIE } from "./oauth";
import { sendEmail as orchestrateSend, type SendEmailInput, sendEmailInput } from "./send";
import { isFutureScheduledSend } from "./sendScheduling";
import { assertMailboxManager } from "./teamMailboxAdmin";
import { trashThread } from "./threadTrash";
import { ensureAccessToken } from "./tokens";

function scheduledStubGmail(): GmailClient {
  const unreachable = (): never => {
    throw new AppError("E_GMAIL_009", "Gmail called on the future-scheduled send path", {});
  };
  return {
    sendRaw: unreachable,
    historyList: unreachable,
    getMessage: unreachable,
    getThread: unreachable,
    searchByRfc822: unreachable,
    getAttachment: unreachable,
    listMessages: unreachable,
    getProfile: unreachable,
    trashThread: unreachable,
  };
}

export async function sendEmail(
  csrfToken: string | null,
  rawInput: unknown,
): Promise<ActionResult<{ status: string; messageId?: string }>> {
  const csrf = await guardCsrf(csrfToken);
  if (!csrf.ok) return clientErr(new AppError("E_PERM_001", "csrf check failed", {}));

  const ctx = await createContext();
  if (ctx.actor === null) return clientErr(new AppError("E_PERM_001", "unauthenticated", {}));

  const parsed = sendEmailInput.safeParse(rawInput);
  if (!parsed.success) {
    return clientErr(
      new AppError("E_GMAIL_009", "invalid send input", { issues: parsed.error.issues }),
    );
  }
  const input: SendEmailInput = parsed.data;

  const signal = AbortSignal.timeout(8000);
  const owner = await assertMailboxOwner(db, input.accountId, ctx.actor.id, signal);
  if (!owner.ok) return clientErr(owner.error);

  if (isFutureScheduledSend(input.scheduledSendAt, Date.now())) {
    return toClientResult(
      await orchestrateSend(db, {
        actorId: ctx.actor.id,
        actorType: ctx.actor.type,
        actorGroupIds: ctx.actor.groupIds,
        gmail: scheduledStubGmail(),
        storage: makeStorageClient(),
        input,
        signal,
      }),
    );
  }

  const token = await ensureAccessToken(db, {
    accountId: input.accountId,
    deps: { refresh: makeRefresh(signal) },
  });
  if (!token.ok) return clientErr(token.error);

  const gmail = createGmailClient(token.value.token);
  return toClientResult(
    await orchestrateSend(db, {
      actorId: ctx.actor.id,
      actorType: ctx.actor.type,
      actorGroupIds: ctx.actor.groupIds,
      gmail,
      storage: makeStorageClient(),
      input,
      signal,
    }),
  );
}

export async function trashThreadAction(
  csrfToken: string | null,
  rawInput: unknown,
): Promise<ActionResult<{ threadId: string }>> {
  const csrf = await guardCsrf(csrfToken);
  if (!csrf.ok) return clientErr(new AppError(ERROR_IDS.PERM_DENIED, "csrf check failed", {}));

  const ctx = await createContext();
  if (ctx.actor === null)
    return clientErr(new AppError(ERROR_IDS.PERM_DENIED, "unauthenticated", {}));

  const parsed = z.object({ threadId: z.string().uuid() }).safeParse(rawInput);
  if (!parsed.success) {
    return clientErr(
      new AppError(ERROR_IDS.GMAIL_TRASH_INPUT_INVALID, "invalid trash input", {
        issues: parsed.error.issues,
      }),
    );
  }

  const signal = SIG();
  const acct = (
    await db.execute(sql`
      SELECT a.id FROM email_threads t JOIN email_accounts a ON a.id = t.account_id
      WHERE t.id = ${parsed.data.threadId} AND ${mailboxAccessPredicate(ctx.actor.id)}
    `)
  ).rows[0] as { id: string } | undefined;
  signal.throwIfAborted();
  if (acct === undefined)
    return clientErr(new AppError(ERROR_IDS.GMAIL_THREAD_NOT_FOUND, "thread not found", {}));

  const token = await ensureAccessToken(db, {
    accountId: acct.id,
    deps: { refresh: makeRefresh(signal) },
  });
  if (!token.ok) return clientErr(token.error);

  const gmail = createGmailClient(token.value.token);
  return toClientResult(
    await trashThread(db, { actor: ctx.actor, threadId: parsed.data.threadId, gmail }, signal),
  );
}

export async function connectGmailStart(): Promise<{ url: string }> {
  const ctx = await createContext();
  if (ctx.session === null) {
    throw new AppError("E_AUTH_001", "connectGmailStart called without a session", {});
  }

  const state = randomUUID();
  const jar = await cookies();
  jar.set(GMAIL_OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });

  return { url: buildAuthUrl({ userId: ctx.session.userId, state }) };
}

const disconnectMailboxInput = z.object({ accountId: z.string().uuid() });

export async function disconnectMailboxAction(
  csrfToken: string | null,
  rawInput: unknown,
): Promise<ActionResult<{ disconnected: true }>> {
  const csrf = await guardCsrf(csrfToken);
  if (!csrf.ok) return clientErr(new AppError("E_PERM_001", "csrf check failed", {}));

  const ctx = await createContext();
  if (ctx.actor === null) return clientErr(new AppError("E_PERM_001", "unauthenticated", {}));

  const parsed = disconnectMailboxInput.safeParse(rawInput);
  if (!parsed.success) {
    return clientErr(
      new AppError("E_GMAIL_013", "invalid disconnect input", { issues: parsed.error.issues }),
    );
  }

  const signal = SIG();
  const owner = await assertMailboxManager(db, ctx.actor.id, parsed.data.accountId, signal);
  if (!owner.ok) return clientErr(owner.error);

  await softDisconnectMailbox(db, parsed.data.accountId, signal);
  return ok({ disconnected: true });
}
