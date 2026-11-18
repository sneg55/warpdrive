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

interface AvatarActor {
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
    await args.storage.deleteObject(uploadKey, signal);
    return err(invalid("uploaded object is not a valid avatar image"));
  }

  const copied = await args.storage.copyObject(uploadKey, destKey, signal);
  if (!copied.ok) return copied;
  signal.throwIfAborted();

  const url = avatarPublicUrl(args.actor.id, randomUUID());
  await db.update(users).set({ avatarUrl: url }).where(eq(users.id, args.actor.id));
  signal.throwIfAborted();

  await args.storage.deleteObject(uploadKey, signal);
  return ok({ avatarUrl: url });
}

interface RemoveArgs {
  actor: AvatarActor;
  storage: StorageClient;
}

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
