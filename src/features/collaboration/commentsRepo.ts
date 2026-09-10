import { and, asc, eq, getTableColumns, isNull } from "drizzle-orm";
import { isCommentableEntityType } from "@/constants/comments";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import type { Comment, Note } from "@/db/schema";
import { comments, notes, users } from "@/db/schema";
import { assertReferenceVisible } from "@/features/permissions/referenceCheck";
import type { AuthUser } from "@/features/permissions/types";
import type { EntityRef } from "@/types/entityRef";
import { err, ok, type Result } from "@/types/result";
import type { CommentCreateInput } from "./commentsSchemas";

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

export function canModifyComment(actor: AuthUser, authorId: string): boolean {
  return actor.type === "admin" || actor.id === authorId;
}

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

async function liveNoteFor(tx: Tx | Db, noteId: string): Promise<Note | undefined> {
  const [row] = await tx
    .select()
    .from(notes)
    .where(and(eq(notes.id, noteId), isNull(notes.deletedAt)));
  return row;
}

async function gateNoteParent(
  tx: Tx | Db,
  actor: AuthUser,
  note: Note,
  signal: AbortSignal,
): Promise<Result<true, AppError>> {
  if (!isCommentableEntityType(note.entityType)) {
    return err(
      new AppError(ERROR_IDS.COMMENT_ENTITY_UNSUPPORTED, "entity type takes no comments", {
        entityType: note.entityType,
      }),
    );
  }
  const visible = await assertReferenceVisible(
    tx,
    toRefActor(actor),
    refFor(note.entityType, note.entityId),
    signal,
  );
  if (visible.ok === false) return visible;
  return ok(true);
}

export async function createComment(
  db: Db,
  actor: AuthUser,
  input: CommentCreateInput,
  signal: AbortSignal,
): Promise<Result<Comment, AppError>> {
  signal.throwIfAborted();

  return db.transaction(async (tx) => {
    signal.throwIfAborted();
    const note = await liveNoteFor(tx, input.noteId);
    if (note === undefined) {
      return err(
        new AppError(ERROR_IDS.NOTE_NOT_FOUND, "note not found", { noteId: input.noteId }),
      );
    }

    const gate = await gateNoteParent(tx, actor, note, signal);
    if (gate.ok === false) return gate;

    const [row] = await tx
      .insert(comments)
      .values({ noteId: input.noteId, body: input.body, authorId: actor.id })
      .returning();

    if (row === undefined) {
      return err(new AppError(ERROR_IDS.DB_INSERT_FAILED, "insert returned no rows", {}));
    }
    return ok(row);
  });
}

async function loadModifiable(
  tx: Tx,
  actor: AuthUser,
  commentId: string,
  signal: AbortSignal,
): Promise<Result<Comment, AppError>> {
  const [current] = await tx.select().from(comments).where(eq(comments.id, commentId));
  if (current === undefined) {
    return err(new AppError(ERROR_IDS.COMMENT_NOT_FOUND, "comment not found", { commentId }));
  }

  const note = await liveNoteFor(tx, current.noteId);
  if (note === undefined) {
    return err(
      new AppError(ERROR_IDS.COMMENT_NOT_FOUND, "parent note is gone", {
        commentId,
        noteId: current.noteId,
      }),
    );
  }

  const gate = await gateNoteParent(tx, actor, note, signal);
  if (gate.ok === false) return gate;

  if (!canModifyComment(actor, current.authorId)) {
    return err(new AppError(ERROR_IDS.COMMENT_FORBIDDEN, "not the comment author", { commentId }));
  }
  return ok(current);
}

export async function updateComment(
  db: Db,
  actor: AuthUser,
  commentId: string,
  body: string,
  signal: AbortSignal,
): Promise<Result<Comment, AppError>> {
  signal.throwIfAborted();

  return db.transaction(async (tx) => {
    signal.throwIfAborted();
    const loaded = await loadModifiable(tx, actor, commentId, signal);
    if (loaded.ok === false) return loaded;

    const [row] = await tx
      .update(comments)
      .set({ body })
      .where(eq(comments.id, commentId))
      .returning();

    if (row === undefined) {
      return err(new AppError(ERROR_IDS.COMMENT_NOT_FOUND, "comment not found", { commentId }));
    }
    return ok(row);
  });
}

export async function deleteComment(
  db: Db,
  actor: AuthUser,
  commentId: string,
  signal: AbortSignal,
): Promise<Result<{ id: string }, AppError>> {
  signal.throwIfAborted();

  return db.transaction(async (tx) => {
    signal.throwIfAborted();
    const loaded = await loadModifiable(tx, actor, commentId, signal);
    if (loaded.ok === false) return loaded;

    const [row] = await tx
      .delete(comments)
      .where(eq(comments.id, commentId))
      .returning({ id: comments.id });

    if (row === undefined) {
      return err(new AppError(ERROR_IDS.COMMENT_NOT_FOUND, "comment not found", { commentId }));
    }
    return ok(row);
  });
}

export type CommentWithAuthor = Comment & { actorName: string | null; canModify: boolean };

export async function listCommentsForEntity(
  db: Db,
  actor: AuthUser,
  entityType: string,
  entityId: string,
  signal: AbortSignal,
): Promise<CommentWithAuthor[]> {
  signal.throwIfAborted();
  if (!isCommentableEntityType(entityType)) return [];

  const rows = await db
    .select({ ...getTableColumns(comments), actorName: users.name })
    .from(comments)
    .innerJoin(notes, eq(notes.id, comments.noteId))
    .leftJoin(users, eq(users.id, comments.authorId))
    .where(
      and(eq(notes.entityType, entityType), eq(notes.entityId, entityId), isNull(notes.deletedAt)),
    )
    .orderBy(asc(comments.createdAt));

  return rows.map((r) => ({ ...r, canModify: canModifyComment(actor, r.authorId) }));
}
