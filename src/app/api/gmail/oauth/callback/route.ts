/**
 * /api/gmail/oauth/callback: Gmail OAuth2 callback.
 *
 * Security core: the mailbox is bound to the signed-in user only when the Google
 * identity is verified, in our workspace domain, and addresses the same account.
 * The session gives userId only; the route loads that user's email itself and
 * passes it as sessionEmail so exchangeAndBind can enforce the binding rule.
 *
 * Login-CSRF: the `state` from the query MUST match the single-use, HttpOnly
 * gmail_oauth_state cookie (constant-time compare). The cookie is cleared after use.
 *
 * No token is ever logged. A thrown AppError/AbortError maps to the error redirect.
 */

import { sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/config/env";
import { AppError } from "@/constants/errorIds";
import { tokenResponseSchema } from "@/features/email/gmailSchemas";
import { exchangeAndBind, GMAIL_OAUTH_STATE_COOKIE, stateMatches } from "@/features/email/oauth";
import { enqueueInitialSync } from "@/features/email/syncScheduling";
import { createContext } from "@/server/trpc/context";
import { err, ok } from "@/types/result";

const querySchema = z.object({ code: z.string().min(1), state: z.string().min(1) });

// Google userinfo response; hd may be absent for non-workspace accounts.
const userinfoSchema = z.object({
  email: z.string(),
  email_verified: z.boolean(),
  hd: z.string().nullable().default(null),
});

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";

function redirect(status: "ok" | "error"): NextResponse {
  return NextResponse.redirect(new URL(`/inbox?connect=${status}`, env.BASE_URL));
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const signal = AbortSignal.timeout(10_000);
  const ctx = await createContext();
  if (ctx.session === null) {
    return NextResponse.redirect(new URL("/login", env.BASE_URL));
  }

  // Validate the redirect inputs at the boundary.
  const parsed = querySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) return redirect("error");

  // Login-CSRF: the state must match the single-use cookie. Clear it regardless of
  // outcome so it cannot be replayed.
  const jar = await cookies();
  const stateCookie = jar.get(GMAIL_OAUTH_STATE_COOKIE)?.value;
  jar.delete(GMAIL_OAUTH_STATE_COOKIE);
  if (!stateMatches(parsed.data.state, stateCookie)) return redirect("error");

  try {
    // The session carries userId only; load the signed-in user's own email so the
    // binding check compares the Gmail identity against the right account.
    const userRes = await ctx.db.execute(
      sql`SELECT email FROM users WHERE id = ${ctx.session.userId}`,
    );
    const userRow = userRes.rows[0] as { email: string } | undefined;
    if (userRow === undefined) return redirect("error");

    const r = await exchangeAndBind({
      db: ctx.db,
      code: parsed.data.code,
      sessionUserId: ctx.session.userId,
      sessionEmail: userRow.email,
      deps: {
        exchangeCode: async (code) => {
          const res = await fetch(GOOGLE_TOKEN_URL, {
            method: "POST",
            headers: { "content-type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              code,
              client_id: env.GOOGLE_OAUTH_CLIENT_ID,
              client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET,
              redirect_uri: `${env.BASE_URL}/api/gmail/oauth/callback`,
              grant_type: "authorization_code",
            }),
            signal,
          });
          signal.throwIfAborted();
          if (!res.ok) {
            return err(
              new AppError("E_GMAIL_001", "token exchange failed", { status: res.status }),
            );
          }
          const t = tokenResponseSchema.safeParse(await res.json());
          if (!t.success) {
            return err(new AppError("E_GMAIL_001", "token response failed validation", {}));
          }
          if (t.data.refresh_token === undefined) {
            return err(new AppError("E_AUTH_001", "no refresh token returned", {}));
          }
          return ok({
            accessToken: t.data.access_token,
            refreshToken: t.data.refresh_token,
            scopes: (t.data.scope ?? "").split(" ").filter((s) => s.length > 0),
          });
        },
        fetchIdentity: async (accessToken) => {
          const res = await fetch(GOOGLE_USERINFO_URL, {
            headers: { Authorization: `Bearer ${accessToken}` },
            signal,
          });
          signal.throwIfAborted();
          if (!res.ok) {
            return err(new AppError("E_GMAIL_001", "userinfo failed", { status: res.status }));
          }
          const u = userinfoSchema.safeParse(await res.json());
          if (!u.success) {
            return err(new AppError("E_GMAIL_001", "userinfo failed validation", {}));
          }
          return ok({ email: u.data.email, emailVerified: u.data.email_verified, hd: u.data.hd });
        },
      },
    });

    // Seed the sync chain for the just-connected mailbox. The worker only starts per-mailbox
    // sync at its own boot, so a mailbox connected while the worker is already running would
    // otherwise never sync. A failed enqueue must NOT flip a successful bind to error (the
    // mailbox IS connected); log the class and let the connect succeed.
    if (r.ok) {
      try {
        await enqueueInitialSync(r.value.accountId);
      } catch (e) {
        console.error(
          "[gmail/oauth/callback] initial sync enqueue failed:",
          e instanceof Error ? e.name : "unknown",
        );
      }
    }

    return redirect(r.ok ? "ok" : "error");
  } catch (e) {
    // Single boundary for genuinely unexpected throws (AppError, AbortError, infra).
    // Never swallow silently and never store a token on abort: log the class only
    // (never token contents) and fail closed to the error redirect.
    console.error(
      "[gmail/oauth/callback] connect failed:",
      e instanceof Error ? e.name : "unknown",
    );
    return redirect("error");
  }
}
