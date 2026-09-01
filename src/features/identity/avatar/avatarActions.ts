"use server";

import { AppError, ERROR_IDS } from "@/constants/errorIds";
import { db } from "@/db/client";
import { makeStorageClient, type PresignedPost } from "@/features/files/storage";
import { guardCsrf } from "@/features/identity/actions/shared";
import { SIG } from "@/features/identity/actions/sig";
import { createContext } from "@/server/trpc/context";
import { type ActionResult, clientErr, toClientResult } from "@/types/actionResult";
import { err, type Result } from "@/types/result";
import { confirmAvatarUpload, removeAvatar, requestAvatarUpload } from "./avatarService";

// Client-callable server actions for the avatar presigned-upload handshake. Auth comes from
// the server session; every mutation is CSRF-guarded before any write.
async function authorize(csrfToken: string | null): Promise<Result<{ id: string }, AppError>> {
  const csrf = await guardCsrf(csrfToken);
  if (!csrf.ok) return err(new AppError(ERROR_IDS.PERM_DENIED, "csrf failed", {}));
  const { actor } = await createContext();
  if (actor === null) return err(new AppError(ERROR_IDS.PERM_DENIED, "unauthenticated", {}));
  return { ok: true, value: { id: actor.id } };
}

export async function requestAvatarUploadAction(
  input: { contentType: string; size: number },
  csrfToken: string | null = null,
): Promise<ActionResult<{ post: PresignedPost }>> {
  const a = await authorize(csrfToken);
  if (!a.ok) return clientErr(a.error);
  return toClientResult(
    await requestAvatarUpload({ actor: a.value, storage: makeStorageClient(), input }, SIG()),
  );
}

export async function confirmAvatarUploadAction(
  csrfToken: string | null = null,
): Promise<ActionResult<{ avatarUrl: string }>> {
  const a = await authorize(csrfToken);
  if (!a.ok) return clientErr(a.error);
  return toClientResult(
    await confirmAvatarUpload(db, { actor: a.value, storage: makeStorageClient() }, SIG()),
  );
}

export async function removeAvatarAction(
  csrfToken: string | null = null,
): Promise<ActionResult<{ removed: true }>> {
  const a = await authorize(csrfToken);
  if (!a.ok) return clientErr(a.error);
  return toClientResult(
    await removeAvatar(db, { actor: a.value, storage: makeStorageClient() }, SIG()),
  );
}
