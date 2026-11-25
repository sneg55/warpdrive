import { and, eq, sql } from "drizzle-orm";
import { env } from "@/config/env";
import { AppError, ERROR_IDS } from "@/constants/errorIds";
import type { Db } from "@/db/client";
import { settings, userIdentities, users, visibilityGroupMembers } from "@/db/schema";
import { isUploadedAvatarUrl } from "@/features/identity/avatar/avatarStorage";
import { err, ok, type Result } from "@/types/result";
import { ensureSeedData, readSeedHandles, type Tx } from "./seed";

const BOOTSTRAP_LOCK_KEY = 815_274_001n;

export interface VerifiedIdentity {
  email: string;
  sub: string;
  name: string | null;
  preferredUsername: string | null;
  avatarUrl: string | null;
}

export interface LoginIdentity {
  provider: string;
  identity: VerifiedIdentity;
}

function fallbackName(identity: VerifiedIdentity, email: string): string {
  if (identity.name !== null && identity.name.trim().length > 0) return identity.name;
  if (identity.preferredUsername !== null && identity.preferredUsername.trim().length > 0) {
    return identity.preferredUsername;
  }
  return email.split("@")[0] ?? email;
}

function fallbackAvatar(identity: VerifiedIdentity, current: string | null): string | null {
  if (identity.avatarUrl !== null) return identity.avatarUrl;
  return current;
}

type Outcome = { kind: "ok"; userId: string; isAdmin: boolean } | { kind: "conflict" };

async function signInKnownIdentity(
  tx: Tx,
  provider: string,
  identity: VerifiedIdentity,
  email: string,
): Promise<Outcome | null> {
  const byIdentity = await tx
    .select({
      id: users.id,
      name: users.name,
      avatarUrl: users.avatarUrl,
      isAdmin: users.isAdmin,
    })
    .from(userIdentities)
    .innerJoin(users, eq(users.id, userIdentities.userId))
    .where(and(eq(userIdentities.provider, provider), eq(userIdentities.subject, identity.sub)))
    .limit(1);
  const existing = byIdentity[0];
  if (existing === undefined) return null;

  const emailOwner = await tx
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, email))
    .limit(1);
  if (emailOwner[0] !== undefined && emailOwner[0].id !== existing.id) return { kind: "conflict" };

  const avatarUrl = isUploadedAvatarUrl(existing.avatarUrl)
    ? existing.avatarUrl
    : fallbackAvatar(identity, existing.avatarUrl);
  await tx
    .update(users)
    .set({
      ...(identity.name !== null ? { name: identity.name } : {}),
      avatarUrl,
      email,
    })
    .where(eq(users.id, existing.id));
  return { kind: "ok", userId: existing.id, isAdmin: existing.isAdmin };
}

async function adoptByEmail(
  tx: Tx,
  provider: string,
  identity: VerifiedIdentity,
  email: string,
): Promise<Outcome | null> {
  const byEmail = await tx.select().from(users).where(eq(users.email, email)).limit(1);
  const candidate = byEmail[0];
  if (candidate === undefined) return null;

  const linked = await tx
    .select({ id: userIdentities.id })
    .from(userIdentities)
    .where(eq(userIdentities.userId, candidate.id));
  if (linked.length > 0) return { kind: "conflict" };

  await tx.insert(userIdentities).values({ userId: candidate.id, provider, subject: identity.sub });
  const avatarUrl = isUploadedAvatarUrl(candidate.avatarUrl)
    ? candidate.avatarUrl
    : fallbackAvatar(identity, candidate.avatarUrl);
  await tx
    .update(users)
    .set({
      ...(identity.name !== null ? { name: identity.name } : {}),
      avatarUrl,
      invitedAt: null,
    })
    .where(eq(users.id, candidate.id));
  return { kind: "ok", userId: candidate.id, isAdmin: candidate.isAdmin };
}

async function createUserFromIdentity(
  tx: Tx,
  provider: string,
  identity: VerifiedIdentity,
  email: string,
  signal: AbortSignal,
): Promise<Outcome> {
  const [s] = await tx.select({ bootstrappedAt: settings.bootstrappedAt }).from(settings).limit(1);
  const bootstrapOpen = s === undefined || s.bootstrappedAt === null;

  const seed = bootstrapOpen ? await ensureSeedData(tx, signal) : await readSeedHandles(tx, signal);

  signal.throwIfAborted();

  const seedAdmin = env.SEED_ADMIN_EMAIL.trim().toLowerCase();
  const electAdmin = bootstrapOpen && seedAdmin.length > 0 && email === seedAdmin;

  const [created] = await tx
    .insert(users)
    .values({
      email,
      name: fallbackName(identity, email),
      avatarUrl: fallbackAvatar(identity, null),
      isAdmin: electAdmin,
      permissionSetId: electAdmin ? seed.adminSetId : seed.regularSetId,
      primaryVisibilityGroupId: seed.everyoneGroupId,
    })
    .returning();

  if (created === undefined) {
    throw new AppError(ERROR_IDS.DB_INVARIANT, "user insert failed");
  }

  await tx.insert(userIdentities).values({ userId: created.id, provider, subject: identity.sub });

  await tx
    .insert(visibilityGroupMembers)
    .values({ groupId: seed.everyoneGroupId, userId: created.id })
    .onConflictDoNothing();

  if (electAdmin) {
    await tx.update(settings).set({ bootstrappedAt: new Date() }).where(eq(settings.id, true));
  }

  return { kind: "ok", userId: created.id, isAdmin: created.isAdmin };
}

export async function upsertUserOnLogin(
  db: Db,
  login: LoginIdentity,
  signal: AbortSignal,
): Promise<Result<{ userId: string; isAdmin: boolean }, string>> {
  signal.throwIfAborted();
  const { provider, identity } = login;
  const email = identity.email.trim().toLowerCase();

  const result = await db.transaction(async (tx): Promise<Outcome> => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${BOOTSTRAP_LOCK_KEY})`);
    signal.throwIfAborted();

    const known = await signInKnownIdentity(tx, provider, identity, email);
    if (known !== null) return known;

    const adopted = await adoptByEmail(tx, provider, identity, email);
    if (adopted !== null) return adopted;

    return createUserFromIdentity(tx, provider, identity, email, signal);
  });

  signal.throwIfAborted();
  if (result.kind === "conflict") {
    return err("identity_conflict: email is already bound to a different sign-in identity");
  }
  return ok({ userId: result.userId, isAdmin: result.isAdmin });
}
