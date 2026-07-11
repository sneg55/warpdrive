import { eq } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type * as schema from "@/db/schema";
import { users } from "@/db/schema/identity";
import { err, ok, type Result } from "@/types/result";

type Db = NodePgDatabase<typeof schema>;

// Shared session shape for entity creation (deals, leads). Structurally identical trust-boundary
// context so the ownership/visibility derivation cannot drift between entities.
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

// Owner defaults to the creator; deal.changeOwner (or admin) may assign the entity to another user,
// who must exist. Without the capability a client-supplied ownerId is ignored (no spoofing). Shared
// by createDeal and createLead so this ownership trust boundary can never diverge between them.
export async function resolveOwnerId(
  db: Db,
  session: EntityCreateSession,
  requested: string | undefined,
  signal: AbortSignal,
): Promise<Result<string, AppError>> {
  if (requested === undefined || !(session.isAdmin || session.flags["deal.changeOwner"] === true)) {
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

// Resolve the visibility group for a group-level entity: a client hint (only if the actor is a
// member) > the actor's primary group > reject. Pure; both createDeal and createLead call it so the
// group-defaulting rule stays identical.
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
