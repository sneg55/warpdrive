"use server";

import { z } from "zod";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import { db } from "@/db/client";
import { guardCsrf } from "@/features/identity/actions/shared";
import { SIG } from "@/features/identity/actions/sig";
import type { AuthUser } from "@/features/permissions/types";
import { createContext } from "@/server/trpc/context";
import { err, type Result } from "@/types/result";
import { markThreadRead, markThreadUnread } from "./readState";

const CSRF_FAIL = () => err(new AppError(ERROR_IDS.PERM_DENIED, "csrf check failed", {}));
const UNAUTH = () => err(new AppError(ERROR_IDS.AUTH_LOGIN_REJECTED, "unauthenticated", {}));

const readInput = z.object({ threadId: z.string().uuid() });

async function actor(csrfToken: string | null): Promise<Result<AuthUser, AppError>> {
  const csrf = await guardCsrf(csrfToken);
  if (!csrf.ok) return CSRF_FAIL();
  const ctx = await createContext();
  if (ctx.actor === null) return UNAUTH();
  return { ok: true, value: ctx.actor };
}

async function markRead(
  csrfToken: string | null,
  rawInput: unknown,
  op: typeof markThreadRead,
): Promise<Result<{ threadId: string }, AppError>> {
  const who = await actor(csrfToken);
  if (!who.ok) return who;
  const parsed = readInput.safeParse(rawInput);
  if (!parsed.success) {
    return err(
      new AppError(ERROR_IDS.GMAIL_READ_INPUT_INVALID, "invalid input", {
        issues: parsed.error.issues,
      }),
    );
  }
  return op(db, { actor: who.value, threadId: parsed.data.threadId }, SIG());
}

export async function markThreadReadAction(
  csrfToken: string | null,
  rawInput: unknown,
): Promise<Result<{ threadId: string }, AppError>> {
  return markRead(csrfToken, rawInput, markThreadRead);
}

export async function markThreadUnreadAction(
  csrfToken: string | null,
  rawInput: unknown,
): Promise<Result<{ threadId: string }, AppError>> {
  return markRead(csrfToken, rawInput, markThreadUnread);
}
