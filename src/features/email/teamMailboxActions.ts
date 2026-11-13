"use server";

import { cookies } from "next/headers";
import { z } from "zod";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import { TEAM_MAILBOX_INTENT_MAX_AGE } from "@/constants/teamMailbox";
import { guardCsrf } from "@/features/identity/actions/shared";
import { createContext } from "@/server/trpc/context";
import { type ActionResult, clientErr, toClientResult } from "@/types/actionResult";
import { ok } from "@/types/result";
import { buildAuthUrl, GMAIL_OAUTH_STATE_COOKIE } from "./oauth";
import { updateTeamMailbox } from "./teamMailboxAdmin";
import { createTeamMailboxIntent } from "./teamMailboxIntent";
import { setTeamMailboxMembers } from "./teamMailboxMembers";

const membersSchema = z.object({ accountId: z.uuid(), userIds: z.array(z.uuid()) });
const connectSchema = z.object({
  backfillDays: z.union([z.literal(30), z.literal(90), z.literal(180)]),
  loginHint: z.email().optional(),
});
const settingsSchema = z.object({
  accountId: z.uuid(),
  displayName: z.string().trim().min(1).max(200),
  overdueAfterHours: z.number().int().positive().max(8760),
});

export async function connectTeamMailboxStart(
  raw: unknown,
  csrfToken: string | null,
): Promise<ActionResult<{ url: string }>> {
  const signal = new AbortController().signal;
  const csrf = await guardCsrf(csrfToken);
  signal.throwIfAborted();
  if (!csrf.ok) return clientErr(new AppError(ERROR_IDS.PERM_DENIED, "csrf check failed", {}));
  const input = connectSchema.safeParse(raw);
  if (!input.success)
    return clientErr(
      new AppError(ERROR_IDS.GMAIL_TEAM_MAILBOX_INPUT_INVALID, "invalid team mailbox input", {}),
    );
  const ctx = await createContext();
  signal.throwIfAborted();
  if (ctx.session === null)
    return clientErr(new AppError(ERROR_IDS.PERM_DENIED, "unauthenticated", {}));
  const state = await createTeamMailboxIntent(
    ctx.db,
    {
      actorId: ctx.session.userId,
      sessionId: ctx.session.sessionId,
      backfillDays: input.data.backfillDays,
    },
    signal,
  );
  if (!state.ok) return clientErr(state.error);
  const jar = await cookies();
  signal.throwIfAborted();
  jar.set(GMAIL_OAUTH_STATE_COOKIE, state.value, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: TEAM_MAILBOX_INTENT_MAX_AGE,
  });
  return ok({
    url: buildAuthUrl({
      userId: ctx.session.userId,
      state: state.value,
      team: true,
      loginHint: input.data.loginHint,
    }),
  });
}

export async function updateTeamMailboxAction(
  raw: unknown,
  csrfToken: string | null,
): Promise<ActionResult<void>> {
  const signal = new AbortController().signal;
  const csrf = await guardCsrf(csrfToken);
  signal.throwIfAborted();
  if (!csrf.ok) return clientErr(new AppError(ERROR_IDS.PERM_DENIED, "csrf check failed", {}));
  const input = settingsSchema.safeParse(raw);
  if (!input.success)
    return clientErr(
      new AppError(ERROR_IDS.GMAIL_TEAM_MAILBOX_INPUT_INVALID, "invalid team mailbox input", {}),
    );
  const ctx = await createContext();
  signal.throwIfAborted();
  if (ctx.actor === null)
    return clientErr(new AppError(ERROR_IDS.PERM_DENIED, "unauthenticated", {}));
  return toClientResult(
    await updateTeamMailbox(ctx.db, { ...input.data, actorId: ctx.actor.id }, signal),
  );
}

export async function setTeamMailboxMembersAction(
  raw: unknown,
  csrfToken: string | null,
): Promise<ActionResult<void>> {
  const signal = new AbortController().signal;
  const csrf = await guardCsrf(csrfToken);
  signal.throwIfAborted();
  if (!csrf.ok) return clientErr(new AppError(ERROR_IDS.PERM_DENIED, "csrf check failed", {}));
  const input = membersSchema.safeParse(raw);
  if (!input.success)
    return clientErr(
      new AppError(ERROR_IDS.GMAIL_TEAM_MAILBOX_INPUT_INVALID, "invalid members", {}),
    );
  const ctx = await createContext();
  signal.throwIfAborted();
  if (ctx.actor === null)
    return clientErr(new AppError(ERROR_IDS.PERM_DENIED, "unauthenticated", {}));
  return toClientResult(
    await setTeamMailboxMembers(ctx.db, { ...input.data, actorId: ctx.actor.id }, signal),
  );
}
