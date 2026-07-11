import { and, desc, eq, getTableColumns, isNull } from "drizzle-orm";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import type { Note } from "@/db/schema";
import { notes, users } from "@/db/schema";
import { assertReferenceVisible } from "@/features/permissions/referenceCheck";
import type { AuthUser } from "@/features/permissions/types";
import type { EntityRef } from "@/types/entityRef";
import { err, ok, type Result } from "@/types/result";
import type { NoteCreateInput } from "./notesSchemas";

// ENTITY_TYPES values (deal/person/organization/lead) are all valid EntityRef kinds.
function refFor(entityType: string, id: string): EntityRef {
  return { kind: entityType as EntityRef["kind"], id };
}

// AuthUser to the DealVisibilitySession shape assertReferenceVisible expects.
function toRefActor(actor: AuthUser): {
  userId: string;
  isActive: boolean;
  sessionLive: boolean;
  isAdmin: boolean;
  visibilityGroupIds: string[];
  managedUserIds?: string[];
} {
  return {
    userId: actor.id,
    isActive: actor.isActive,
    sessionLive: true,
    isAdmin: actor.type === "admin",
    visibilityGroupIds: Array.from(actor.groupIds),
    managedUserIds: Array.from(actor.managedUserIds ?? []),
  };
}

export async function createNote(
  db: Db,
  actor: AuthUser,
  input: NoteCreateInput,
  signal: AbortSignal,
): Promise<Result<Note, AppError>> {
  signal.throwIfAborted();

  return db.transaction(async (tx) => {
    signal.throwIfAborted();
    const v = await assertReferenceVisible(
      tx,
      toRefActor(actor),
      refFor(input.entityType, input.entityId),
      signal,
    );
    if (v.ok === false) return v;

    const [row] = await tx
      .insert(notes)
      .values({
        entityType: input.entityType,
        entityId: input.entityId,
        body: input.body,
        pinned: input.pinned,
        authorId: actor.id,
      })
      .returning();

    if (row === undefined) {
      return err(new AppError(ERROR_IDS.DB_INSERT_FAILED, "insert returned no rows", {}));
    }
    return ok(row);
  });
}

export async function togglePin(
  db: Db,
  actor: AuthUser,
  noteId: string,
  pinned: boolean,
  signal: AbortSignal,
): Promise<Result<Note, AppError>> {
  signal.throwIfAborted();

  return db.transaction(async (tx) => {
    signal.throwIfAborted();
    const [current] = await tx
      .select()
      .from(notes)
      .where(and(eq(notes.id, noteId), isNull(notes.deletedAt)));
    if (current === undefined) {
      return err(new AppError(ERROR_IDS.NOTE_NOT_FOUND, "note not found", { noteId }));
    }

    const v = await assertReferenceVisible(
      tx,
      toRefActor(actor),
      refFor(current.entityType, current.entityId),
      signal,
    );
    if (v.ok === false) return v;

    const [row] = await tx
      .update(notes)
      .set({ pinned })
      .where(and(eq(notes.id, noteId), isNull(notes.deletedAt)))
      .returning();

    if (row === undefined) {
      return err(new AppError(ERROR_IDS.NOTE_NOT_FOUND, "note not found", { noteId }));
    }
    return ok(row);
  });
}

// Edit a note body in place. Visibility-gated like togglePin: any actor who can see
// the parent may edit. (Author-only restriction is an open product question.)
export async function updateNote(
  db: Db,
  actor: AuthUser,
  noteId: string,
  body: string,
  signal: AbortSignal,
): Promise<Result<Note, AppError>> {
  signal.throwIfAborted();

  return db.transaction(async (tx) => {
    signal.throwIfAborted();
    const [current] = await tx
      .select()
      .from(notes)
      .where(and(eq(notes.id, noteId), isNull(notes.deletedAt)));
    if (current === undefined) {
      return err(new AppError(ERROR_IDS.NOTE_NOT_FOUND, "note not found", { noteId }));
    }

    const v = await assertReferenceVisible(
      tx,
      toRefActor(actor),
      refFor(current.entityType, current.entityId),
      signal,
    );
    if (v.ok === false) return v;

    const [row] = await tx
      .update(notes)
      .set({ body })
      .where(and(eq(notes.id, noteId), isNull(notes.deletedAt)))
      .returning();

    if (row === undefined) {
      return err(new AppError(ERROR_IDS.NOTE_NOT_FOUND, "note not found", { noteId }));
    }
    return ok(row);
  });
}

// Soft-delete: set deletedAt so listNotes (which filters isNull(deletedAt)) hides it.
// Comments cascade at the DB level only on hard delete; soft-deleted notes keep their
// rows, so their comments stay orphaned-but-hidden, acceptable for the undo-friendly model.
export async function softDeleteNote(
  db: Db,
  actor: AuthUser,
  noteId: string,
  signal: AbortSignal,
): Promise<Result<{ id: string }, AppError>> {
  signal.throwIfAborted();

  return db.transaction(async (tx) => {
    signal.throwIfAborted();
    const [current] = await tx
      .select()
      .from(notes)
      .where(and(eq(notes.id, noteId), isNull(notes.deletedAt)));
    if (current === undefined) {
      return err(new AppError(ERROR_IDS.NOTE_NOT_FOUND, "note not found", { noteId }));
    }

    const v = await assertReferenceVisible(
      tx,
      toRefActor(actor),
      refFor(current.entityType, current.entityId),
      signal,
    );
    if (v.ok === false) return v;

    const [row] = await tx
      .update(notes)
      .set({ deletedAt: new Date() })
      .where(and(eq(notes.id, noteId), isNull(notes.deletedAt)))
      .returning({ id: notes.id });

    if (row === undefined) {
      return err(new AppError(ERROR_IDS.NOTE_NOT_FOUND, "note not found", { noteId }));
    }
    return ok(row);
  });
}

// A note row plus its author's resolved display name. actorName is null when the
// author is unknown (a since-deleted user), mirroring the changelog's users-join.
export type NoteWithAuthor = Note & { actorName: string | null };

// Visibility note: listNotes does NOT itself gate the parent. Notes inherit the
// parent's visibility, and the CALLER is responsible for having checked canSee
// on the parent before exposing its notes.
export async function listNotes(
  db: Db,
  entityType: string,
  entityId: string,
  signal: AbortSignal,
): Promise<NoteWithAuthor[]> {
  signal.throwIfAborted();
  // LEFT JOIN users so the note carries its author's display name for the
  // attribution line (matches listChangeLog, which resolves actorName via users.name).
  // Left (not inner) so a note whose author was since deleted still lists, actorName null.
  return db
    .select({ ...getTableColumns(notes), actorName: users.name })
    .from(notes)
    .leftJoin(users, eq(users.id, notes.authorId))
    .where(
      and(eq(notes.entityType, entityType), eq(notes.entityId, entityId), isNull(notes.deletedAt)),
    )
    .orderBy(desc(notes.pinned), desc(notes.createdAt));
}
