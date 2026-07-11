import { z } from "zod";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { StorageClient } from "@/features/files/storage";
import { err, ok, type Result } from "@/types/result";
import { avatarObjectKey } from "./avatarStorage";

const userId = z.string().uuid();

// Fetch a user's confirmed avatar bytes + content type for inline serving. The route wrapper
// gates on an authenticated actor (avatars are shown app-wide, so visibility is not per-viewer);
// this resolver only enforces that userId is a uuid before deriving the key, then streams the
// single stable per-user object. A missing object errors so the route returns 404 and the
// Avatar component falls back to initials.
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
