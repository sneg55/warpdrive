/**
 * devLoginCore: unit-testable core for the dev-only login route.
 *
 * Production guard: this module's exported function always checks both
 *   env.NODE_ENV !== "production" AND env.ALLOW_FIRST_LOGIN_ADMIN === true
 * before touching the database. The env boundary already rejects
 * ALLOW_FIRST_LOGIN_ADMIN=true in production, so the flag is a safe dev-only switch.
 */

import { z } from "zod";
import type { Db } from "@/db/client";
import { err, ok, type Result } from "@/types/result";
import type { VerifiedIdentity } from "./bootstrap";
import { upsertUserOnLogin } from "./bootstrap";
import { createSession } from "./session";

// Minimal env surface we need (injected for testability).
export interface DevLoginEnv {
  nodeEnv: string;
  allowFirstLoginAdmin: boolean;
  workspaceDomain: string;
}

// Thin email schema: valid format, no magic strings.
const emailSchema = z.string().email().min(1).max(254);

export interface DevLoginDeps {
  db: Db;
  appEnv: DevLoginEnv;
  signal: AbortSignal;
}

export interface DevLoginOk {
  userId: string;
  isAdmin: boolean;
  sid: string;
  expiresAt: Date;
}

/**
 * Runs the same upsert + session-creation path as the real OAuth callback,
 * but bypasses Google entirely. ONLY runs when the guard is satisfied.
 *
 * Returns err("disabled") when the guard blocks (production or flag off).
 * Returns err("invalid_email") for malformed input.
 * Returns err(reason) for any downstream failure.
 */
export async function devLoginCore(
  rawEmail: unknown,
  deps: DevLoginDeps,
): Promise<Result<DevLoginOk, string>> {
  const { db, appEnv, signal } = deps;

  // Production guard: refuse unless dev/test environment with the flag explicitly set.
  if (appEnv.nodeEnv === "production" || !appEnv.allowFirstLoginAdmin) {
    return err("disabled");
  }

  signal.throwIfAborted();

  const parsed = emailSchema.safeParse(rawEmail);
  if (!parsed.success) return err("invalid_email");

  const email = parsed.data.trim().toLowerCase();

  const identity: VerifiedIdentity = {
    email,
    sub: `dev-${email}`,
    name: email,
    avatarUrl: null,
  };

  const upsertResult = await upsertUserOnLogin(db, identity, signal);
  if (!upsertResult.ok) return err(`upsert failed: ${upsertResult.error}`);

  const sessionResult = await createSession(db, upsertResult.value.userId, signal);
  if (!sessionResult.ok) return err(`session failed: ${sessionResult.error}`);

  return ok({
    userId: upsertResult.value.userId,
    isAdmin: upsertResult.value.isAdmin,
    sid: sessionResult.value.sid,
    expiresAt: sessionResult.value.expiresAt,
  });
}
