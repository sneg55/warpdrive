"use server";

import { z } from "zod";
import { EMAIL_VISIBILITY } from "@/constants/email";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import { db } from "@/db/client";
import { guardCsrf } from "@/features/identity/actions/shared";
import { SIG } from "@/features/identity/actions/sig";
import type { AuthUser } from "@/features/permissions/types";
import { createContext } from "@/server/trpc/context";
import { err, ok, type Result } from "@/types/result";
import { setThreadVisibility } from "./threadVisibility";

const visibilityInput = z.object({
  threadId: z.string().uuid(),
  visibility: z.enum(EMAIL_VISIBILITY),
});

async function actor(csrfToken: string | null): Promise<Result<AuthUser, AppError>> {
  const csrf = await guardCsrf(csrfToken);
  if (!csrf.ok) return err(new AppError(ERROR_IDS.PERM_DENIED, "csrf check failed", {}));
  const ctx = await createContext();
  if (ctx.actor === null)
    return err(new AppError(ERROR_IDS.AUTH_LOGIN_REJECTED, "unauthenticated", {}));
  return ok(ctx.actor);
}

export async function setThreadVisibilityAction(
  csrfToken: string | null,
  rawInput: unknown,
): Promise<Result<{ threadId: string }, AppError>> {
  const who = await actor(csrfToken);
  if (!who.ok) return who;
  const parsed = visibilityInput.safeParse(rawInput);
  if (!parsed.success) {
    return err(
      new AppError(ERROR_IDS.GMAIL_VISIBILITY_INPUT_INVALID, "invalid visibility input", {
        issues: parsed.error.issues,
      }),
    );
  }
  return setThreadVisibility(
    db,
    { actor: who.value, threadId: parsed.data.threadId, visibility: parsed.data.visibility },
    SIG(),
  );
}
