import type { AppError } from "@/constants/errorIds";
import { MENTION_SOURCES } from "@/constants/mentions";
import type { Db } from "@/db/client";
import { resolveAndStoreMentions } from "@/features/mentions/resolve";
import type { AuthUser } from "@/features/permissions/types";
import { err, ok, type Result } from "@/types/result";
import { createNote } from "./notesRepo";
import type { NoteCreateInput } from "./notesSchemas";

// source constant for note mentions
const NOTE_SOURCE = MENTION_SOURCES[0]; // "note"

// Creates a note and best-effort fires mention notifications for any @[Name](userId) tokens.
// If the note creation fails the whole operation fails. If mention resolution fails (non-abort),
// the note is still committed and the error is warned but not propagated.
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
    // Best-effort: the note is already committed. Log and continue.
    console.warn(
      `createNoteWithMentions: mention resolution failed [${mentionResult.error.id}]: ${mentionResult.error.message}`,
    );
  }

  return ok({ id: row.id });
}
