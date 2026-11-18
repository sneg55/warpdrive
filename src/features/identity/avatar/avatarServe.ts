import { z } from "zod";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { StorageClient } from "@/features/files/storage";
import { err, ok, type Result } from "@/types/result";
import { avatarObjectKey } from "./avatarStorage";

const userId = z.string().uuid();

export async function resolveAvatarBytes(
  storage: StorageClient,
  rawUserId: string,
  signal: AbortSignal,
): Promise<Result<{ bytes: Buffer; contentType: string }, AppError>> {
  signal.throwIfAborted();
  const parsed = userId.safeParse(rawUserId);
  if (!parsed.success) {
    return err(new AppError(ERROR_IDS.USER_AVATAR_INVALID, "invalid user id", {}));
  }

  const key = avatarObjectKey(parsed.data);
  const head = await storage.headObject(key, signal);
  if (!head.ok) return head;
  signal.throwIfAborted();

  const bytes = await storage.getObjectBytes(key, signal);
  if (!bytes.ok) return bytes;
  return ok({
    bytes: bytes.value,
    contentType: head.value.contentType ?? "application/octet-stream",
  });
}
