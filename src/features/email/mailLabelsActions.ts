"use server";

import { z } from "zod";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import { LABEL_COLORS } from "@/constants/labelColors";
import { db } from "@/db/client";
import { guardCsrf } from "@/features/identity/actions/shared";
import { SIG } from "@/features/identity/actions/sig";
import type { AuthUser } from "@/features/permissions/types";
import { createContext } from "@/server/trpc/context";
import { err, ok, type Result } from "@/types/result";
import { createMailLabel } from "./mailLabelsRepo";

// Inline "+ Add label" create (U6). Unlike the company label catalog (admin-gated), any
// authenticated user can create a mail label from the inbox picker, mirroring Gmail labels.
const createInput = z.object({
  name: z.string().trim().min(1).max(120),
  color: z.enum(LABEL_COLORS),
});

async function actor(csrfToken: string | null): Promise<Result<AuthUser, AppError>> {
  const csrf = await guardCsrf(csrfToken);
  if (!csrf.ok) return err(new AppError(ERROR_IDS.PERM_DENIED, "csrf check failed", {}));
  const ctx = await createContext();
  if (ctx.actor === null)
    return err(new AppError(ERROR_IDS.AUTH_LOGIN_REJECTED, "unauthenticated", {}));
  return ok(ctx.actor);
}

export async function createMailLabelAction(
  csrfToken: string | null,
  rawInput: unknown,
): Promise<Result<{ key: string; name: string }, AppError>> {
  const who = await actor(csrfToken);
  if (!who.ok) return who;
  const parsed = createInput.safeParse(rawInput);
  if (!parsed.success) {
    return err(
      new AppError(ERROR_IDS.GMAIL_MAIL_LABEL_INPUT_INVALID, "invalid mail label input", {
        issues: parsed.error.issues,
      }),
    );
  }
  const created = await createMailLabel(db, parsed.data, SIG());
  if (!created.ok) return created;
  return ok({ key: created.value.key, name: created.value.name });
}
