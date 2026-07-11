"use server";

import { ERROR_IDS } from "@/constants/errorIds";
import { db } from "@/db/client";
import { guardCsrf } from "@/features/identity/actions/shared";
import { SIG } from "@/features/identity/actions/sig";
import { createContext } from "@/server/trpc/context";
import { softDeleteNote, togglePin, updateNote } from "./notesRepo";
import { type NoteCreateInput, noteUpdateInput } from "./notesSchemas";
import { createNoteWithMentions } from "./noteWithMentions";

type ActionResult = { ok: true; value: { id: string } } | { ok: false; error: { id: string } };

export async function createNoteAction(
  input: NoteCreateInput,
  csrfToken: string | null = null,
): Promise<ActionResult> {
  const csrfOk = await guardCsrf(csrfToken);
  if (!csrfOk.ok) return { ok: false, error: { id: "E_AUTH_CSRF" } };

  const { actor } = await createContext();
  if (actor === null) return { ok: false, error: { id: ERROR_IDS.AUTH_SESSION_DEAD } };

  // createNoteWithMentions gates visibility via assertReferenceVisible and then
  // best-effort fires mention notifications for any @[Name](userId) tokens.
  const result = await createNoteWithMentions(db, actor, input, SIG());
  if (!result.ok) return { ok: false, error: { id: result.error.id } };
  return { ok: true, value: { id: result.value.id } };
}

export async function togglePinAction(
  input: { noteId: string; pinned: boolean },
  csrfToken: string | null = null,
): Promise<ActionResult> {
  const csrfOk = await guardCsrf(csrfToken);
  if (!csrfOk.ok) return { ok: false, error: { id: "E_AUTH_CSRF" } };

  const { actor } = await createContext();
  if (actor === null) return { ok: false, error: { id: ERROR_IDS.AUTH_SESSION_DEAD } };

  const result = await togglePin(db, actor, input.noteId, input.pinned, SIG());
  if (!result.ok) return { ok: false, error: { id: result.error.id } };
  return { ok: true, value: { id: result.value.id } };
}

export async function updateNoteAction(
  input: { noteId: string; body: string },
  csrfToken: string | null = null,
): Promise<ActionResult> {
  const csrfOk = await guardCsrf(csrfToken);
  if (!csrfOk.ok) return { ok: false, error: { id: "E_AUTH_CSRF" } };

  // Validate at the boundary: body length / uuid shape (the DB text column is unbounded).
  const parsed = noteUpdateInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: { id: ERROR_IDS.NOTE_NOT_FOUND } };

  const { actor } = await createContext();
  if (actor === null) return { ok: false, error: { id: ERROR_IDS.AUTH_SESSION_DEAD } };

  const result = await updateNote(db, actor, parsed.data.noteId, parsed.data.body, SIG());
  if (!result.ok) return { ok: false, error: { id: result.error.id } };
  return { ok: true, value: { id: result.value.id } };
}

export async function deleteNoteAction(
  input: { noteId: string },
  csrfToken: string | null = null,
): Promise<ActionResult> {
  const csrfOk = await guardCsrf(csrfToken);
  if (!csrfOk.ok) return { ok: false, error: { id: "E_AUTH_CSRF" } };

  const parsed = noteUpdateInput.pick({ noteId: true }).safeParse(input);
  if (!parsed.success) return { ok: false, error: { id: ERROR_IDS.NOTE_NOT_FOUND } };

  const { actor } = await createContext();
  if (actor === null) return { ok: false, error: { id: ERROR_IDS.AUTH_SESSION_DEAD } };

  const result = await softDeleteNote(db, actor, parsed.data.noteId, SIG());
  if (!result.ok) return { ok: false, error: { id: result.error.id } };
  return { ok: true, value: { id: result.value.id } };
}
