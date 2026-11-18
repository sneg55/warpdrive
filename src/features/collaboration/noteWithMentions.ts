import type { AppError } from "@/constants/errorIds";
import { MENTION_SOURCES } from "@/constants/mentions";
import type { Db } from "@/db/client";
import { resolveAndStoreMentions } from "@/features/mentions/resolve";
import type { AuthUser } from "@/features/permissions/types";
import { err, ok, type Result } from "@/types/result";
import { createNote } from "./notesRepo";
import type { NoteCreateInput } from "./notesSchemas";

const NOTE_SOURCE = MENTION_SOURCES[0];

export async function createNoteWithMentions(
  db: Db,
  actor: AuthUser,
  input: NoteCreateInput,
  signal: AbortSignal,
): Promise<Result<{ id: string }, AppError>> {
  const noteResult = await createNote(db, actor, input, signal);
  if (!noteResult.ok) return err(noteResult.error);

  const row = noteResult.value;

  const mentionResult = await resolveAndStoreMentions(db, {
    source: NOTE_SOURCE,
    sourceId: row.id,
    body: input.body,
    authorId: actor.id,
    entityType: input.entityType,
    entityId: input.entityId,
    signal,
  });

  if (!mentionResult.ok) {
    console.warn(
      `createNoteWithMentions: mention resolution failed [${mentionResult.error.id}]: ${mentionResult.error.message}`,
    );
  }

  return ok({ id: row.id });
}
