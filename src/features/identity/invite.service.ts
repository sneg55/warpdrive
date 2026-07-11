import { eq } from "drizzle-orm";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import { PERMISSION_FLAGS } from "@/constants/permissionFlags";
import type { Db } from "@/db/client";
import { users, visibilityGroupMembers } from "@/db/schema";
import { readSeedHandles } from "@/features/auth/seed";
import type { PermSetUser } from "@/features/permissions/effective";
import { err, ok, type Result } from "@/types/result";
import { recordAudit } from "./audit";

// Postgres unique_violation: races the pre-check when two invites of the same email land
// concurrently (mirrors the pattern in features/email/oauth.ts).
const PG_UNIQUE_VIOLATION = "23505";

function pgErrorCode(e: unknown): string | undefined {
  let cur: unknown = e;
  for (let depth = 0; depth < 5 && typeof cur === "object" && cur !== null; depth++) {
    if ("code" in cur) {
      const code = cur.code;
      if (typeof code === "string") return code;
    }
    cur = "cause" in cur ? cur.cause : undefined;
  }
  return undefined;
}

export interface InviteUserInput {
  email: string;
  name: string;
  isAdmin: boolean;
}

// Pre-authorizes an email for Google SSO: inserts a placeholder user row (googleSub NULL,
// invitedAt set) that upsertUserOnLogin adopts on that email's first verified login
// (see auth/bootstrap.ts). Gated behind permissions.manage / admin, same as the rest of
// the users.service mutations.
export async function inviteUser(
  db: Db,
  actor: PermSetUser,
  input: InviteUserInput,
  signal: AbortSignal,
): Promise<Result<{ userId: string }, AppError>> {
  if (actor.type !== "admin" && !actor.flags.has(PERMISSION_FLAGS.MANAGE)) {
    return err(
      new AppError(ERROR_IDS.PERM_DENIED, "permissions.manage required to invite users", {}),
    );
  }

  // A MANAGE-only (non-admin) actor may invite regular users but must not be able to
  // pre-create an admin account: that would let a non-admin escalate to admin via invite.
  if (input.isAdmin && actor.type !== "admin") {
    return err(new AppError(ERROR_IDS.PERM_DENIED, "only admins may invite admin users", {}));
  }

  signal.throwIfAborted();
  const email = input.email.trim().toLowerCase();

  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (existing[0] !== undefined) {
    return err(new AppError(ERROR_IDS.AUTH_EMAIL_TAKEN, "email already registered", { email }));
  }

  signal.throwIfAborted();

  try {
    const userId = await db.transaction(async (tx) => {
      const seed = await readSeedHandles(tx, signal);
      signal.throwIfAborted();

      const [created] = await tx
        .insert(users)
        .values({
          email,
          name: input.name,
          googleSub: null,
          invitedAt: new Date(),
          isAdmin: input.isAdmin,
          permissionSetId: input.isAdmin ? seed.adminSetId : seed.regularSetId,
          primaryVisibilityGroupId: seed.everyoneGroupId,
        })
        .returning();
      if (created === undefined) {
        throw new AppError(ERROR_IDS.DB_INSERT_FAILED, "invite insert returned no rows");
      }

      // Auto-join the Everyone group, same as a real first login (ops spec E6), so the
      // invited placeholder is already visibility-correct before it is ever adopted.
      await tx
        .insert(visibilityGroupMembers)
        .values({ groupId: seed.everyoneGroupId, userId: created.id })
        .onConflictDoNothing();

      // Inviting a user is a privileged, security-relevant action (especially with
      // isAdmin: true, which silently pre-authorizes a future admin account), so it must
      // be audited like the sibling mutations in users.service.ts. Written in the same
      // transaction as the insert: either both land or neither does.
      await recordAudit(
        tx,
        {
          actorId: actor.id,
          targetType: "user",
          targetId: created.id,
          action: "user.invite",
          after: { email, isAdmin: input.isAdmin },
        },
        signal,
      );

      return created.id;
    });
    return ok({ userId });
  } catch (e) {
    if (pgErrorCode(e) === PG_UNIQUE_VIOLATION) {
      return err(new AppError(ERROR_IDS.AUTH_EMAIL_TAKEN, "email already registered", { email }));
    }
    throw e;
  }
}
