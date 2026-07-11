"use server";

import { AppError, ERROR_IDS } from "@/constants/errorIds";
import { db } from "@/db/client";
import { guardCsrf } from "@/features/identity/actions/shared";
import { SIG } from "@/features/identity/actions/sig";
import type { AuthUser } from "@/features/permissions/types";
import { createContext } from "@/server/trpc/context";
import { err, type Result } from "@/types/result";
import { deleteDraft, saveDraft } from "./draftRepo";
import {
  archiveInput,
  cancelOutboxInput,
  deleteDraftInput,
  saveDraftInput,
} from "./folderActions.schemas";
import { assertMailboxOwner } from "./mailboxOwnership";
import { cancelOutbox } from "./outboxCancel";
import { archiveThread, unarchiveThread } from "./threadArchive";

const CSRF_FAIL = () => err(new AppError(ERROR_IDS.PERM_DENIED, "csrf check failed", {}));
const UNAUTH = () => err(new AppError(ERROR_IDS.AUTH_LOGIN_REJECTED, "unauthenticated", {}));

// The folder domain functions scope every query by actor.id alone; the rest of the AuthUser
// shape is not consulted, so a minimal regular-actor projection is sufficient here.
const toActor = (id: string): AuthUser => ({
  id,
  type: "regular",
  isActive: true,
  groupIds: new Set(),
});

async function actor(csrfToken: string | null): Promise<Result<{ id: string }, AppError>> {
  const csrf = await guardCsrf(csrfToken);
  if (!csrf.ok) return CSRF_FAIL();
  const ctx = await createContext();
  if (ctx.actor === null) return UNAUTH();
  return { ok: true, value: { id: ctx.actor.id } };
}

async function archiveOrUnarchive(
  csrfToken: string | null,
  rawInput: unknown,
  op: typeof archiveThread,
): Promise<Result<{ threadId: string }, AppError>> {
  const who = await actor(csrfToken);
  if (!who.ok) return who;
  const parsed = archiveInput.safeParse(rawInput);
  if (!parsed.success)
    return err(
      new AppError(ERROR_IDS.GMAIL_FOLDER_INPUT_INVALID, "invalid archive input", {
        issues: parsed.error.issues,
      }),
    );
  return op(
    db,
    {
      actor: toActor(who.value.id),
      threadId: parsed.data.threadId,
    },
    SIG(),
  );
}

export async function archiveThreadAction(
  csrfToken: string | null,
  rawInput: unknown,
): Promise<Result<{ threadId: string }, AppError>> {
  return archiveOrUnarchive(csrfToken, rawInput, archiveThread);
}

export async function unarchiveThreadAction(
  csrfToken: string | null,
  rawInput: unknown,
): Promise<Result<{ threadId: string }, AppError>> {
  return archiveOrUnarchive(csrfToken, rawInput, unarchiveThread);
}

export async function saveDraftAction(
  csrfToken: string | null,
  rawInput: unknown,
): Promise<Result<{ id: string }, AppError>> {
  const who = await actor(csrfToken);
  if (!who.ok) return who;
  const parsed = saveDraftInput.safeParse(rawInput);
  if (!parsed.success)
    return err(
      new AppError(ERROR_IDS.GMAIL_DRAFT_INPUT_INVALID, "invalid draft input", {
        issues: parsed.error.issues,
      }),
    );
  const signal = SIG();
  const owner = await assertMailboxOwner(db, parsed.data.accountId, who.value.id, signal);
  if (!owner.ok) return owner;
  return saveDraft(
    db,
    {
      actor: toActor(who.value.id),
      draft: parsed.data,
    },
    signal,
  );
}

export async function deleteDraftAction(
  csrfToken: string | null,
  rawInput: unknown,
): Promise<Result<{ id: string }, AppError>> {
  const who = await actor(csrfToken);
  if (!who.ok) return who;
  const parsed = deleteDraftInput.safeParse(rawInput);
  if (!parsed.success)
    return err(
      new AppError(ERROR_IDS.GMAIL_DRAFT_INPUT_INVALID, "invalid draft id", {
        issues: parsed.error.issues,
      }),
    );
  return deleteDraft(
    db,
    {
      actor: toActor(who.value.id),
      draftId: parsed.data.draftId,
    },
    SIG(),
  );
}

export async function cancelOutboxAction(
  csrfToken: string | null,
  rawInput: unknown,
): Promise<Result<{ id: string }, AppError>> {
  const who = await actor(csrfToken);
  if (!who.ok) return who;
  const parsed = cancelOutboxInput.safeParse(rawInput);
  if (!parsed.success)
    return err(
      new AppError(ERROR_IDS.GMAIL_FOLDER_INPUT_INVALID, "invalid attempt id", {
        issues: parsed.error.issues,
      }),
    );
  return cancelOutbox(
    db,
    {
      actor: toActor(who.value.id),
      attemptId: parsed.data.attemptId,
    },
    SIG(),
  );
}
