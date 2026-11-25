import { NextResponse } from "next/server";
import { env } from "@/config/env";
import type { Db } from "@/db/client";
import { err, ok, type Result } from "@/types/result";
import { CSRF_COOKIE, mintCsrfToken } from "./csrf";
import { createSession, SESSION_COOKIE, sessionCookieOptions } from "./session";

export async function finishLogin(args: {
  db: Db;
  userId: string;
  returnPath: string;
  signal: AbortSignal;
}): Promise<Result<NextResponse, "session_failed">> {
  const sessionResult = await createSession(args.db, args.userId, args.signal);
  if (sessionResult.ok === false) return err("session_failed");
  args.signal.throwIfAborted();

  const { sid, expiresAt } = sessionResult.value;
  const res = NextResponse.redirect(new URL(args.returnPath, env.BASE_URL));
  res.cookies.set(SESSION_COOKIE, sid, { ...sessionCookieOptions(), expires: expiresAt });
  res.cookies.set(CSRF_COOKIE, mintCsrfToken(), {
    httpOnly: false,
    secure: true,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
  return ok(res);
}
