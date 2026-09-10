"use server";

import { ERROR_IDS } from "@/constants/errorIds";
import { db } from "@/db/client";
import { guardCsrf } from "@/features/identity/actions/shared";
import { SIG } from "@/features/identity/actions/sig";
import { createContext } from "@/server/trpc/context";
import { deleteComment, updateComment } from "./commentsRepo";
import {
  type CommentCreateInput,
  type CommentDeleteInput,
  type CommentUpdateInput,
  commentCreateInput,
  commentDeleteInput,
  commentUpdateInput,
} from "./commentsSchemas";
import { createCommentWithMentions } from "./commentWithMentions";

type ActionResult = { ok: true; value: { id: string } } | { ok: false; error: { id: string } };

export async function createCommentAction(
  input: CommentCreateInput,
  csrfToken: string | null = null,
): Promise<ActionResult> {
  const csrfOk = await guardCsrf(csrfToken);
  if (!csrfOk.ok) return { ok: false, error: { id: "E_AUTH_CSRF" } };

  const parsed = commentCreateInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: { id: ERROR_IDS.COMMENT_INPUT_INVALID } };

  const { actor } = await createContext();
  if (actor === null) return { ok: false, error: { id: ERROR_IDS.AUTH_SESSION_DEAD } };

  const result = await createCommentWithMentions(db, actor, parsed.data, SIG());
  if (!result.ok) return { ok: false, error: { id: result.error.id } };
  return { ok: true, value: { id: result.value.id } };
}

export async function updateCommentAction(
  input: CommentUpdateInput,
  csrfToken: string | null = null,
): Promise<ActionResult> {
  const csrfOk = await guardCsrf(csrfToken);
  if (!csrfOk.ok) return { ok: false, error: { id: "E_AUTH_CSRF" } };

  const parsed = commentUpdateInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: { id: ERROR_IDS.COMMENT_INPUT_INVALID } };

  const { actor } = await createContext();
  if (actor === null) return { ok: false, error: { id: ERROR_IDS.AUTH_SESSION_DEAD } };

  const result = await updateComment(db, actor, parsed.data.commentId, parsed.data.body, SIG());
  if (!result.ok) return { ok: false, error: { id: result.error.id } };
  return { ok: true, value: { id: result.value.id } };
}

export async function deleteCommentAction(
  input: CommentDeleteInput,
  csrfToken: string | null = null,
): Promise<ActionResult> {
  const csrfOk = await guardCsrf(csrfToken);
  if (!csrfOk.ok) return { ok: false, error: { id: "E_AUTH_CSRF" } };

  const parsed = commentDeleteInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: { id: ERROR_IDS.COMMENT_INPUT_INVALID } };

  const { actor } = await createContext();
  if (actor === null) return { ok: false, error: { id: ERROR_IDS.AUTH_SESSION_DEAD } };

  const result = await deleteComment(db, actor, parsed.data.commentId, SIG());
  if (!result.ok) return { ok: false, error: { id: result.error.id } };
  return { ok: true, value: { id: result.value.id } };
}
