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

function refFor(entityType: string, id: string): EntityRef {
  return { kind: entityType as EntityRef["kind"], id };
}

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

export interface CreateNoteOptions {
  createdAtOverride?: Date;
}

export async function createNote(
  db: Db,
  actor: AuthUser,
  input: NoteCreateInput,
  signal: AbortSignal,
  options: CreateNoteOptions = {},
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
        ...(options.createdAtOverride === undefined
          ? {}
          : { createdAt: options.createdAtOverride }),
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

export type NoteWithAuthor = Note & { actorName: string | null };

export async function listNotes(
  db: Db,
  entityType: string,
  entityId: string,
  signal: AbortSignal,
): Promise<NoteWithAuthor[]> {
  signal.throwIfAborted();
  return db
    .select({ ...getTableColumns(notes), actorName: users.name })
    .from(notes)
    .leftJoin(users, eq(users.id, notes.authorId))
    .where(
      and(eq(notes.entityType, entityType), eq(notes.entityId, entityId), isNull(notes.deletedAt)),
    )
    .orderBy(desc(notes.pinned), desc(notes.createdAt));
}
