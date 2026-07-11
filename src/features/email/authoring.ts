import { and, eq, inArray, ne } from "drizzle-orm";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import { emailTemplates, signatures } from "@/db/schema";
import { err, ok, type Result } from "@/types/result";
import { sanitizeAuthorHtml } from "./sanitizeHtml";

// Create an email template. Body is sanitized on save (stored-XSS defense, Task 8).
// Sharing is capability-gated: canShare is computed by the action from the actor's
// flags and passed in; the service never imports the permission system. A shared
// template requested without the capability is rejected and nothing is written.
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

// Create a signature. Body is sanitized on save. When isDefault, the prior default is
// cleared and the new row set in ONE transaction so exactly one default per user holds
// (the DB does not constrain this; it is app-enforced).
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

// Move the user's default to the given signature: clear the prior default and flip the
// target, in one transaction so exactly one default holds. Scoped by user_id so a caller
// cannot flip another user's signature.
export async function setDefaultSignature(
  db: Db,
  args: { userId: string; signatureId: string },
  signal: AbortSignal,
): Promise<Result<void, AppError>> {
  signal.throwIfAborted();
  const flipped = await db.transaction(async (tx) => {
    // Flip the target FIRST (ownership-scoped). Only if it matched do we demote the others,
    // so a denied/stale call for a signature the caller does not own cannot wipe their own
    // existing default as a side effect of a failed operation.
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

// Update a template the actor owns. Non-owner is denied E_PERM_005 (found or not, same message,
// no existence probe). Body is re-sanitized on save. Turning on sharing requires canShare.
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
  // Read the current row (ownership-scoped) so we can tell a genuine share elevation from a
  // no-op echo. A non-owner (or missing id) resolves to undefined and is denied identically.
  const [current] = await db
    .select({ isShared: emailTemplates.isShared })
    .from(emailTemplates)
    .where(and(eq(emailTemplates.id, args.id), eq(emailTemplates.ownerId, args.actorId)));
  if (current === undefined) {
    return err(new AppError(ERROR_IDS.PERM_TEMPLATE_DENIED, "template not found or not owned", {}));
  }
  // Only a transition from not-shared to shared needs the capability. Keeping an already-shared
  // template shared while editing other fields must not lock out an owner who has since lost it.
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

// Delete a template the actor owns. Non-owner (or missing) is denied E_PERM_005.
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

// Reorder the actor's OWN templates by writing sort_order = position for each id. Ids not owned
// by the actor are ignored (the WHERE owner_id filter skips them), so a client cannot reorder or
// probe another user's templates. Shared templates from others keep their own order. Idempotent.
export async function reorderTemplates(
  db: Db,
  args: { actorId: string; orderedIds: string[] },
  signal: AbortSignal,
): Promise<Result<{ reordered: number }, AppError>> {
  signal.throwIfAborted();
  // Assign sort_order = position in the drag order, but ACQUIRE the row locks in a canonical order
  // (sorted by id) so two rapid reorders touching the same rows can never lock them in opposite
  // orders and deadlock. Last writer wins, which is the correct outcome for back-to-back drags.
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

// Bulk-delete templates the actor owns. Only owned ids in the set are removed; non-owned ids are
// silently skipped (same own-only rule as deleteTemplate). Returns how many rows were deleted.
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

// Update a signature the user owns. Scoped by user_id so a caller cannot touch another
// user's row (denied E_PERM_004). When patch.isDefault === true, flip the default in one
// transaction so exactly one default holds; other fields update in the same statement.
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
    // Update the target FIRST (ownership-scoped); only demote the other defaults once we know
    // this row was ours to change. Otherwise a denied/stale isDefault:true call would clear
    // the caller's own default before failing, leaving them with no default.
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

// Delete a signature the user owns. Scoped by user_id; non-owner (or missing) denied E_PERM_004.
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
