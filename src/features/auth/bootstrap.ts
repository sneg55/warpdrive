import { eq, sql } from "drizzle-orm";
import { env } from "@/config/env";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import { settings, users, visibilityGroupMembers } from "@/db/schema";
import { isUploadedAvatarUrl } from "@/features/identity/avatar/avatarStorage";
import { err, ok, type Result } from "@/types/result";
import { ensureSeedData, readSeedHandles } from "./seed";

const BOOTSTRAP_LOCK_KEY = 815_274_001n;

export interface VerifiedIdentity {
  email: string;
  sub: string;
  name: string;
  avatarUrl: string | null;
}

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
      await tx.execute(sql`SELECT pg_advisory_xact_lock(${BOOTSTRAP_LOCK_KEY})`);
      signal.throwIfAborted();

      const bySub = await tx.select().from(users).where(eq(users.googleSub, identity.sub)).limit(1);
      if (bySub[0] !== undefined) {
        const avatarUrl = isUploadedAvatarUrl(bySub[0].avatarUrl)
          ? bySub[0].avatarUrl
          : identity.avatarUrl;
        await tx
          .update(users)
          .set({ name: identity.name, avatarUrl, email })
          .where(eq(users.id, bySub[0].id));
        return { kind: "ok", userId: bySub[0].id, isAdmin: bySub[0].isAdmin };
      }

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
