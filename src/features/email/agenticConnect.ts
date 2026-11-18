"use server";

import { env } from "@/config/env";
import { AGENTIC_ACTION_TIMEOUT_MS, AGENTIC_ENQUEUE_TIMEOUT_MS } from "@/constants/email";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import { guardCsrf } from "@/features/identity/actions/shared";
import { requireBoss } from "@/jobs/requireBoss";
import { createContext } from "@/server/trpc/context";
import { type ActionResult, clientErr, toClientResult } from "@/types/actionResult";
import {
  type AgenticEnqueue,
  connectAgenticMailbox,
  reconnectAgenticMailbox,
} from "./agenticConnectCore";
import { agenticConnectSchema, agenticReconnectSchema } from "./agenticConnectSchema";
import { enqueueInitialSync } from "./syncScheduling";
import { enqueueTeamBackfill } from "./teamBackfillJobs";

const enqueue: AgenticEnqueue = {
  sync: enqueueInitialSync,
  backfill: async (accountId) => {
    const boss = requireBoss();
    if (boss !== null)
      await enqueueTeamBackfill(boss, accountId, AbortSignal.timeout(AGENTIC_ENQUEUE_TIMEOUT_MS));
  },
};

async function authorize(
  csrfToken: string | null,
): Promise<{ ok: true; actorId: string; db: Db } | ActionResult<never>> {
  const csrf = await guardCsrf(csrfToken);
  if (!csrf.ok) return clientErr(new AppError(ERROR_IDS.PERM_DENIED, "csrf check failed", {}));
  const ctx = await createContext();
  return ctx.actor === null
    ? clientErr(new AppError(ERROR_IDS.PERM_DENIED, "unauthenticated", {}))
    : { ok: true, actorId: ctx.actor.id, db: ctx.db };
}

export async function connectAgenticInbox(
  csrfToken: string | null,
  raw: unknown,
): Promise<ActionResult<{ accountId: string }>> {
  const signal = AbortSignal.timeout(AGENTIC_ACTION_TIMEOUT_MS);
  const auth = await authorize(csrfToken);
  if (!("actorId" in auth)) return auth;
  const input = agenticConnectSchema.safeParse(raw);
  if (!input.success) {
    return clientErr(
      new AppError(ERROR_IDS.GMAIL_TEAM_MAILBOX_INPUT_INVALID, "invalid agentic inbox input", {}),
    );
  }
  return toClientResult(
    await connectAgenticMailbox(
      auth.db,
      { ...input.data, enabled: env.AGENTIC_INBOX_ENABLED, actorId: auth.actorId },
      enqueue,
      signal,
    ),
  );
}

export async function reconnectAgenticInbox(
  csrfToken: string | null,
  raw: unknown,
): Promise<ActionResult<{ accountId: string }>> {
  const signal = AbortSignal.timeout(AGENTIC_ACTION_TIMEOUT_MS);
  const auth = await authorize(csrfToken);
  if (!("actorId" in auth)) return auth;
  const input = agenticReconnectSchema.safeParse(raw);
  if (!input.success) {
    return clientErr(
      new AppError(ERROR_IDS.GMAIL_TEAM_MAILBOX_INPUT_INVALID, "invalid agentic inbox input", {}),
    );
  }
  return toClientResult(
    await reconnectAgenticMailbox(
      auth.db,
      { ...input.data, enabled: env.AGENTIC_INBOX_ENABLED, actorId: auth.actorId },
      enqueue,
      signal,
    ),
  );
}
