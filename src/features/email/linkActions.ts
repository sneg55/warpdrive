"use server";

import { z } from "zod";
import { AppError } from "@/constants/errorIds";
import { db } from "@/db/client";
import { guardCsrf } from "@/features/identity/actions/shared";
import { SIG } from "@/features/identity/actions/sig";
import { createContext } from "@/server/trpc/context";
import { type ActionResult, clientErr, toClientResult } from "@/types/actionResult";
import { applyThreadLink } from "./linkThread";

const linkInput = z.object({
  threadId: z.string().uuid(),
  personId: z.string().uuid().nullable().optional(),
  dealId: z.string().uuid().nullable().optional(),
});

// Thin "use server" wrapper: CSRF FIRST (before any DB/actor work), then the actor from
// the trusted context (never client identity), Zod-validate, then delegate to the plain,
// testable applyThreadLink for the authz + update.
export async function linkThread(
  csrfToken: string | null,
  rawInput: unknown,
): Promise<ActionResult<{ threadId: string }>> {
  const csrf = await guardCsrf(csrfToken);
  if (!csrf.ok) return clientErr(new AppError("E_PERM_001", "csrf check failed", {}));
  const ctx = await createContext();
  if (ctx.actor === null) return clientErr(new AppError("E_AUTH_001", "unauthenticated", {}));

  const parsed = linkInput.safeParse(rawInput);
  if (!parsed.success) {
    return clientErr(
      new AppError("E_GMAIL_010", "invalid link input", { issues: parsed.error.issues }),
    );
  }

  return toClientResult(
    await applyThreadLink(
      db,
      {
        actor: ctx.actor,
        threadId: parsed.data.threadId,
        personId: parsed.data.personId,
        dealId: parsed.data.dealId,
      },
      SIG(),
    ),
  );
}
