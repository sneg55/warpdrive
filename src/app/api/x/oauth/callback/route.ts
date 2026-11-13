import { cookies } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { env } from "@/config/env";
import { X_OAUTH_INTENT_PREFIX, X_OAUTH_STATE_COOKIE } from "@/constants/xDms";
import { stateMatches } from "@/features/email/oauth";
import { xClientFromEnv } from "@/features/x-dms/clientFromEnv";
import { completeXConnect } from "@/features/x-dms/connect";
import { enqueueXSyncNow } from "@/features/x-dms/enqueue";
import { consumeXOAuthIntent } from "@/features/x-dms/oauthIntent";
import { createContext } from "@/server/trpc/context";

const querySchema = z.object({ code: z.string().min(1), state: z.string().min(1) });
const CALLBACK_TIMEOUT_MS = 10_000;

function redirect(status: "ok" | "error"): NextResponse {
  return NextResponse.redirect(new URL(`/settings/team-mailboxes?x=${status}`, env.BASE_URL));
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const signal = AbortSignal.timeout(CALLBACK_TIMEOUT_MS);
  const ctx = await createContext();
  if (ctx.session === null) return NextResponse.redirect(new URL("/login", env.BASE_URL));

  const parsed = querySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  const jar = await cookies();
  const stateCookie = jar.get(X_OAUTH_STATE_COOKIE)?.value;
  jar.delete(X_OAUTH_STATE_COOKIE);
  const client = xClientFromEnv();
  if (
    !parsed.success ||
    client === null ||
    !parsed.data.state.startsWith(X_OAUTH_INTENT_PREFIX) ||
    !stateMatches(parsed.data.state, stateCookie)
  )
    return redirect("error");

  try {
    const intent = await consumeXOAuthIntent(
      ctx.db,
      parsed.data.state,
      ctx.session.sessionId,
      signal,
    );
    if (intent === null) return redirect("error");
    const connected = await completeXConnect(
      ctx.db,
      client,
      { actorId: ctx.session.userId, code: parsed.data.code, codeVerifier: intent.codeVerifier },
      signal,
    );
    if (!connected.ok) return redirect("error");
    await startSync(signal);
    return redirect("ok");
  } catch (e) {
    signal.throwIfAborted();
    console.error("[x/oauth/callback] connect failed:", e instanceof Error ? e.name : "unknown");
    return redirect("error");
  }
}

async function startSync(signal: AbortSignal): Promise<void> {
  try {
    await enqueueXSyncNow(signal);
  } catch (e) {
    signal.throwIfAborted();
    console.error(
      "[x/oauth/callback] initial sync enqueue failed:",
      e instanceof Error ? e.name : "unknown",
    );
  }
}
