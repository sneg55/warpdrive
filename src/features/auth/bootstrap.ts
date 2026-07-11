import { eq, sql } from "drizzle-orm";
import { env } from "@/config/env";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import { settings, users, visibilityGroupMembers } from "@/db/schema";
import { err, ok, type Result } from "@/types/result";
import { ensureSeedData, readSeedHandles } from "./seed";

// Stable advisory-lock key for the bootstrap election (any fixed bigint).
const BOOTSTRAP_LOCK_KEY = 815_274_001n;

export interface VerifiedIdentity {
  email: string;
  sub: string;
  name: string;
  avatarUrl: string | null;
}

// One transaction: advisory lock -> seed-if-empty -> elect-or-create -> auto-join Everyone.
// Race-safe: pg_advisory_xact_lock serialises concurrent first logins so exactly one
// user can be elected admin (the one matching SEED_ADMIN_EMAIL when bootstrappedAt IS NULL).
export async function upsertUserOnLogin(
  db: Db,
  identity: VerifiedIdentity,
  signal: AbortSignal,
): Promise<Result<{ userId: string; isAdmin: boolean }, string>> {
  signal.throwIfAborted();
  const email = identity.email.trim().toLowerCase();

  const result = await db.transaction(
    async (
      tx,
    ): Promise<{ kind: "ok"; userId: string; isAdmin: boolean } | { kind: "conflict" }> => {
      // Serialize the election: two concurrent first logins cannot both self-promote.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${BOOTSTRAP_LOCK_KEY})`);
      signal.throwIfAborted();

      // Primary binding is the STABLE Google subject, never the email (a Workspace address
      // can be reassigned or recreated). Same subject re-logging in: refresh profile and
      // email (the email may have changed in Google), never re-elect admin (F25).
      const bySub = await tx.select().from(users).where(eq(users.googleSub, identity.sub)).limit(1);
      if (bySub[0] !== undefined) {
        await tx
          .update(users)
          .set({ name: identity.name, avatarUrl: identity.avatarUrl, email })
          .where(eq(users.id, bySub[0].id));
        return { kind: "ok", userId: bySub[0].id, isAdmin: bySub[0].isAdmin };
      }

      // No account for this subject. If the email already belongs to a DIFFERENT subject, the
      // address was reassigned/recreated: fail closed (identity conflict), never rebind the
      // old CRM user (and its admin state) to the new Google identity (F25). The one exception
      // is a googleSub IS NULL placeholder: that row was created by inviteUser specifically to
      // be claimed by whoever first signs in with this verified email (Task 11), so bind the
      // real Google identity now instead of rejecting.
      const byEmail = await tx
        .select({ id: users.id, googleSub: users.googleSub })
        .from(users)
        .where(eq(users.email, email));
      if (byEmail[0] !== undefined) {
        if (byEmail[0].googleSub === null) {
          const [adopted] = await tx
            .update(users)
            .set({
              googleSub: identity.sub,
              name: identity.name,
              avatarUrl: identity.avatarUrl,
              invitedAt: null,
            })
            .where(eq(users.id, byEmail[0].id))
            .returning({ id: users.id, isAdmin: users.isAdmin });
          if (adopted === undefined) {
            throw new AppError(ERROR_IDS.DB_INVARIANT, "invited placeholder adoption failed");
          }
          return { kind: "ok", userId: adopted.id, isAdmin: adopted.isAdmin };
        }
        return { kind: "conflict" };
      }

      // Check whether bootstrap is still open (bootstrappedAt IS NULL means no admin elected yet).
      const [s] = await tx
        .select({ bootstrappedAt: settings.bootstrappedAt })
        .from(settings)
        .limit(1);
      const bootstrapOpen = s === undefined || s.bootstrappedAt === null;

      const seed = bootstrapOpen
        ? await ensureSeedData(tx, signal)
        : await readSeedHandles(tx, signal);

      signal.throwIfAborted();

      const seedAdmin = env.SEED_ADMIN_EMAIL.trim().toLowerCase();
      const electAdmin = bootstrapOpen && seedAdmin.length > 0 && email === seedAdmin;

      const [created] = await tx
        .insert(users)
        .values({
          email,
          name: identity.name,
          avatarUrl: identity.avatarUrl,
          googleSub: identity.sub,
          isAdmin: electAdmin,
          permissionSetId: electAdmin ? seed.adminSetId : seed.regularSetId,
          primaryVisibilityGroupId: seed.everyoneGroupId,
        })
        .returning();

      if (created === undefined) {
        throw new AppError(ERROR_IDS.DB_INVARIANT, "user insert failed");
      }

      // Auto-join the Everyone group so group-level deals are visible (ops spec E6).
      await tx
        .insert(visibilityGroupMembers)
        .values({ groupId: seed.everyoneGroupId, userId: created.id })
        .onConflictDoNothing();

      if (electAdmin) {
        await tx.update(settings).set({ bootstrappedAt: new Date() }).where(eq(settings.id, true));
      }

      return { kind: "ok", userId: created.id, isAdmin: created.isAdmin };
    },
  );

  signal.throwIfAborted();
  if (result.kind === "conflict") {
    return err("google_account_conflict: email is already bound to a different Google identity");
  }
  return ok({ userId: result.userId, isAdmin: result.isAdmin });
}
