import { eq } from "drizzle-orm";
import { AppError } from "@/constants/errorIds";
import { users, visibilityGroupMembers } from "@/db/schema";
import type { AuthUser } from "@/features/permissions/types";
import type { DbOrTx } from "@/server/realtime/channelVersions";
import { ok, type Result } from "@/types/result";

export async function hydrateOwner(
  db: DbOrTx,
  userId: string,
  signal: AbortSignal,
): Promise<Result<AuthUser, AppError>> {
  signal.throwIfAborted();
  const [u] = await db
    .select({ id: users.id, isAdmin: users.isAdmin, isActive: users.isActive })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  signal.throwIfAborted();
  if (u === undefined) {
    return { ok: false, error: new AppError("E_USER_001", "mailbox owner not found", { userId }) };
  }

  const groupRows = await db
    .select({ groupId: visibilityGroupMembers.groupId })
    .from(visibilityGroupMembers)
    .where(eq(visibilityGroupMembers.userId, userId));
  signal.throwIfAborted();

  return ok({
    id: u.id,
    type: u.isAdmin ? "admin" : "regular",
    isActive: u.isActive,
    groupIds: new Set(groupRows.map((r) => r.groupId)),
  });
}
