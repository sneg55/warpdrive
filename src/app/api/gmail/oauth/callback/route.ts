import { sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/config/env";
import { TEAM_MAILBOX_INTENT_PREFIX } from "@/constants/teamMailbox";
import { gmailOAuthDeps } from "@/features/email/gmailOAuthHttp";
import { exchangeAndBind, GMAIL_OAUTH_STATE_COOKIE, stateMatches } from "@/features/email/oauth";
import { enqueueInitialSync } from "@/features/email/syncScheduling";
import { exchangeTeamMailbox } from "@/features/email/teamMailboxConnect";
import { consumeTeamMailboxIntent } from "@/features/email/teamMailboxIntent";
import { createContext } from "@/server/trpc/context";

const querySchema = z.object({ code: z.string().min(1), state: z.string().min(1) });

function redirect(status: "ok" | "error"): NextResponse {
  return NextResponse.redirect(new URL(`/inbox?connect=${status}`, env.BASE_URL));
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const signal = AbortSignal.timeout(10_000);
  const ctx = await createContext();
  if (ctx.session === null) {
    return NextResponse.redirect(new URL("/login", env.BASE_URL));
  }

  const parsed = querySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) return redirect("error");

  const jar = await cookies();
  const stateCookie = jar.get(GMAIL_OAUTH_STATE_COOKIE)?.value;
  jar.delete(GMAIL_OAUTH_STATE_COOKIE);
  if (!stateMatches(parsed.data.state, stateCookie)) return redirect("error");

  try {
    const userRes = await ctx.db.execute(
      sql`SELECT email FROM users WHERE id = ${ctx.session.userId}`,
    );
    signal.throwIfAborted();
    const userRow = userRes.rows[0] as { email: string } | undefined;
    if (userRow === undefined) return redirect("error");

    const intent = await consumeTeamMailboxIntent(
      ctx.db,
      parsed.data.state,
      ctx.session.sessionId,
      signal,
    );
    if (parsed.data.state.startsWith(TEAM_MAILBOX_INTENT_PREFIX) && intent === null)
      return redirect("error");
    const bindArgs = {
      signal,
      db: ctx.db,
      code: parsed.data.code,
      sessionUserId: ctx.session.userId,
      sessionEmail: userRow.email,
      deps: gmailOAuthDeps,
    };
    const r =
      intent === null
        ? await exchangeAndBind(bindArgs)
        : await exchangeTeamMailbox({
            ...bindArgs,
            actorId: ctx.session.userId,
            backfillDays: intent.backfillDays,
          });

    if (r.ok) await startSync(r.value.accountId, signal);

    if (intent !== null && r.ok)
      return NextResponse.redirect(
        new URL(`/settings/team-mailboxes?mailbox=${r.value.accountId}`, env.BASE_URL),
      );
    return redirect(r.ok ? "ok" : "error");
  } catch (e) {
    signal.throwIfAborted();
    console.error(
      "[gmail/oauth/callback] connect failed:",
      e instanceof Error ? e.name : "unknown",
    );
    return redirect("error");
  }
}

async function startSync(accountId: string, signal: AbortSignal): Promise<void> {
  try {
    await enqueueInitialSync(accountId);
    signal.throwIfAborted();
  } catch (e) {
    signal.throwIfAborted();
    console.error(
      "[gmail/oauth/callback] initial sync enqueue failed:",
      e instanceof Error ? e.name : "unknown",
    );
  }
}
