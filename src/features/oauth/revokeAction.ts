"use server";

import { z } from "zod";
import { ERROR_IDS } from "@/constants/errorIds";
import { guardCsrf } from "@/features/identity/actions/shared";
import { createContext } from "@/server/trpc/context";
import { revokeAllForClientUser } from "./tokens";

type RevokeResult = { ok: true } | { ok: false; error: { id: string } };

const clientIdInput = z.string().min(1).max(255);

export async function revokeConnectionAction(
  clientId: string,
  csrfToken: string | null = null,
): Promise<RevokeResult> {
  const csrf = await guardCsrf(csrfToken);
  if (!csrf.ok) return { ok: false, error: { id: ERROR_IDS.AUTH_STATE_MISMATCH } };

  const ctx = await createContext();
  if (ctx.actor === null) return { ok: false, error: { id: ERROR_IDS.AUTH_SESSION_DEAD } };
  const parsed = clientIdInput.safeParse(clientId);
  if (!parsed.success) return { ok: false, error: { id: ERROR_IDS.OAUTH_INVALID_CLIENT } };

  const signal = AbortSignal.timeout(10_000);
  await revokeAllForClientUser(ctx.db, parsed.data, ctx.actor.id, signal);
  signal.throwIfAborted();
  return { ok: true };
}
