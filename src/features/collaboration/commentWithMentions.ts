import { and, eq, isNull, ne } from "drizzle-orm";
import type { AppError } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import { comments, notes } from "@/db/schema";
import { parseMentions } from "@/features/mentions/parse";
import { resolveAndStoreMentions } from "@/features/mentions/resolve";
import { enqueueEmailNotification } from "@/features/notifications/emailDispatch";
import { fanOut } from "@/features/notifications/produce";
import type { AuthUser } from "@/features/permissions/types";
import type { CreateNotificationInput } from "@/types/notification";
import { err, ok, type Result } from "@/types/result";
import { createComment } from "./commentsRepo";
import type { CommentCreateInput } from "./commentsSchemas";

type NoteContext = { authorId: string; entityType: string; entityId: string };

async function noteContextFor(
  db: Db,
  noteId: string,
  signal: AbortSignal,
): Promise<NoteContext | undefined> {
  signal.throwIfAborted();
  const [row] = await db
    .select({
      authorId: notes.authorId,
      entityType: notes.entityType,
      entityId: notes.entityId,
    })
    .from(notes)
    .where(and(eq(notes.id, noteId), isNull(notes.deletedAt)));
  return row;
}

async function priorCommenterIds(
  db: Db,
  noteId: string,
  excludeCommentId: string,
  signal: AbortSignal,
): Promise<string[]> {
  signal.throwIfAborted();
  const rows = await db
    .selectDistinct({ authorId: comments.authorId })
    .from(comments)
    .where(and(eq(comments.noteId, noteId), ne(comments.id, excludeCommentId)));
  return rows.map((r) => r.authorId);
}

function replyRecipients(args: {
  note: NoteContext;
  priorCommenters: string[];
  mentionedUserIds: Set<string>;
  actorId: string;
}): string[] {
  const candidates = new Set<string>([args.note.authorId, ...args.priorCommenters]);
  candidates.delete(args.actorId);
  for (const mentioned of args.mentionedUserIds) candidates.delete(mentioned);
  return Array.from(candidates);
}

async function notifyReplies(
  db: Db,
  recipients: string[],
  args: { note: NoteContext; actorId: string; noteId: string; commentId: string },
  signal: AbortSignal,
): Promise<void> {
  if (recipients.length === 0) return;

  const inputs: CreateNotificationInput[] = recipients.map((recipientId) => ({
    recipientId,
    type: "comment_reply" as const,
    entityType: args.note.entityType,
    entityId: args.note.entityId,
    actorId: args.actorId,
    payload: { noteId: args.noteId, commentId: args.commentId },
  }));

  const results = await fanOut(db, inputs, signal);
  for (let i = 0; i < results.length; i++) {
    const res = results[i];
    const recipientId = recipients[i];
    if (res === undefined || recipientId === undefined) continue;
    if (!res.ok || !("notificationId" in res.value)) continue;
    await enqueueEmailNotification(
      db,
      res.value.notificationId,
      recipientId,
      "comment_reply",
      signal,
    );
  }
}

export async function createCommentWithMentions(
  db: Db,
  actor: AuthUser,
  input: CommentCreateInput,
  signal: AbortSignal,
): Promise<Result<{ id: string }, AppError>> {
  const created = await createComment(db, actor, input, signal);
  if (!created.ok) return err(created.error);
  const comment = created.value;

  const note = await noteContextFor(db, comment.noteId, signal);
  if (note === undefined) return ok({ id: comment.id });

  const mentionResult = await resolveAndStoreMentions(db, {
    source: "comment",
    sourceId: comment.id,
    body: input.body,
    authorId: actor.id,
    entityType: note.entityType,
    entityId: note.entityId,
    signal,
  });
  if (!mentionResult.ok) {
    console.warn(
      `createCommentWithMentions: mention resolution failed [${mentionResult.error.id}]: ${mentionResult.error.message}`,
    );
  }

  try {
    const recipients = replyRecipients({
      note,
      priorCommenters: await priorCommenterIds(db, comment.noteId, comment.id, signal),
      mentionedUserIds: new Set(parseMentions(input.body).map((t) => t.userId)),
      actorId: actor.id,
    });
    await notifyReplies(
      db,
      recipients,
      { note, actorId: actor.id, noteId: comment.noteId, commentId: comment.id },
      signal,
    );
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") throw e;
    console.warn(
      `createCommentWithMentions: reply notification failed: ${e instanceof Error ? e.message : String(e)}`,
    );
  }

  return ok({ id: comment.id });
}
