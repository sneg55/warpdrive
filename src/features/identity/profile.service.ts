import { eq } from "drizzle-orm";
import { z } from "zod";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import { users } from "@/db/schema";
import { err, ok, type Result } from "@/types/result";

const profileInput = z.object({ name: z.string().trim().min(1).max(255) });

// Updates the actor's own display name. Wave 1 scope: name only, avatar upload deferred.
export async function updateUserProfile(
  db: Db,
  input: { actorId: string; name: string },
  signal: AbortSignal,
): Promise<Result<{ name: string }, AppError>> {
  signal.throwIfAborted();
  const parsed = profileInput.safeParse({ name: input.name });
  if (!parsed.success) {
    return err(new AppError(ERROR_IDS.USER_PROFILE_INVALID, "invalid profile input", {}));
  }
  await db.update(users).set({ name: parsed.data.name }).where(eq(users.id, input.actorId));
  signal.throwIfAborted();
  return ok({ name: parsed.data.name });
}
