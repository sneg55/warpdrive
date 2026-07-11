import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import { users } from "@/db/schema";
import type { PresignedPost, StorageClient } from "@/features/files/storage";
import { err, ok, type Result } from "@/types/result";
import {
  AVATAR_MAX_BYTES,
  avatarObjectKey,
  avatarPublicUrl,
  avatarUploadKey,
  isAvatarContentType,
} from "./avatarStorage";
import { sniffImageType } from "./imageSniff";

// Only the actor's own id is needed: a user sets their own avatar (self-authz), so the
// key is derived from the session id and there is no per-entity permission check.
export interface AvatarActor {
  id: string;
}

const requestInput = z.object({
  contentType: z.string(),
  size: z.number().int().positive().max(AVATAR_MAX_BYTES),
});

function invalid(message: string): AppError {
  return new AppError(ERROR_IDS.USER_AVATAR_INVALID, message, {});
}

interface RequestArgs {
  actor: AvatarActor;
  storage: StorageClient;
  input: { contentType: string; size: number };
}

// Validate the requested type/size, then presign a POST pinned to the actor's own stable upload
// key with the 2 MB avatar cap (so the storage layer, not just this client-side/confirm check,
// rejects oversize uploads). No DB row is written: confirm re-derives the key from the
// server-trusted actor id and validates the uploaded object's real bytes.
export async function requestAvatarUpload(
  args: RequestArgs,
  signal: AbortSignal,
): Promise<Result<{ post: PresignedPost }, AppError>> {
  signal.throwIfAborted();
  const parsed = requestInput.safeParse(args.input);
  if (!parsed.success || !isAvatarContentType(parsed.data.contentType)) {
    return err(invalid("invalid avatar upload input"));
  }
  const key = avatarUploadKey(args.actor.id);
  const post = await args.storage.presignPost(
    key,
    parsed.data.contentType,
    signal,
    AVATAR_MAX_BYTES,
  );
  if (!post.ok) return post;
  return ok({ post: post.value });
}

interface ConfirmArgs {
  actor: AvatarActor;
  storage: StorageClient;
}

// Promote the uploaded object to the confirmed avatar. Validate the uploaded object's REAL bytes
// FIRST (before touching the live confirmed key), because the presigned-POST policy pins the
// object's declared Content-Type, so a HEAD only echoes the client's requested type and cannot
// detect a client that declared image/png but POSTed other bytes. Sniffing the actual magic bytes
// (and re-checking size on the real object) is the true "is this an image under the cap" gate;
// validating before the copy means a bad upload never overwrites the user's current avatar. Only
// then copy to the confirmed key (which the still-valid presigned POST can never target, F33) and
// point avatar_url at a freshly versioned serve URL that busts the browser cache.
export async function confirmAvatarUpload(
  db: Db,
  args: ConfirmArgs,
  signal: AbortSignal,
): Promise<Result<{ avatarUrl: string }, AppError>> {
  signal.throwIfAborted();
  const uploadKey = avatarUploadKey(args.actor.id);
  const destKey = avatarObjectKey(args.actor.id);

  const bytes = await args.storage.getObjectBytes(uploadKey, signal);
  if (!bytes.ok) return bytes;
  signal.throwIfAborted();

  if (
    bytes.value.length === 0 ||
    bytes.value.length > AVATAR_MAX_BYTES ||
    sniffImageType(bytes.value) === null
  ) {
    // Reject and remove the upload object so no orphan is left behind. The confirmed key (the
    // user's current avatar, if any) is untouched.
    await args.storage.deleteObject(uploadKey, signal);
    return err(invalid("uploaded object is not a valid avatar image"));
  }

  const copied = await args.storage.copyObject(uploadKey, destKey, signal);
  if (!copied.ok) return copied;
  signal.throwIfAborted();

  const url = avatarPublicUrl(args.actor.id, randomUUID());
  await db.update(users).set({ avatarUrl: url }).where(eq(users.id, args.actor.id));
  signal.throwIfAborted();

  // Best-effort cleanup: the confirmed copy is now the source of truth, so the mutable upload
  // object is a harmless orphan if this fails (never served, never referenced) and is overwritten
  // by the user's next upload regardless.
  await args.storage.deleteObject(uploadKey, signal);
  return ok({ avatarUrl: url });
}

interface RemoveArgs {
  actor: AvatarActor;
  storage: StorageClient;
}

// Clear avatar_url and delete the confirmed object. The DB update is the authoritative
// change (Avatar falls back to initials on a null url); the object delete is best-effort.
export async function removeAvatar(
  db: Db,
  args: RemoveArgs,
  signal: AbortSignal,
): Promise<Result<{ removed: true }, AppError>> {
  signal.throwIfAborted();
  await db.update(users).set({ avatarUrl: null }).where(eq(users.id, args.actor.id));
  signal.throwIfAborted();
  await args.storage.deleteObject(avatarObjectKey(args.actor.id), signal);
  return ok({ removed: true });
}
