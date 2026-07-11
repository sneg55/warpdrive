"use server";

import { z } from "zod";
import { MAIL_FOLLOW_UP_STATUS, MAIL_LABELS } from "@/constants/email";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import { db } from "@/db/client";
import { guardCsrf } from "@/features/identity/actions/shared";
import { SIG } from "@/features/identity/actions/sig";
import type { AuthUser } from "@/features/permissions/types";
import { createContext } from "@/server/trpc/context";
import { err, ok, type Result } from "@/types/result";
import { setFollowUpStatus, setThreadLabels } from "./threadAttributes";

const followUpStatusInput = z.object({
  threadId: z.string().uuid(),
  status: z.enum(MAIL_FOLLOW_UP_STATUS),
});

const threadLabelsInput = z.object({
  threadId: z.string().uuid(),
  // Dedupe so repeated picks (e.g. a double-click race) persist the label once instead of
  // storing the same value multiple times in the labels array.
  labels: z.array(z.enum(MAIL_LABELS)).transform((labels) => Array.from(new Set(labels))),
});

async function actor(csrfToken: string | null): Promise<Result<AuthUser, AppError>> {
  const csrf = await guardCsrf(csrfToken);
  if (!csrf.ok) return err(new AppError(ERROR_IDS.PERM_DENIED, "csrf check failed", {}));
  const ctx = await createContext();
  if (ctx.actor === null)
    return err(new AppError(ERROR_IDS.AUTH_LOGIN_REJECTED, "unauthenticated", {}));
  return ok(ctx.actor);
}

export async function setFollowUpStatusAction(
  csrfToken: string | null,
  rawInput: unknown,
): Promise<Result<{ threadId: string }, AppError>> {
  const who = await actor(csrfToken);
  if (!who.ok) return who;
  const parsed = followUpStatusInput.safeParse(rawInput);
  if (!parsed.success) {
    return err(
      new AppError(ERROR_IDS.GMAIL_ATTR_INPUT_INVALID, "invalid follow-up status input", {
        issues: parsed.error.issues,
      }),
    );
  }
  return setFollowUpStatus(
    db,
    { actor: who.value, threadId: parsed.data.threadId, status: parsed.data.status },
    SIG(),
  );
}

export async function setThreadLabelsAction(
  csrfToken: string | null,
  rawInput: unknown,
): Promise<Result<{ threadId: string }, AppError>> {
  const who = await actor(csrfToken);
  if (!who.ok) return who;
  const parsed = threadLabelsInput.safeParse(rawInput);
  if (!parsed.success) {
    return err(
      new AppError(ERROR_IDS.GMAIL_ATTR_INPUT_INVALID, "invalid labels input", {
        issues: parsed.error.issues,
      }),
    );
  }
  return setThreadLabels(
    db,
    { actor: who.value, threadId: parsed.data.threadId, labels: parsed.data.labels },
    SIG(),
  );
}
