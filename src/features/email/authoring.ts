import { and, eq, inArray, ne } from "drizzle-orm";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import { emailTemplates, signatures } from "@/db/schema";
import { err, ok, type Result } from "@/types/result";
import { sanitizeAuthorHtml } from "./sanitizeHtml";

export async function createTemplate(
  db: Db,
  args: {
    ownerId: string;
    name: string;
    subject?: string;
    bodyHtml: string;
    isShared: boolean;
    canShare: boolean;
  },
  signal: AbortSignal,
): Promise<Result<{ id: string }, AppError>> {
  signal.throwIfAborted();
  if (args.isShared && !args.canShare) {
    return err(
      new AppError("E_PERM_001", "template sharing requires the filter.share capability", {}),
    );
  }

  const cleanHtml = sanitizeAuthorHtml(args.bodyHtml);
  const [row] = await db
    .insert(emailTemplates)
    .values({
      ownerId: args.ownerId,
      name: args.name,
      subject: args.subject,
      bodyHtml: cleanHtml,
      isShared: args.isShared,
    })
    .returning({ id: emailTemplates.id });
  signal.throwIfAborted();
  if (row === undefined) {
    return err(new AppError("E_DB_002", "template insert returned no row", {}));
  }
  return ok({ id: row.id });
}

export async function createSignature(
  db: Db,
  args: { userId: string; name: string; bodyHtml: string; isDefault: boolean },
  signal: AbortSignal,
): Promise<Result<{ id: string }, AppError>> {
  signal.throwIfAborted();
  const cleanHtml = sanitizeAuthorHtml(args.bodyHtml);

  const id = await db.transaction(async (tx) => {
    if (args.isDefault) {
      await tx
        .update(signatures)
        .set({ isDefault: false })
        .where(eq(signatures.userId, args.userId));
    }
    const [row] = await tx
      .insert(signatures)
      .values({
        userId: args.userId,
        name: args.name,
        bodyHtml: cleanHtml,
        isDefault: args.isDefault,
      })
      .returning({ id: signatures.id });
    return row?.id;
  });
  signal.throwIfAborted();
  if (id === undefined) {
    return err(new AppError("E_DB_002", "signature insert returned no row", {}));
  }
  return ok({ id });
}

export async function setDefaultSignature(
  db: Db,
  args: { userId: string; signatureId: string },
  signal: AbortSignal,
): Promise<Result<void, AppError>> {
  signal.throwIfAborted();
  const flipped = await db.transaction(async (tx) => {
    const updated = await tx
      .update(signatures)
      .set({ isDefault: true })
      .where(and(eq(signatures.id, args.signatureId), eq(signatures.userId, args.userId)))
      .returning({ id: signatures.id });
    if (updated.length === 0) return 0;
    await tx
      .update(signatures)
      .set({ isDefault: false })
      .where(and(eq(signatures.userId, args.userId), ne(signatures.id, args.signatureId)));
    return updated.length;
  });
  signal.throwIfAborted();
  if (flipped === 0) {
    return err(new AppError("E_DB_002", "signature not found for user", { ...args }));
  }
  return ok(undefined);
}

export async function updateTemplate(
  db: Db,
  args: {
    id: string;
    actorId: string;
    canShare: boolean;
    patch: { name?: string; subject?: string; bodyHtml?: string; isShared?: boolean };
  },
  signal: AbortSignal,
): Promise<Result<void, AppError>> {
  signal.throwIfAborted();
  const [current] = await db
    .select({ isShared: emailTemplates.isShared })
    .from(emailTemplates)
    .where(and(eq(emailTemplates.id, args.id), eq(emailTemplates.ownerId, args.actorId)));
  if (current === undefined) {
    return err(new AppError(ERROR_IDS.PERM_TEMPLATE_DENIED, "template not found or not owned", {}));
  }
  if (args.patch.isShared === true && current.isShared !== true && !args.canShare) {
    return err(
      new AppError("E_PERM_001", "template sharing requires the filter.share capability", {}),
    );
  }
  const set: Record<string, unknown> = {};
  if (args.patch.name !== undefined) set.name = args.patch.name;
  if (args.patch.subject !== undefined) set.subject = args.patch.subject;
  if (args.patch.bodyHtml !== undefined) set.bodyHtml = sanitizeAuthorHtml(args.patch.bodyHtml);
  if (args.patch.isShared !== undefined) set.isShared = args.patch.isShared;
  set.updatedAt = new Date();

  const updated = await db
    .update(emailTemplates)
    .set(set)
    .where(and(eq(emailTemplates.id, args.id), eq(emailTemplates.ownerId, args.actorId)))
    .returning({ id: emailTemplates.id });
  signal.throwIfAborted();
  if (updated.length === 0) {
    return err(new AppError(ERROR_IDS.PERM_TEMPLATE_DENIED, "template not found or not owned", {}));
  }
  return ok(undefined);
}

export async function deleteTemplate(
  db: Db,
  args: { id: string; actorId: string },
  signal: AbortSignal,
): Promise<Result<void, AppError>> {
  signal.throwIfAborted();
  const deleted = await db
    .delete(emailTemplates)
    .where(and(eq(emailTemplates.id, args.id), eq(emailTemplates.ownerId, args.actorId)))
    .returning({ id: emailTemplates.id });
  signal.throwIfAborted();
  if (deleted.length === 0) {
    return err(new AppError(ERROR_IDS.PERM_TEMPLATE_DENIED, "template not found or not owned", {}));
  }
  return ok(undefined);
}

export async function reorderTemplates(
  db: Db,
  args: { actorId: string; orderedIds: string[] },
  signal: AbortSignal,
): Promise<Result<{ reordered: number }, AppError>> {
  signal.throwIfAborted();
  const targets = args.orderedIds
    .map((id, order) => ({ id, order }))
    .sort((a, b) => a.id.localeCompare(b.id));
  const reordered = await db.transaction(async (tx) => {
    let n = 0;
    for (const t of targets) {
      const updated = await tx
        .update(emailTemplates)
        .set({ sortOrder: t.order })
        .where(and(eq(emailTemplates.id, t.id), eq(emailTemplates.ownerId, args.actorId)))
        .returning({ id: emailTemplates.id });
      n += updated.length;
    }
    return n;
  });
  signal.throwIfAborted();
  return ok({ reordered });
}

export async function deleteTemplates(
  db: Db,
  args: { actorId: string; ids: string[] },
  signal: AbortSignal,
): Promise<Result<{ deleted: number }, AppError>> {
  signal.throwIfAborted();
  if (args.ids.length === 0) return ok({ deleted: 0 });
  const deleted = await db
    .delete(emailTemplates)
    .where(and(inArray(emailTemplates.id, args.ids), eq(emailTemplates.ownerId, args.actorId)))
    .returning({ id: emailTemplates.id });
  signal.throwIfAborted();
  return ok({ deleted: deleted.length });
}

export async function updateSignature(
  db: Db,
  args: {
    id: string;
    userId: string;
    patch: { name?: string; bodyHtml?: string; isDefault?: boolean };
  },
  signal: AbortSignal,
): Promise<Result<void, AppError>> {
  signal.throwIfAborted();
  const set: Record<string, unknown> = {};
  if (args.patch.name !== undefined) set.name = args.patch.name;
  if (args.patch.bodyHtml !== undefined) set.bodyHtml = sanitizeAuthorHtml(args.patch.bodyHtml);
  if (args.patch.isDefault !== undefined) set.isDefault = args.patch.isDefault;
  set.updatedAt = new Date();

  const affected = await db.transaction(async (tx) => {
    const updated = await tx
      .update(signatures)
      .set(set)
      .where(and(eq(signatures.id, args.id), eq(signatures.userId, args.userId)))
      .returning({ id: signatures.id });
    if (updated.length === 0) return 0;
    if (args.patch.isDefault === true) {
      await tx
        .update(signatures)
        .set({ isDefault: false })
        .where(and(eq(signatures.userId, args.userId), ne(signatures.id, args.id)));
    }
    return updated.length;
  });
  signal.throwIfAborted();
  if (affected === 0) {
    return err(
      new AppError(ERROR_IDS.PERM_SIGNATURE_DENIED, "signature not found or not owned", {}),
    );
  }
  return ok(undefined);
}

export async function deleteSignature(
  db: Db,
  args: { id: string; userId: string },
  signal: AbortSignal,
): Promise<Result<void, AppError>> {
  signal.throwIfAborted();
  const deleted = await db
    .delete(signatures)
    .where(and(eq(signatures.id, args.id), eq(signatures.userId, args.userId)))
    .returning({ id: signatures.id });
  signal.throwIfAborted();
  if (deleted.length === 0) {
    return err(
      new AppError(ERROR_IDS.PERM_SIGNATURE_DENIED, "signature not found or not owned", {}),
    );
  }
  return ok(undefined);
}
