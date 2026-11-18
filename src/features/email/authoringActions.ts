"use server";

import { z } from "zod";
import { AppError } from "@/constants/errorIds";
import { db } from "@/db/client";
import { guardCsrf } from "@/features/identity/actions/shared";
import { SIG } from "@/features/identity/actions/sig";
import { createContext } from "@/server/trpc/context";
import { type ActionResult, clientErr, toClientResult } from "@/types/actionResult";
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

const signatureInput = z.object({
  name: z.string().min(1).max(40),
  bodyHtml: z.string(),
  isDefault: z.boolean(),
});

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
const signaturePatch = z.object({
  name: z.string().min(1).optional(),
  bodyHtml: z.string().optional(),
  isDefault: z.boolean().optional(),
});
const updateSignatureInput = z.object({ id: z.string().uuid(), patch: signaturePatch });

export async function createTemplateAction(
  csrfToken: string | null,
  rawInput: unknown,
): Promise<ActionResult<{ id: string }>> {
  const csrf = await guardCsrf(csrfToken);
  if (!csrf.ok) return clientErr(new AppError("E_PERM_001", "csrf check failed", {}));
  const ctx = await createContext();
  if (ctx.actor === null) return clientErr(new AppError("E_AUTH_001", "unauthenticated", {}));

  const parsed = templateInput.safeParse(rawInput);
  if (!parsed.success) {
    return clientErr(
      new AppError("E_GMAIL_010", "invalid template input", { issues: parsed.error.issues }),
    );
  }
  const canShare = ctx.actor.type === "admin" || ctx.actor.flags.has("filter.share");
  return toClientResult(
    await createTemplate(db, { ownerId: ctx.actor.id, canShare, ...parsed.data }, SIG()),
  );
}

export async function createSignatureAction(
  csrfToken: string | null,
  rawInput: unknown,
): Promise<ActionResult<{ id: string }>> {
  const csrf = await guardCsrf(csrfToken);
  if (!csrf.ok) return clientErr(new AppError("E_PERM_001", "csrf check failed", {}));
  const ctx = await createContext();
  if (ctx.actor === null) return clientErr(new AppError("E_AUTH_001", "unauthenticated", {}));

  const parsed = signatureInput.safeParse(rawInput);
  if (!parsed.success) {
    return clientErr(
      new AppError("E_GMAIL_010", "invalid signature input", { issues: parsed.error.issues }),
    );
  }
  return toClientResult(await createSignature(db, { userId: ctx.actor.id, ...parsed.data }, SIG()));
}

export async function setDefaultSignatureAction(
  csrfToken: string | null,
  rawInput: unknown,
): Promise<ActionResult<void>> {
  const csrf = await guardCsrf(csrfToken);
  if (!csrf.ok) return clientErr(new AppError("E_PERM_001", "csrf check failed", {}));
  const ctx = await createContext();
  if (ctx.actor === null) return clientErr(new AppError("E_AUTH_001", "unauthenticated", {}));

  const parsed = setDefaultInput.safeParse(rawInput);
  if (!parsed.success) {
    return clientErr(
      new AppError("E_GMAIL_010", "invalid signature id", { issues: parsed.error.issues }),
    );
  }
  return toClientResult(
    await setDefaultSignature(
      db,
      { userId: ctx.actor.id, signatureId: parsed.data.signatureId },
      SIG(),
    ),
  );
}

export async function updateTemplateAction(
  csrfToken: string | null,
  rawInput: unknown,
): Promise<ActionResult<void>> {
  const csrf = await guardCsrf(csrfToken);
  if (!csrf.ok) return clientErr(new AppError("E_PERM_001", "csrf check failed", {}));
  const ctx = await createContext();
  if (ctx.actor === null) return clientErr(new AppError("E_AUTH_001", "unauthenticated", {}));
  const parsed = updateTemplateInput.safeParse(rawInput);
  if (!parsed.success) {
    return clientErr(
      new AppError("E_GMAIL_010", "invalid template input", { issues: parsed.error.issues }),
    );
  }
  const canShare = ctx.actor.type === "admin" || ctx.actor.flags.has("filter.share");
  return toClientResult(
    await updateTemplate(
      db,
      { id: parsed.data.id, actorId: ctx.actor.id, canShare, patch: parsed.data.patch },
      SIG(),
    ),
  );
}

export async function deleteTemplateAction(
  csrfToken: string | null,
  rawInput: unknown,
): Promise<ActionResult<void>> {
  const csrf = await guardCsrf(csrfToken);
  if (!csrf.ok) return clientErr(new AppError("E_PERM_001", "csrf check failed", {}));
  const ctx = await createContext();
  if (ctx.actor === null) return clientErr(new AppError("E_AUTH_001", "unauthenticated", {}));
  const parsed = idInput.safeParse(rawInput);
  if (!parsed.success) {
    return clientErr(
      new AppError("E_GMAIL_010", "invalid template id", { issues: parsed.error.issues }),
    );
  }
  return toClientResult(
    await deleteTemplate(db, { id: parsed.data.id, actorId: ctx.actor.id }, SIG()),
  );
}

export async function reorderTemplatesAction(
  csrfToken: string | null,
  rawInput: unknown,
): Promise<ActionResult<{ reordered: number }>> {
  const csrf = await guardCsrf(csrfToken);
  if (!csrf.ok) return clientErr(new AppError("E_PERM_001", "csrf check failed", {}));
  const ctx = await createContext();
  if (ctx.actor === null) return clientErr(new AppError("E_AUTH_001", "unauthenticated", {}));
  const parsed = reorderTemplatesInput.safeParse(rawInput);
  if (!parsed.success) {
    return clientErr(
      new AppError("E_GMAIL_010", "invalid reorder input", { issues: parsed.error.issues }),
    );
  }
  return toClientResult(
    await reorderTemplates(
      db,
      { actorId: ctx.actor.id, orderedIds: parsed.data.orderedIds },
      SIG(),
    ),
  );
}

export async function deleteTemplatesAction(
  csrfToken: string | null,
  rawInput: unknown,
): Promise<ActionResult<{ deleted: number }>> {
  const csrf = await guardCsrf(csrfToken);
  if (!csrf.ok) return clientErr(new AppError("E_PERM_001", "csrf check failed", {}));
  const ctx = await createContext();
  if (ctx.actor === null) return clientErr(new AppError("E_AUTH_001", "unauthenticated", {}));
  const parsed = deleteTemplatesInput.safeParse(rawInput);
  if (!parsed.success) {
    return clientErr(
      new AppError("E_GMAIL_010", "invalid delete input", { issues: parsed.error.issues }),
    );
  }
  return toClientResult(
    await deleteTemplates(db, { actorId: ctx.actor.id, ids: parsed.data.ids }, SIG()),
  );
}

export async function updateSignatureAction(
  csrfToken: string | null,
  rawInput: unknown,
): Promise<ActionResult<void>> {
  const csrf = await guardCsrf(csrfToken);
  if (!csrf.ok) return clientErr(new AppError("E_PERM_001", "csrf check failed", {}));
  const ctx = await createContext();
  if (ctx.actor === null) return clientErr(new AppError("E_AUTH_001", "unauthenticated", {}));
  const parsed = updateSignatureInput.safeParse(rawInput);
  if (!parsed.success) {
    return clientErr(
      new AppError("E_GMAIL_010", "invalid signature input", { issues: parsed.error.issues }),
    );
  }
  return toClientResult(
    await updateSignature(
      db,
      { id: parsed.data.id, userId: ctx.actor.id, patch: parsed.data.patch },
      SIG(),
    ),
  );
}

export async function deleteSignatureAction(
  csrfToken: string | null,
  rawInput: unknown,
): Promise<ActionResult<void>> {
  const csrf = await guardCsrf(csrfToken);
  if (!csrf.ok) return clientErr(new AppError("E_PERM_001", "csrf check failed", {}));
  const ctx = await createContext();
  if (ctx.actor === null) return clientErr(new AppError("E_AUTH_001", "unauthenticated", {}));
  const parsed = idInput.safeParse(rawInput);
  if (!parsed.success) {
    return clientErr(
      new AppError("E_GMAIL_010", "invalid signature id", { issues: parsed.error.issues }),
    );
  }
  return toClientResult(
    await deleteSignature(db, { id: parsed.data.id, userId: ctx.actor.id }, SIG()),
  );
}
