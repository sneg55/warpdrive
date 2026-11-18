import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type * as schema from "@/db/schema";
import { users } from "@/db/schema/identity";
import { err, ok, type Result } from "@/types/result";
import { mayTransferOwner, toTransferActor } from "./mayTransferOwner";

type Db = NodePgDatabase<typeof schema>;

export interface EntityCreateSession {
  userId: string;
  isAdmin: boolean;
  isActive: boolean;
  sessionLive: boolean;
  visibilityGroupIds: string[];
  managedUserIds?: string[];
  primaryVisibilityGroupId: string | null;
  flags: Record<string, boolean>;
}

export async function resolveOwnerId(
  db: Db,
  session: EntityCreateSession,
  requested: string | undefined,
  signal: AbortSignal,
): Promise<Result<string, AppError>> {
  if (requested === undefined || !mayTransferOwner(toTransferActor(session), session.userId)) {
    return ok(session.userId);
  }
  const [target] = await db.select({ id: users.id }).from(users).where(eq(users.id, requested));
  signal.throwIfAborted();
  if (target === undefined) {
    return err(
      new AppError(ERROR_IDS.USER_NOT_FOUND, "Owner override target not found", { requested }),
    );
  }
  return ok(target.id);
}

export function resolveVisibilityGroup(
  session: EntityCreateSession,
  requestedGroupId: string | undefined,
): Result<string, AppError> {
  if (requestedGroupId !== undefined && session.visibilityGroupIds.includes(requestedGroupId)) {
    return ok(requestedGroupId);
  }
  if (session.primaryVisibilityGroupId !== null) {
    return ok(session.primaryVisibilityGroupId);
  }
  return err(
    new AppError(ERROR_IDS.PERM_GROUP_REQUIRED, "No resolvable visibility group", {
      userId: session.userId,
    }),
  );
}
