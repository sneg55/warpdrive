import { z } from "zod";
import type { Db } from "@/db/client";
import { err, ok, type Result } from "@/types/result";
import type { VerifiedIdentity } from "./bootstrap";
import { upsertUserOnLogin } from "./bootstrap";
import { createSession } from "./session";

interface DevLoginEnv {
  nodeEnv: string;
  allowFirstLoginAdmin: boolean;
  workspaceDomain: string;
}

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

export async function devLoginCore(
  rawEmail: unknown,
  deps: DevLoginDeps,
): Promise<Result<DevLoginOk, string>> {
  const { db, appEnv, signal } = deps;

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
    preferredUsername: null,
    avatarUrl: null,
  };

  const upsertResult = await upsertUserOnLogin(db, { provider: "dev", identity }, signal);
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
