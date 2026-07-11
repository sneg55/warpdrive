"use server";

import { z } from "zod";
import { AppError } from "@/constants/errorIds";
import { db } from "@/db/client";
import { guardCsrf } from "@/features/identity/actions/shared";
import { SIG } from "@/features/identity/actions/sig";
import { createContext } from "@/server/trpc/context";
import { err, type Result } from "@/types/result";
import {
  createSignature,
  createTemplate,
  deleteSignature,
  deleteTemplate,
  deleteTemplates,
  reorderTemplates,
  setDefaultSignature,
  updateSignature,
  updateTemplate,
} from "./authoring";

const templateInput = z.object({
  name: z.string().min(1),
  subject: z.string().optional(),
  bodyHtml: z.string(),
  isShared: z.boolean(),
});

// Signature name caps at 40 chars for Pipedrive parity (S1); the client mirrors the cap + hint.
const signatureInput = z.object({
  name: z.string().min(1).max(40),
  bodyHtml: z.string(),
  isDefault: z.boolean(),
});

// Bound the bulk arrays so an authenticated caller cannot force thousands of per-row updates or
// blow past Postgres's bind-parameter limit. 500 is far above any real template count. IDs are
// deduplicated so a repeated id cannot inflate the work.
const boundedIds = z
  .array(z.string().uuid())
  .max(500)
  .transform((ids) => [...new Set(ids)]);
const reorderTemplatesInput = z.object({ orderedIds: boundedIds });
const deleteTemplatesInput = z.object({ ids: boundedIds });

const setDefaultInput = z.object({ signatureId: z.string().uuid() });

const templatePatch = z.object({
  name: z.string().min(1).optional(),
  subject: z.string().optional(),
  bodyHtml: z.string().optional(),
  isShared: z.boolean().optional(),
});
const updateTemplateInput = z.object({ id: z.string().uuid(), patch: templatePatch });
const idInput = z.object({ id: z.string().uuid() });
// Note: no .max(40) on the patch name (unlike create). A signature created before the S1 cap can
// have a longer name; the edit form resends that name on every save, so capping here would lock the
// user out of editing legacy signatures. New input is bounded by the client's maxLength=40 instead.
const signaturePatch = z.object({
  name: z.string().min(1).optional(),
  bodyHtml: z.string().optional(),
  isDefault: z.boolean().optional(),
});
const updateSignatureInput = z.object({ id: z.string().uuid(), patch: signaturePatch });

// Each wrapper: CSRF first (before any DB/actor work), then the actor from the trusted
// context (NEVER client input for ownerId/userId), then Zod-validate. canShare is
// derived from the actor's flags; the service stays capability-agnostic.

export async function createTemplateAction(
  csrfToken: string | null,
  rawInput: unknown,
): Promise<Result<{ id: string }, AppError>> {
  const csrf = await guardCsrf(csrfToken);
  if (!csrf.ok) return err(new AppError("E_PERM_001", "csrf check failed", {}));
  const ctx = await createContext();
  if (ctx.actor === null) return err(new AppError("E_AUTH_001", "unauthenticated", {}));

  const parsed = templateInput.safeParse(rawInput);
  if (!parsed.success) {
    return err(
      new AppError("E_GMAIL_010", "invalid template input", { issues: parsed.error.issues }),
    );
  }
  // Admins bypass the flag (they carry no explicit flags), matching the saved-filter share gate.
  const canShare = ctx.actor.type === "admin" || ctx.actor.flags.has("filter.share");
  return createTemplate(db, { ownerId: ctx.actor.id, canShare, ...parsed.data }, SIG());
}

export async function createSignatureAction(
  csrfToken: string | null,
  rawInput: unknown,
): Promise<Result<{ id: string }, AppError>> {
  const csrf = await guardCsrf(csrfToken);
  if (!csrf.ok) return err(new AppError("E_PERM_001", "csrf check failed", {}));
  const ctx = await createContext();
  if (ctx.actor === null) return err(new AppError("E_AUTH_001", "unauthenticated", {}));

  const parsed = signatureInput.safeParse(rawInput);
  if (!parsed.success) {
    return err(
      new AppError("E_GMAIL_010", "invalid signature input", { issues: parsed.error.issues }),
    );
  }
  return createSignature(db, { userId: ctx.actor.id, ...parsed.data }, SIG());
}

export async function setDefaultSignatureAction(
  csrfToken: string | null,
  rawInput: unknown,
): Promise<Result<void, AppError>> {
  const csrf = await guardCsrf(csrfToken);
  if (!csrf.ok) return err(new AppError("E_PERM_001", "csrf check failed", {}));
  const ctx = await createContext();
  if (ctx.actor === null) return err(new AppError("E_AUTH_001", "unauthenticated", {}));

  const parsed = setDefaultInput.safeParse(rawInput);
  if (!parsed.success) {
    return err(
      new AppError("E_GMAIL_010", "invalid signature id", { issues: parsed.error.issues }),
    );
  }
  return setDefaultSignature(
    db,
    { userId: ctx.actor.id, signatureId: parsed.data.signatureId },
    SIG(),
  );
}

export async function updateTemplateAction(
  csrfToken: string | null,
  rawInput: unknown,
): Promise<Result<void, AppError>> {
  const csrf = await guardCsrf(csrfToken);
  if (!csrf.ok) return err(new AppError("E_PERM_001", "csrf check failed", {}));
  const ctx = await createContext();
  if (ctx.actor === null) return err(new AppError("E_AUTH_001", "unauthenticated", {}));
  const parsed = updateTemplateInput.safeParse(rawInput);
  if (!parsed.success) {
    return err(
      new AppError("E_GMAIL_010", "invalid template input", { issues: parsed.error.issues }),
    );
  }
  // Admins bypass the flag (they carry no explicit flags), matching the saved-filter share gate.
  const canShare = ctx.actor.type === "admin" || ctx.actor.flags.has("filter.share");
  return updateTemplate(
    db,
    { id: parsed.data.id, actorId: ctx.actor.id, canShare, patch: parsed.data.patch },
    SIG(),
  );
}

export async function deleteTemplateAction(
  csrfToken: string | null,
  rawInput: unknown,
): Promise<Result<void, AppError>> {
  const csrf = await guardCsrf(csrfToken);
  if (!csrf.ok) return err(new AppError("E_PERM_001", "csrf check failed", {}));
  const ctx = await createContext();
  if (ctx.actor === null) return err(new AppError("E_AUTH_001", "unauthenticated", {}));
  const parsed = idInput.safeParse(rawInput);
  if (!parsed.success) {
    return err(new AppError("E_GMAIL_010", "invalid template id", { issues: parsed.error.issues }));
  }
  return deleteTemplate(db, { id: parsed.data.id, actorId: ctx.actor.id }, SIG());
}

export async function reorderTemplatesAction(
  csrfToken: string | null,
  rawInput: unknown,
): Promise<Result<{ reordered: number }, AppError>> {
  const csrf = await guardCsrf(csrfToken);
  if (!csrf.ok) return err(new AppError("E_PERM_001", "csrf check failed", {}));
  const ctx = await createContext();
  if (ctx.actor === null) return err(new AppError("E_AUTH_001", "unauthenticated", {}));
  const parsed = reorderTemplatesInput.safeParse(rawInput);
  if (!parsed.success) {
    return err(
      new AppError("E_GMAIL_010", "invalid reorder input", { issues: parsed.error.issues }),
    );
  }
  return reorderTemplates(db, { actorId: ctx.actor.id, orderedIds: parsed.data.orderedIds }, SIG());
}

export async function deleteTemplatesAction(
  csrfToken: string | null,
  rawInput: unknown,
): Promise<Result<{ deleted: number }, AppError>> {
  const csrf = await guardCsrf(csrfToken);
  if (!csrf.ok) return err(new AppError("E_PERM_001", "csrf check failed", {}));
  const ctx = await createContext();
  if (ctx.actor === null) return err(new AppError("E_AUTH_001", "unauthenticated", {}));
  const parsed = deleteTemplatesInput.safeParse(rawInput);
  if (!parsed.success) {
    return err(
      new AppError("E_GMAIL_010", "invalid delete input", { issues: parsed.error.issues }),
    );
  }
  return deleteTemplates(db, { actorId: ctx.actor.id, ids: parsed.data.ids }, SIG());
}

export async function updateSignatureAction(
  csrfToken: string | null,
  rawInput: unknown,
): Promise<Result<void, AppError>> {
  const csrf = await guardCsrf(csrfToken);
  if (!csrf.ok) return err(new AppError("E_PERM_001", "csrf check failed", {}));
  const ctx = await createContext();
  if (ctx.actor === null) return err(new AppError("E_AUTH_001", "unauthenticated", {}));
  const parsed = updateSignatureInput.safeParse(rawInput);
  if (!parsed.success) {
    return err(
      new AppError("E_GMAIL_010", "invalid signature input", { issues: parsed.error.issues }),
    );
  }
  return updateSignature(
    db,
    { id: parsed.data.id, userId: ctx.actor.id, patch: parsed.data.patch },
    SIG(),
  );
}

export async function deleteSignatureAction(
  csrfToken: string | null,
  rawInput: unknown,
): Promise<Result<void, AppError>> {
  const csrf = await guardCsrf(csrfToken);
  if (!csrf.ok) return err(new AppError("E_PERM_001", "csrf check failed", {}));
  const ctx = await createContext();
  if (ctx.actor === null) return err(new AppError("E_AUTH_001", "unauthenticated", {}));
  const parsed = idInput.safeParse(rawInput);
  if (!parsed.success) {
    return err(
      new AppError("E_GMAIL_010", "invalid signature id", { issues: parsed.error.issues }),
    );
  }
  return deleteSignature(db, { id: parsed.data.id, userId: ctx.actor.id }, SIG());
}
