"use server";

import { AppError, ERROR_IDS } from "@/constants/errorIds";
import { db } from "@/db/client";
import { guardCsrf } from "@/features/identity/actions/shared";
import type { PermSetUser } from "@/features/permissions/effective";
import { createContext } from "@/server/trpc/context";
import { type ActionResult, clientErr, toClientResult } from "@/types/actionResult";
import { err, type Result } from "@/types/result";
import { confirmUpload, requestDownload, requestUpload } from "./actions";
import type { RequestUploadInput } from "./schemas";
import { makeStorageClient, type PresignedPost } from "./storage";

const CSRF_FAIL = (): Result<never, AppError> =>
  err(new AppError(ERROR_IDS.PERM_DENIED, "csrf check failed", {}));
const UNAUTH = (): Result<never, AppError> =>
  err(new AppError(ERROR_IDS.PERM_DENIED, "unauthenticated", {}));

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
): Promise<ActionResult<{ fileId: string; post: PresignedPost }>> {
  const who = await guardedActor(csrfToken);
  if (!who.ok) return clientErr(who.error);
  const signal = AbortSignal.timeout(8000);
  const storage = makeStorageClient();
  return toClientResult(
    await requestUpload(db, { actor: who.value, storage, input: rawInput }, signal),
  );
}

export async function confirmUploadAction(
  csrfToken: string | null,
  fileId: string,
): Promise<ActionResult<{ status: "ready" }>> {
  const who = await guardedActor(csrfToken);
  if (!who.ok) return clientErr(who.error);
  const signal = AbortSignal.timeout(8000);
  const storage = makeStorageClient();
  return toClientResult(await confirmUpload(db, { actor: who.value, storage, fileId }, signal));
}

export async function requestDownloadAction(
  csrfToken: string | null,
  fileId: string,
): Promise<ActionResult<{ url: string }>> {
  const who = await guardedActor(csrfToken);
  if (!who.ok) return clientErr(who.error);
  const signal = AbortSignal.timeout(8000);
  const storage = makeStorageClient();
  return toClientResult(await requestDownload(db, { actor: who.value, storage, fileId }, signal));
}
