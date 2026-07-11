"use server";

import { AppError, ERROR_IDS } from "@/constants/errorIds";
import { db } from "@/db/client";
import { guardCsrf } from "@/features/identity/actions/shared";
import type { PermSetUser } from "@/features/permissions/effective";
import { createContext } from "@/server/trpc/context";
import { err, type Result } from "@/types/result";
import { confirmUpload, requestDownload, requestUpload } from "./actions";
import type { RequestUploadInput } from "./schemas";
import { makeStorageClient, type PresignedPost } from "./storage";

// Client-callable server actions for the presigned-upload handshake.
//
// Auth comes from the server session (never trusted from the client), and, as in every other
// mutation family, the double-submit CSRF token is checked before anything else. A server action is
// a public POST endpoint: authentication alone would still let a cross-site page drive this
// handshake on behalf of a logged-in user.

const CSRF_FAIL = (): Result<never, AppError> =>
  err(new AppError(ERROR_IDS.PERM_DENIED, "csrf check failed", {}));
const UNAUTH = (): Result<never, AppError> =>
  err(new AppError(ERROR_IDS.PERM_DENIED, "unauthenticated", {}));

// Cheap token check first, then the more expensive context build (which hydrates the actor).
async function guardedActor(csrfToken: string | null): Promise<Result<PermSetUser, AppError>> {
  const csrf = await guardCsrf(csrfToken);
  if (!csrf.ok) return CSRF_FAIL();
  const ctx = await createContext();
  if (ctx.actor === null) return UNAUTH();
  return { ok: true, value: ctx.actor };
}

export async function requestUploadAction(
  csrfToken: string | null,
  rawInput: RequestUploadInput,
): Promise<Result<{ fileId: string; post: PresignedPost }, AppError>> {
  const who = await guardedActor(csrfToken);
  if (!who.ok) return who;
  const signal = AbortSignal.timeout(8000);
  const storage = makeStorageClient();
  return requestUpload(db, { actor: who.value, storage, input: rawInput }, signal);
}

export async function confirmUploadAction(
  csrfToken: string | null,
  fileId: string,
): Promise<Result<{ status: "ready" }, AppError>> {
  const who = await guardedActor(csrfToken);
  if (!who.ok) return who;
  const signal = AbortSignal.timeout(8000);
  const storage = makeStorageClient();
  return confirmUpload(db, { actor: who.value, storage, fileId }, signal);
}

export async function requestDownloadAction(
  csrfToken: string | null,
  fileId: string,
): Promise<Result<{ url: string }, AppError>> {
  const who = await guardedActor(csrfToken);
  if (!who.ok) return who;
  const signal = AbortSignal.timeout(8000);
  const storage = makeStorageClient();
  return requestDownload(db, { actor: who.value, storage, fileId }, signal);
}
